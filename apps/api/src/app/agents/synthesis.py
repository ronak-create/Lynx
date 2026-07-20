"""Synthesis layer — the executive view built AFTER every other agent finishes.

It doesn't fetch anything new; it reads the run's collected category results and distils them
into three structured artifacts:
  * scorecard  — the handful of numbers that define the company, with derived context
                 (e.g. revenue YoY growth) the individual cards don't compute.
  * SWOT       — strengths / weaknesses / opportunities / threats. LLM-written when a model is
                 available, otherwise derived deterministically from the same signals.
  * timeline   — every dated event across funding, filings, news, patents and founding, merged
                 and sorted newest-first.

Runs like the documentary: outside the agent TaskGroup, with the in-memory `results` so it
never races the DB."""
import logging

from pydantic import BaseModel, Field

from app.llm.client import LLMClient

log = logging.getLogger(__name__)

category = "synthesis"


class Swot(BaseModel):
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    threats: list[str] = Field(default_factory=list)


def _fmt_money(v: float) -> str:
    a = abs(v)
    for unit, div in (("T", 1e12), ("B", 1e9), ("M", 1e6)):
        if a >= div:
            return f"${v / div:.1f}{unit}"
    return f"${v:,.0f}"


def _facts(results: dict) -> dict[str, str]:
    ov = results.get("overview", {}) or {}
    return {f.get("predicate"): f.get("text") for f in ov.get("facts", []) if isinstance(f, dict)}


def _scorecard(root: dict, results: dict) -> list[dict]:
    facts = _facts(results)
    profile = results.get("profile", {}) or {}
    legit = results.get("legitimacy", {}) or {}
    stock = results.get("stock", {}) or {}
    fin = results.get("financials", {}) or {}
    funding = results.get("funding", {}) or {}
    patents = results.get("patents", {}) or {}
    news = results.get("news", {}) or {}
    competitors = results.get("competitors", {}) or {}

    cards: list[dict] = []

    def add(label: str, value, sub: str | None = None) -> None:
        if value not in (None, "", 0):
            cards.append({"label": label, "value": str(value), "sub": sub})

    if legit.get("score") is not None:
        add("Legitimacy", f"{legit['score']}/100", legit.get("verdict"))
    add("Founded", profile.get("founded") or facts.get("founded"))
    add("Employees", facts.get("employees"))
    add("Headquarters", profile.get("headquarters") or facts.get("hq"))

    if stock.get("available"):
        add("Share price", f"{stock.get('price')} {stock.get('currency', '')}".strip(),
            f"${stock['ticker']}" if stock.get("ticker") else None)
        if stock.get("market_cap"):
            add("Market cap", _fmt_money(float(stock["market_cap"])))

    rev = fin.get("revenue_series") or []
    if rev:
        fy, val = rev[-1]
        sub = None
        if len(rev) >= 2 and rev[-2][1]:
            growth = (val - rev[-2][1]) / abs(rev[-2][1]) * 100
            sub = f"{growth:+.0f}% YoY"
        add("Revenue", _fmt_money(float(val)), sub or f"FY{fy}")

    add("Total raised", funding.get("total_raised"))
    add("Valuation", funding.get("valuation"))
    if patents.get("count"):
        add("Patents", patents["count"])

    tone = news.get("tone_summary") or {}
    if tone and (tone.get("positive") or tone.get("negative")):
        add("News sentiment", f"+{tone.get('positive', 0)} / -{tone.get('negative', 0)}", "recent coverage")

    comps = competitors.get("competitors") or []
    if comps:
        add("Competitors", len(comps), "tracked")
    return cards


def _timeline(results: dict) -> list[dict]:
    events: list[dict] = []

    def norm(d) -> str | None:
        if not d:
            return None
        s = str(d).strip()
        return s[:10] if len(s) >= 4 else None

    profile = results.get("profile", {}) or {}
    founded = profile.get("founded") or _facts(results).get("founded")
    if founded:
        events.append({"date": norm(founded), "label": "Company founded", "kind": "founding"})

    for r in (results.get("funding", {}) or {}).get("rounds", []) or []:
        if r.get("date"):
            amt = f" — {r['amount']}" if r.get("amount") else ""
            events.append({"date": norm(r["date"]), "label": f"{r.get('stage') or 'Funding round'}{amt}", "kind": "funding"})

    for f in ((results.get("financials", {}) or {}).get("filings", []) or [])[:6]:
        if f.get("filed_at"):
            events.append({"date": norm(f["filed_at"]), "label": f"SEC {f.get('form', 'filing')} filed", "kind": "filing"})

    for a in (results.get("news", {}) or {}).get("articles", [])[:8]:
        if a.get("published_at"):
            events.append({"date": norm(a["published_at"]), "label": a.get("title", "News"), "kind": "news"})

    for p in (results.get("patents", {}) or {}).get("patents", [])[:4]:
        if p.get("date"):
            events.append({"date": norm(p["date"]), "label": f"Patent: {p.get('title', '')}"[:90], "kind": "patent"})

    dated = [e for e in events if e["date"]]
    dated.sort(key=lambda e: e["date"], reverse=True)
    return dated[:20]


def _template_swot(root: dict, results: dict) -> Swot:
    """Honest, signal-derived SWOT when no LLM is available."""
    legit = results.get("legitimacy", {}) or {}
    fin = results.get("financials", {}) or {}
    funding = results.get("funding", {}) or {}
    patents = results.get("patents", {}) or {}
    news = results.get("news", {}) or {}
    profile = results.get("profile", {}) or {}
    competitors = (results.get("competitors", {}) or {}).get("competitors", []) or []
    tone = news.get("tone_summary") or {}

    s, w, o, t = [], [], [], []

    if (legit.get("score") or 0) >= 75:
        s.append(f"Strong legitimacy signals ({legit['score']}/100) — {legit.get('verdict', '').lower()}")
    elif legit.get("score") is not None and legit["score"] < 50:
        w.append(f"Thin trust footprint ({legit['score']}/100)")
    for corr in legit.get("corroboration", []):
        s.append(f"Independently corroborated ({corr})")

    rev = fin.get("revenue_series") or []
    if len(rev) >= 2 and rev[-2][1]:
        growth = (rev[-1][1] - rev[-2][1]) / abs(rev[-2][1]) * 100
        (s if growth >= 0 else w).append(
            f"Revenue {'growing' if growth >= 0 else 'declining'} {growth:+.0f}% YoY (FY{rev[-1][0]})"
        )

    if funding.get("total_raised"):
        s.append(f"Capitalised — {funding['total_raised']} raised")
    if patents.get("count"):
        s.append(f"{patents['count']} patents on file (defensible IP)")
    if profile.get("offerings"):
        s.append(f"Diversified offering ({len(profile['offerings'])} products/services)")

    if tone.get("negative", 0) > tone.get("positive", 0):
        t.append("Recent press skews negative")
    elif tone.get("positive", 0):
        o.append("Positive press momentum")

    if competitors:
        t.append(f"Competitive market — {len(competitors)} named rivals")
        o.append("Established, contested category (validated demand)")

    for flag in legit.get("flags", [])[:3]:
        w.append(flag)

    if not o:
        o.append("Room to deepen public footprint and third-party validation")
    return Swot(strengths=s[:5], weaknesses=w[:5], opportunities=o[:5], threats=t[:5])


def _swot_context(root: dict, results: dict) -> str:
    lines = [f"Company: {root['name']}"]
    if root.get("description"):
        lines.append(f"Description: {root['description']}")
    for c in _scorecard(root, results):
        lines.append(f"{c['label']}: {c['value']}" + (f" ({c['sub']})" if c.get("sub") else ""))
    comps = (results.get("competitors", {}) or {}).get("competitors", [])
    if comps:
        lines.append("Competitors: " + ", ".join(c["name"] for c in comps[:8]))
    news = (results.get("news", {}) or {}).get("articles", [])
    if news:
        lines.append("Recent headlines:\n" + "\n".join(f"  - {a['title']}" for a in news[:8]))
    return "\n".join(lines)


async def run_synthesis(root: dict, llm: LLMClient, results: dict) -> dict:
    scorecard = _scorecard(root, results)
    timeline = _timeline(results)

    swot = None
    method = "template"
    if llm and llm.available and len(scorecard) >= 3:
        out = await llm.extract(
            "You are a business analyst. From ONLY the facts provided, produce a concise SWOT for "
            f"'{root['name']}'. 2-5 short, specific bullets per quadrant, grounded strictly in the "
            "facts — no invented numbers, no generic filler. Omit a bullet rather than pad.",
            _swot_context(root, results),
            Swot,
        )
        if out and (out.strengths or out.weaknesses or out.opportunities or out.threats):
            swot = out
            method = "llm"
    if swot is None:
        swot = _template_swot(root, results)

    return {
        "scorecard": scorecard,
        "swot": swot.model_dump(),
        "timeline": timeline,
        "method": method,
    }
