"""Yahoo Finance via yfinance (blocking lib — always called through asyncio.to_thread).

yfinance is scraping-based and occasionally breaks; everything is wrapped so a failure
degrades to `None` and the stock card reports 'unavailable' instead of crashing the run.
"""
import asyncio
import logging

from app.sources.base import PriceSeriesRecord

log = logging.getLogger(__name__)


def _fetch_sync(ticker: str) -> PriceSeriesRecord | None:
    import yfinance as yf

    try:
        t = yf.Ticker(ticker)
        info = t.fast_info
        price = getattr(info, "last_price", None)
        if price is None:
            return None
        hist = t.history(period="1y", interval="1wk")
        series = [
            (idx.strftime("%Y-%m-%d"), round(float(row["Close"]), 2))
            for idx, row in hist.iterrows()
            if row.get("Close") == row.get("Close")  # NaN guard
        ]
        return PriceSeriesRecord(
            source_id="yfinance",
            source_url=f"https://finance.yahoo.com/quote/{ticker}",
            ticker=ticker,
            currency=getattr(info, "currency", None),
            price=round(float(price), 2),
            market_cap=getattr(info, "market_cap", None),
            pe_ratio=None,
            fifty_two_week_high=getattr(info, "year_high", None),
            fifty_two_week_low=getattr(info, "year_low", None),
            series=series,
        )
    except Exception as exc:  # yfinance raises all sorts — degrade, never crash the agent
        log.warning("yfinance failed for %s: %s", ticker, exc)
        return None


async def quote_and_history(ticker: str) -> PriceSeriesRecord | None:
    return await asyncio.to_thread(_fetch_sync, ticker)


def _quote_sync(ticker: str) -> dict | None:
    """Just the live price/market-cap (no 1y history) — cheap enough to poll."""
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).fast_info
        price = getattr(info, "last_price", None)
        if price is None:
            return None
        return {
            "ticker": ticker,
            "price": round(float(price), 2),
            "currency": getattr(info, "currency", None),
            "market_cap": getattr(info, "market_cap", None),
        }
    except Exception as exc:
        log.warning("yfinance quote failed for %s: %s", ticker, exc)
        return None


async def quote(ticker: str) -> dict | None:
    return await asyncio.to_thread(_quote_sync, ticker)
