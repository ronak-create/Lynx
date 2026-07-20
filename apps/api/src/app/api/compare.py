"""Side-by-side comparison of two or more already-researched entities.

Reads each job's finished category payloads and projects them onto a shared set of metrics
(one row per metric, one column per entity). Everything is deterministic — no re-fetching,
no LLM — so a comparison is instant and works for any run that has completed. Numeric rows
carry a `best` index so the frontend can highlight the leader."""
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from app.db.engine import get_session
from app.db.models import CategoryResult, Entity, Job

router = APIRouter()


def _num(value) -> float | None:
    """Coerce ints, floats, and formatted strings ('1,234', '$3.2B') to a number."""
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    s = value.strip().lower().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    mult = 1.0
    if s.endswith("t"):
        mult, s = 1e12, s[:-1]
    elif s.endswith("b"):
        mult, s = 1e9, s[:-1]
    elif s.endswith("m"):
        mult, s = 1e6, s[:-1]
    elif s.endswith("k"):
        mult, s = 1e3, s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return None


def _cell(text: str | None, sort: float | None = None) -> dict:
    """One comparison cell: display text + optional numeric key for ranking."""
    return {"text": text if text not in (None, "") else "—", "sort": sort}


def _extract(cats: dict[str, dict]) -> dict[str, dict]:
    """Map one entity's category payloads → {metric_key: cell}."""
    legit = cats.get("legitimacy", {})
    profile = cats.get("profile", {})
    overview = cats.get("overview", {})
    stock = cats.get("stock", {})
    fin = cats.get("financials", {})
    funding = cats.get("funding", {})
    patents = cats.get("patents", {})
    news = cats.get("news", {})
    competitors = cats.get("competitors", {})

    facts = {f.get("predicate"): f.get("text") for f in overview.get("facts", []) if isinstance(f, dict)}

    out: dict[str, dict] = {}

    if legit:
        out["legitimacy"] = _cell(
            f"{legit.get('score')} · {legit.get('verdict')}" if legit.get("score") is not None else None,
            _num(legit.get("score")),
        )
        if legit.get("age_years") is not None:
            out["domain_age"] = _cell(f"{legit['age_years']}y", _num(legit["age_years"]))

    out["founded"] = _cell(profile.get("founded") or facts.get("founded"))
    out["employees"] = _cell(facts.get("employees"), _num(facts.get("employees")))
    out["hq"] = _cell(profile.get("headquarters") or facts.get("hq"))
    out["business_model"] = _cell(profile.get("business_model"))
    out["offerings"] = _cell(
        str(len(profile.get("offerings", []))) if profile.get("offerings") else None,
        len(profile.get("offerings", [])) or None,
    )

    if stock.get("available"):
        out["stock_price"] = _cell(f"{stock.get('price')} {stock.get('currency', '')}".strip())
        out["market_cap"] = _cell(_fmt_money(stock.get("market_cap")), _num(stock.get("market_cap")))

    rev = fin.get("revenue_series") or []
    if rev:
        fy, val = rev[-1]
        out["revenue"] = _cell(f"FY{fy} {_fmt_money(val)}", _num(val))

    if funding.get("total_raised"):
        out["total_raised"] = _cell(funding["total_raised"], _num(funding["total_raised"]))
    if funding.get("valuation"):
        out["valuation"] = _cell(funding["valuation"], _num(funding["valuation"]))

    if patents.get("count"):
        out["patents"] = _cell(str(patents["count"]), _num(patents["count"]))

    tone = news.get("tone_summary") or {}
    if tone:
        out["news_tone"] = _cell(f"+{tone.get('positive', 0)} / -{tone.get('negative', 0)}",
                                 _num(tone.get("positive", 0)) - _num(tone.get("negative", 0)) if tone else None)

    comps = competitors.get("competitors") or []
    if comps:
        out["competitors"] = _cell(str(len(comps)), float(len(comps)))

    return out


def _fmt_money(v) -> str | None:
    n = _num(v)
    if n is None:
        return None
    a = abs(n)
    if a >= 1e12:
        return f"${n / 1e12:.2f}T"
    if a >= 1e9:
        return f"${n / 1e9:.2f}B"
    if a >= 1e6:
        return f"${n / 1e6:.1f}M"
    return f"${n:,.0f}"


# metric rows, in display order: (key, label, higher_is_better)
_METRICS = [
    ("legitimacy", "Legitimacy", True),
    ("domain_age", "Domain age", True),
    ("founded", "Founded", False),
    ("employees", "Employees", True),
    ("hq", "Headquarters", False),
    ("business_model", "Business model", False),
    ("offerings", "Offerings", True),
    ("stock_price", "Share price", False),
    ("market_cap", "Market cap", True),
    ("revenue", "Revenue", True),
    ("total_raised", "Total raised", True),
    ("valuation", "Valuation", True),
    ("patents", "Patents", True),
    ("news_tone", "News tone", True),
    ("competitors", "Competitors tracked", True),
]


@router.get("/compare")
async def compare(jobs: str = Query(..., description="comma-separated job ids")) -> dict:
    job_ids = [j.strip() for j in jobs.split(",") if j.strip()]
    if len(job_ids) < 2:
        raise HTTPException(400, "need at least two job ids to compare")

    entities: list[dict] = []
    per_entity: list[dict[str, dict]] = []
    with get_session() as session:
        for jid in job_ids:
            job = session.get(Job, jid)
            if job is None:
                raise HTTPException(404, f"job {jid} not found")
            entity = session.get(Entity, job.entity_id) if job.entity_id else None
            results = session.scalars(select(CategoryResult).where(CategoryResult.job_id == jid)).all()
            cats = {r.category: (r.payload or {}) for r in results if r.status == "completed"}
            entities.append(
                {
                    "job_id": jid,
                    "name": entity.name if entity else job.query,
                    "ticker": (entity.attrs or {}).get("ticker") if entity else None,
                    "description": (entity.attrs or {}).get("description") if entity else None,
                }
            )
            per_entity.append(_extract(cats))

    metrics = []
    for key, label, higher in _METRICS:
        cells = [e.get(key, _cell(None)) for e in per_entity]
        if all(c["text"] == "—" for c in cells):
            continue  # skip rows no entity has data for
        best = None
        if higher:
            ranked = [(i, c["sort"]) for i, c in enumerate(cells) if c["sort"] is not None]
            if len(ranked) >= 2:
                best = max(ranked, key=lambda t: t[1])[0]
        metrics.append({"key": key, "label": label, "cells": cells, "best": best})

    return {"entities": entities, "metrics": metrics}
