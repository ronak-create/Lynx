"""Documentary generator.

Builds a long-form markdown document from the run's category results. Every known
entity name in the text becomes an Obsidian-style wiki-link `[[Name|entity:<id>]]`
that the frontend renders as a link cross-highlighted with the graph.

Template mode works with zero LLM calls; when an LLM is available it additionally
writes a narrative "History & Trajectory" and an "Analysis" section.
"""
import re

from sqlalchemy import select

from app.db.engine import get_session
from app.db.models import CategoryResult, Edge, Entity
from app.llm.client import LLMClient
from app.sources import wikipedia


def _linkable_entities(root_entity_id: str) -> list[tuple[str, str]]:
    """(name, id) for the root and everything within 1 hop, longest names first."""
    with get_session() as session:
        edges = session.scalars(
            select(Edge).where((Edge.src_id == root_entity_id) | (Edge.dst_id == root_entity_id))
        ).all()
        ids = {root_entity_id}
        for e in edges:
            ids.add(e.src_id)
            ids.add(e.dst_id)
        entities = session.scalars(select(Entity).where(Entity.id.in_(ids))).all()
    pairs = [(e.name, e.id) for e in entities if len(e.name) >= 3]
    return sorted(pairs, key=lambda p: -len(p[0]))


def autolink(markdown: str, entities: list[tuple[str, str]], skip_first_h1: bool = True) -> str:
    """Wrap first occurrence per paragraph of each entity name in [[Name|entity:id]]."""
    linked_ids: set[str] = set()

    for name, eid in entities:
        if eid in linked_ids:
            continue
        pattern = re.compile(rf"(?<![\[\w|]){re.escape(name)}(?![\]\w|])")

        def repl(m: re.Match) -> str:
            linked_ids.add(eid)
            return f"[[{m.group(0)}|entity:{eid}]]"

        # link at most 3 occurrences of each name across the doc
        markdown = pattern.sub(repl, markdown, count=3)
    return markdown


def _fmt_money(v: float) -> str:
    for unit, div in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
        if abs(v) >= div:
            return f"${v / div:.1f}{unit}"
    return f"${v:,.0f}"


def _template_sections(name: str, results: dict[str, dict]) -> list[str]:
    parts: list[str] = []
    ov = results.get("overview", {})
    prof_what = (results.get("profile", {}) or {}).get("what_they_do") or ""
    summary = ov.get("summary") or ""
    # skip Background when it just echoes the profile's "What They Do" (small businesses,
    # where the overview summary was seeded from the site profile)
    if summary and summary[:60] != prof_what[:60]:
        parts.append(f"## Background\n\n{summary}")
    if ov.get("facts"):
        rows = "\n".join(f"- **{f['predicate'].replace('_', ' ').title()}**: {f['text']}" for f in ov["facts"])
        parts.append(f"## Key Facts\n\n{rows}")

    fin = results.get("financials", {})
    if fin.get("revenue_series"):
        rows = "\n".join(
            f"| FY{fy} | {_fmt_money(rev)} |" for fy, rev in fin["revenue_series"]
        )
        parts.append(f"## Financial Growth\n\nAnnual revenue (SEC filings):\n\n| Fiscal year | Revenue |\n|---|---|\n{rows}")
    elif fin.get("wikidata_revenue"):
        parts.append(f"## Financials\n\nReported revenue (Wikidata): {fin['wikidata_revenue']}. "
                     "The company appears to be privately held, so no SEC filings are available.")

    stock = results.get("stock", {})
    if stock.get("available"):
        parts.append(
            f"## Market\n\n{name} trades as **{stock['ticker']}** at {stock['price']} {stock.get('currency') or ''} "
            f"(52-week range {stock.get('fifty_two_week_low')}–{stock.get('fifty_two_week_high')})."
        )

    people = results.get("people", {}).get("people", [])
    if people:
        rows = "\n".join(f"- {p['name']} — {p['role'].replace('_', ' ')}" for p in people[:12])
        parts.append(f"## Key People\n\n{rows}")

    products = results.get("products", {}).get("products", [])
    if products:
        rows = ", ".join(p["name"] for p in products)
        parts.append(f"## Products\n\n{rows}.")

    prof = results.get("profile", {})
    if prof.get("available") and (prof.get("what_they_do") or prof.get("offerings")):
        lines = []
        if prof.get("what_they_do"):
            lines.append(prof["what_they_do"])
        meta = []
        if prof.get("business_model"):
            meta.append(f"**Model:** {prof['business_model']}")
        if prof.get("target_market"):
            meta.append(f"**Market:** {prof['target_market']}")
        if prof.get("headquarters"):
            meta.append(f"**HQ:** {prof['headquarters']}")
        if meta:
            lines.append(" · ".join(meta))
        if prof.get("offerings"):
            lines.append("**Offerings:** " + ", ".join(prof["offerings"][:12]) + ".")
        parts.append("## What They Do\n\n" + "\n\n".join(lines))

    fund = results.get("funding", {})
    if fund.get("is_funded") or fund.get("rounds") or fund.get("investors"):
        bits = []
        if fund.get("total_raised"):
            bits.append(f"Total raised: **{fund['total_raised']}**.")
        if fund.get("valuation"):
            bits.append(f"Valuation: **{fund['valuation']}**.")
        if fund.get("investors"):
            bits.append("Investors: " + ", ".join(fund["investors"][:12]) + ".")
        if fund.get("rounds"):
            rounds = "\n".join(
                f"- {r.get('stage') or 'Round'}"
                + (f" — {r['amount']}" if r.get("amount") else "")
                + (f" ({r['date']})" if r.get("date") else "")
                for r in fund["rounds"][:8]
            )
            bits.append(rounds)
        parts.append("## Funding\n\n" + "\n\n".join(bits))

    comp = results.get("competitors", {}).get("competitors", [])
    if comp:
        rows = "\n".join(f"- {c['name']}" + (f" — {c['reason']}" if c.get("reason") else "") for c in comp)
        parts.append(f"## Competitive Landscape\n\n{rows}")

    news_data = results.get("news", {})
    articles = news_data.get("articles", [])[:10]
    if articles:
        tone = news_data.get("tone_summary", {})
        rows = "\n".join(
            f"- [{a['title']}]({a['url']})" + (f" ({a['published_at']})" if a.get("published_at") else "")
            for a in articles
        )
        parts.append(
            f"## Recent Coverage\n\nTone split: {tone.get('positive', 0)} positive / "
            f"{tone.get('negative', 0)} negative / {tone.get('neutral', 0)} neutral.\n\n{rows}"
        )

    social = results.get("social", {})
    social_posts = social.get("posts", [])
    if social_posts:
        tone = social.get("tone_summary", {})
        rows = "\n".join(
            f"- [{p['title']}]({p['url']})" for p in social_posts[:8] if p.get("title") and p.get("url")
        )
        parts.append(
            f"## Community Discussion\n\nSentiment: {tone.get('positive', 0)} positive / "
            f"{tone.get('negative', 0)} negative / {tone.get('neutral', 0)} neutral.\n\n{rows}"
        )

    web = results.get("web_presence", {})
    if web.get("links"):
        rows = "\n".join(f"- {l['label']}: {l['url']}" for l in web["links"])
        parts.append(f"## Web Presence\n\n{rows}")
    if web.get("languages"):
        parts.append("## Technology Signals\n\nPublic repositories suggest use of: " + ", ".join(web["languages"]) + ".")
    return parts


def _facts_context(name: str, root: dict, results: dict[str, dict]) -> tuple[str, int]:
    """Assemble ONLY the facts Lynx actually gathered, as grounding for the LLM.
    Returns (context_text, fact_count). The LLM is told to use nothing beyond this."""
    lines: list[str] = []
    if root.get("description"):
        lines.append(f"Description: {root['description']}")
    prof = results.get("profile", {})
    if prof.get("what_they_do"):
        lines.append(f"What they do (from their site): {prof['what_they_do']}")
    if prof.get("business_model"):
        lines.append(f"Business model: {prof['business_model']}")
    if prof.get("target_market"):
        lines.append(f"Target market: {prof['target_market']}")
    if prof.get("offerings"):
        lines.append("Offerings: " + ", ".join(prof["offerings"][:12]))
    stock = results.get("stock", {})
    if stock.get("available"):
        lines.append(f"Stock: trades as {stock.get('ticker')} at {stock.get('price')} {stock.get('currency') or ''}")
    fin = results.get("financials", {})
    if fin.get("revenue_series"):
        last = fin["revenue_series"][-1]
        lines.append(f"Latest annual revenue (SEC): FY{last[0]} {_fmt_money(last[1])}")
    fund = results.get("funding", {})
    if fund.get("total_raised"):
        lines.append(f"Total funding raised: {fund['total_raised']}")
    if fund.get("valuation"):
        lines.append(f"Valuation: {fund['valuation']}")
    if fund.get("investors"):
        lines.append("Investors: " + ", ".join(fund["investors"][:10]))
    people = results.get("people", {}).get("people", [])
    if people:
        lines.append("Key people: " + ", ".join(f"{p['name']} ({p['role'].replace('_', ' ')})" for p in people[:8]))
    products = results.get("products", {}).get("products", [])
    if products:
        lines.append("Products: " + ", ".join(p["name"] for p in products[:12]))
    comp = results.get("competitors", {}).get("competitors", [])
    if comp:
        lines.append("Competitors: " + ", ".join(c["name"] for c in comp[:10]))
    news = results.get("news", {}).get("articles", [])
    if news:
        lines.append("Recent headlines:\n" + "\n".join(f"  - {a['title']}" for a in news[:12]))
    social = results.get("social", {}).get("posts", [])
    if social:
        lines.append("Community discussion titles:\n" + "\n".join(f"  - {p['title']}" for p in social[:10]))
    return "\n".join(lines), len(lines)


async def generate_documentary(
    job_id: str, root: dict, llm: LLMClient, results: dict[str, dict] | None = None
) -> tuple[str, str]:
    # Prefer the in-memory results the orchestrator collected (race-free); fall back to
    # the DB when regenerating a documentary outside a live run.
    if results is None:
        with get_session() as session:
            rows = session.scalars(select(CategoryResult).where(CategoryResult.job_id == job_id)).all()
        results = {r.category: r.payload for r in rows if r.status == "completed"}
    name = root["name"]

    sections = [f"# {name}: A Research Documentary"]
    # subtitle tagline — but not when the "What They Do" section already covers it
    prof_what = (results.get("profile", {}) or {}).get("what_they_do") or ""
    desc = root.get("description") or ""
    if desc and desc[:60] != prof_what[:60]:
        sections.append(f"*{desc}*")

    facts_context, fact_count = _facts_context(name, root, results)
    # Anti-fabrication contract shared by every generative section.
    GROUNDING = (
        "CRITICAL: Base every statement ONLY on the facts provided below. Do NOT invent or estimate "
        "anything not present — no stock prices, funding amounts, valuations, revenue, acquisitions, "
        "partnerships, dates, or metrics unless they appear in the facts. If the facts are limited, "
        "write a short, honest section that says the available public information is limited rather "
        "than padding with generic claims. Never write numbers you were not given."
    )

    method = "template"
    # Grounded overview/history: prefer Wikipedia; else write from the gathered facts.
    if llm.available and root.get("wikipedia_title"):
        text = await wikipedia.full_text(root["wikipedia_title"], max_chars=14000)
        history = await llm.generate(
            "You write concise, factual company histories in markdown. Neutral tone; include both "
            "successes and controversies/criticism when present in the source. 3-6 paragraphs, "
            "with '## History & Trajectory' as the heading. No preamble. "
            "Use only the source material; do not invent facts.",
            f"Source material about {name}:\n\n{text or root.get('description') or name}",
            max_tokens=1200,
        )
        if history:
            sections.append(history)
            method = "llm"

    sections.extend(_template_sections(name, results))

    # Analyst Take — only when there is enough real data to say something grounded.
    if llm.available and fact_count >= 3:
        analysis = await llm.generate(
            "You are a business analyst. Write a short markdown section headed '## Analyst Take' — "
            "1-3 paragraphs on what the company does, its momentum, and open questions, drawn strictly "
            f"from the facts. Neutral, specific to THIS company, no preamble.\n\n{GROUNDING}",
            f"Company: {name}\n\nFacts gathered by the research pipeline:\n{facts_context}",
            max_tokens=700,
        )
        if analysis:
            sections.append(analysis)
            method = "llm"
    elif fact_count < 3:
        # Data-poor entity (e.g. a small private company with only a website): be honest.
        sections.append(
            "## Note\n\nLynx found limited public information about "
            f"{name}. The sections above reflect everything that could be sourced; "
            "there was not enough public data to write a fuller analysis."
        )

    markdown = "\n\n".join(sections)
    markdown = autolink(markdown, _linkable_entities(root["entity_id"]))
    return markdown, method
