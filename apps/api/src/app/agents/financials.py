"""Financials agent: SEC XBRL facts + recent filings for public companies;
Wikidata revenue claim as the private-company fallback."""
import asyncio

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, make_provenance
from app.sources import sec_edgar

category = "financials"


async def run(ctx: AgentContext) -> dict:
    cik = ctx.root.get("cik")
    if not cik:
        # private company: surface whatever Wikidata knows
        revenue = next(
            (f for f in ctx.profile.get("facts", []) if f.predicate == "revenue_wikidata"), None
        )
        return {
            "public": False,
            "message": "No SEC filings found (likely private)",
            "wikidata_revenue": revenue.text if revenue else None,
        }

    ctx.progress(category, f"Fetching SEC XBRL facts and filings (CIK {cik})")
    facts, filings = await asyncio.gather(
        sec_edgar.company_facts(cik), sec_edgar.recent_filings(cik)
    )
    ctx.progress(category, f"Parsed {len(facts)} annual facts, {len(filings)} filings")

    revenue_series = sorted(
        [(f.fiscal_year, f.value) for f in facts if f.metric == "revenue"]
    )
    income_series = sorted(
        [(f.fiscal_year, f.value) for f in facts if f.metric == "net_income"]
    )

    with get_session() as session:
        entity = session.get(Entity, ctx.root["entity_id"])
        if facts:
            prov = make_provenance(session, "sec_edgar", facts[0].source_url)
            if revenue_series:
                fy, val = revenue_series[-1]
                add_claim(session, entity, "revenue_latest", {"text": f"FY{fy}: ${val:,.0f}", "raw": val}, provenance=prov)
            if income_series:
                fy, val = income_series[-1]
                add_claim(session, entity, "net_income_latest", {"text": f"FY{fy}: ${val:,.0f}", "raw": val}, provenance=prov)
        session.commit()

    return {
        "public": True,
        "cik": cik,
        "revenue_series": revenue_series,
        "net_income_series": income_series,
        "filings": [f.model_dump(mode="json") for f in filings],
    }
