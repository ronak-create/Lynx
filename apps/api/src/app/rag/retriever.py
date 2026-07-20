"""A small, dependency-light RAG over a single research run.

The "documents" are the run's own outputs — the generated documentary plus each category's
structured result — chunked into short passages. Retrieval is lexical (rapidfuzz), so there's
no embedding model or vector store to run; the corpus per run is tiny, so this is plenty.
The LLM then answers grounded strictly in the retrieved passages, and when no LLM is
configured we fall back to returning the top passages extractively."""
import logging

from rapidfuzz import fuzz
from sqlalchemy import select

from app.db.engine import get_session
from app.db.models import CategoryResult, Document, Entity, Job
from app.llm.client import LLMClient

log = logging.getLogger(__name__)


def _fmt_money(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    for unit, div in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
        if abs(v) >= div:
            return f"${v / div:.1f}{unit}"
    return f"${v:,.0f}"


def _category_chunks(cat: str, p: dict) -> list[str]:
    """Readable passages for one category's payload — the structured facts, so answers can cite
    specifics (score, revenue, tech stack…) that the prose documentary may not spell out."""
    out: list[str] = []
    if cat == "overview" and p.get("facts"):
        out.append("Key facts: " + "; ".join(f"{f['predicate'].replace('_', ' ')}: {f['text']}" for f in p["facts"]))
    elif cat == "profile" and p.get("available"):
        bits = [p.get("what_they_do", "")]
        if p.get("business_model"):
            bits.append(f"Business model: {p['business_model']}.")
        if p.get("target_market"):
            bits.append(f"Target market: {p['target_market']}.")
        if p.get("offerings"):
            bits.append("Offerings: " + ", ".join(p["offerings"][:12]) + ".")
        out.append(" ".join(b for b in bits if b))
    elif cat == "legitimacy":
        line = f"Legitimacy score {p.get('score')}/100 ({p.get('verdict')})."
        if p.get("assessment"):
            line += " " + p["assessment"]
        if p.get("flags"):
            line += " Risk flags: " + "; ".join(p["flags"]) + "."
        if p.get("corroboration"):
            line += " Corroborated by: " + ", ".join(p["corroboration"]) + "."
        out.append(line)
    elif cat == "signals" and p.get("available"):
        if p.get("tech"):
            out.append("Detected tech stack: " + ", ".join(t["name"] for t in p["tech"]) + ".")
        if p.get("hiring", {}).get("available"):
            h = p["hiring"]
            out.append(f"Actively hiring: {h['open_roles']} open roles via {h['source']}.")
        if p.get("reviews", {}).get("available"):
            r = p["reviews"]
            out.append(f"Customer reviews: {r['rating']}/5 on {r['source']} ({r.get('count')} reviews).")
    elif cat == "stock" and p.get("available"):
        out.append(f"Stock {p.get('ticker')}: {p.get('price')} {p.get('currency', '')}, "
                   f"market cap {_fmt_money(p.get('market_cap'))}.")
    elif cat == "financials" and p.get("revenue_series"):
        rows = "; ".join(f"FY{fy} {_fmt_money(v)}" for fy, v in p["revenue_series"])
        out.append(f"Annual revenue (SEC filings): {rows}.")
    elif cat == "funding" and (p.get("total_raised") or p.get("rounds")):
        bits = []
        if p.get("total_raised"):
            bits.append(f"Total raised {p['total_raised']}.")
        if p.get("valuation"):
            bits.append(f"Valuation {p['valuation']}.")
        if p.get("investors"):
            bits.append("Investors: " + ", ".join(p["investors"][:10]) + ".")
        out.append(" ".join(bits))
    elif cat == "people" and p.get("people"):
        out.append("Key people: " + ", ".join(f"{x['name']} ({x['role'].replace('_', ' ')})" for x in p["people"][:12]) + ".")
    elif cat == "products" and p.get("products"):
        out.append("Products: " + ", ".join(x["name"] for x in p["products"][:15]) + ".")
    elif cat == "competitors" and p.get("competitors"):
        out.append("Competitors: " + ", ".join(c["name"] for c in p["competitors"][:12]) + ".")
    elif cat == "news" and p.get("articles"):
        out.append("Recent headlines: " + " | ".join(a["title"] for a in p["articles"][:8]) + ".")
    elif cat == "social" and p.get("posts"):
        out.append("Community discussion: " + " | ".join(x["title"] for x in p["posts"][:6] if x.get("title")) + ".")
    elif cat == "synthesis":
        if p.get("scorecard"):
            out.append("Scorecard: " + "; ".join(f"{c['label']} {c['value']}" for c in p["scorecard"]) + ".")
        swot = p.get("swot") or {}
        for quad in ("strengths", "weaknesses", "opportunities", "threats"):
            if swot.get(quad):
                out.append(f"{quad.title()}: " + "; ".join(swot[quad]) + ".")
    return [c for c in out if c and c.strip()]


def build_corpus(job_id: str) -> tuple[str, list[dict]]:
    """Returns (entity_name, chunks) where each chunk is {label, text}."""
    chunks: list[dict] = []
    with get_session() as session:
        job = session.get(Job, job_id)
        if job is None:
            return "", []
        entity = session.get(Entity, job.entity_id) if job.entity_id else None
        name = entity.name if entity else job.query

        doc = session.scalar(
            select(Document).where(Document.job_id == job_id).order_by(Document.created_at.desc())
        )
        if doc:
            for para in doc.markdown.split("\n\n"):
                para = para.strip()
                if len(para) >= 60 and not para.startswith("#"):
                    chunks.append({"label": "Documentary", "text": para})

        for r in session.scalars(select(CategoryResult).where(CategoryResult.job_id == job_id)).all():
            if r.status != "completed":
                continue
            for text in _category_chunks(r.category, r.payload or {}):
                chunks.append({"label": r.category.replace("_", " ").title(), "text": text})

        if entity and entity.summary:
            chunks.append({"label": "Overview", "text": entity.summary})
    return name, chunks


def retrieve(chunks: list[dict], question: str, k: int = 6) -> list[dict]:
    scored = []
    for c in chunks:
        s = fuzz.token_set_ratio(question, c["text"]) + 0.25 * fuzz.partial_ratio(question.lower(), c["label"].lower())
        scored.append((s, c))
    scored.sort(key=lambda t: t[0], reverse=True)
    seen: set[str] = set()
    top: list[dict] = []
    for _, c in scored:
        key = c["text"][:80]
        if key in seen:
            continue
        seen.add(key)
        top.append(c)
        if len(top) >= k:
            break
    return top


async def answer_question(
    llm: LLMClient, name: str, question: str, hits: list[dict], history: list[dict] | None = None
) -> tuple[str, bool]:
    """(answer_text, grounded). grounded=True when the reply is backed by retrieved passages."""
    if not hits:
        return f"I don't have research data on {name} to answer that yet.", False

    context = "\n".join(f"[{i + 1}] ({h['label']}) {h['text']}" for i, h in enumerate(hits))

    if llm.available:
        convo = ""
        if history:
            convo = "\n".join(f"{m['role']}: {m['content']}" for m in history[-4:]) + "\n"
        answer = await llm.generate(
            f"You are a research assistant answering questions about {name}. Use ONLY the numbered "
            "context passages from this company's research dossier. Be concise and specific, and "
            "cite passage numbers like [2] for the facts you use. If the answer isn't in the "
            "context, say you don't have that information — never invent figures.",
            f"{convo}Question: {question}\n\nContext passages:\n{context}",
            max_tokens=500,
        )
        if answer:
            return answer.strip(), True

    # degraded (no LLM): return the most relevant passages verbatim
    extract = "\n\n".join(f"• {h['text']}" for h in hits[:3])
    return f"Here's what the research found relevant to that:\n\n{extract}", False
