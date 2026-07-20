"""Stock agent: yfinance quote + 1y weekly history. Deterministic only — no LLM."""
from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, make_provenance
from app.sources import yfinance_source

category = "stock"


async def run(ctx: AgentContext) -> dict:
    ticker = ctx.root.get("ticker")
    if not ticker:
        return {"listed": False, "message": "Not publicly traded (no ticker found)"}

    ctx.progress(category, f"Fetching quote and 1y history for {ticker}")
    record = await yfinance_source.quote_and_history(ticker)
    if record is None:
        return {"listed": True, "ticker": ticker, "available": False, "message": "Quote source unavailable"}

    with get_session() as session:
        entity = session.get(Entity, ctx.root["entity_id"])
        prov = make_provenance(session, "yfinance", record.source_url)
        add_claim(session, entity, "stock_price", {"text": f"{record.price} {record.currency or ''}".strip(), "raw": record.price}, provenance=prov)
        if record.market_cap:
            add_claim(session, entity, "market_cap", {"text": f"{record.market_cap:,.0f}", "raw": record.market_cap}, provenance=prov)
        session.commit()

    return {
        "listed": True,
        "available": True,
        "ticker": record.ticker,
        "currency": record.currency,
        "price": record.price,
        "market_cap": record.market_cap,
        "fifty_two_week_high": record.fifty_two_week_high,
        "fifty_two_week_low": record.fifty_two_week_low,
        "series": record.series,
        "source_url": record.source_url,
    }
