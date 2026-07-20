"""SEC EDGAR: ticker directory, recent filings, XBRL company facts (revenue / net income)."""
from rapidfuzz import fuzz

from app.sources.base import FilingRecord, FinancialFactRecord
from app.sources.http import fetcher

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
DAY = 24 * 3600

_REVENUE_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
]


async def ticker_directory() -> list[dict]:
    """[{cik, ticker, title}] — cached daily."""
    data = await fetcher.get_json("sec_edgar", TICKERS_URL, ttl=DAY)
    if not isinstance(data, dict):
        return []
    return [
        {"cik": int(row["cik_str"]), "ticker": row["ticker"], "title": row["title"]}
        for row in data.values()
    ]


async def match_company(name: str) -> dict | None:
    """Fuzzy-match a company name against the SEC directory. Returns {cik, ticker, title} or None."""
    directory = await ticker_directory()
    if not directory:
        return None
    name_lower = name.lower()
    best, best_score = None, 0.0
    for row in directory:
        score = fuzz.token_set_ratio(name_lower, row["title"].lower())
        # prefer shorter titles on ties (e.g. "Microsoft Corp" over "Microsoft Whatever Trust")
        if score > best_score or (score == best_score and best and len(row["title"]) < len(best["title"])):
            best, best_score = row, score
    if best is not None and best_score >= 90:
        return best
    return None


async def recent_filings(cik: int, limit: int = 10) -> list[FilingRecord]:
    cik_padded = f"{cik:010d}"
    data = await fetcher.get_json(
        "sec_edgar", f"https://data.sec.gov/submissions/CIK{cik_padded}.json", ttl=DAY
    )
    if not isinstance(data, dict):
        return []
    recent = (data.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    accessions = recent.get("accessionNumber") or []
    docs = recent.get("primaryDocument") or []
    out: list[FilingRecord] = []
    for form, date, accession, doc in zip(forms, dates, accessions, docs):
        if form not in ("10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F"):
            continue
        acc_nodash = accession.replace("-", "")
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_nodash}/{doc}"
        out.append(
            FilingRecord(source_id="sec_edgar", source_url=url, form=form, filed_at=date, url=url)
        )
        if len(out) >= limit:
            break
    return out


def _annual_series(units: dict, tag_data: dict) -> list[tuple[int, float]]:
    """Pick annual (10-K, full-year) values from an XBRL tag; latest per fiscal year."""
    by_year: dict[int, float] = {}
    for unit_vals in units.values():
        for item in unit_vals:
            if item.get("form") != "10-K" or item.get("fp") != "FY":
                continue
            fy = item.get("fy")
            val = item.get("val")
            start, end = item.get("start"), item.get("end")
            if fy is None or val is None:
                continue
            # full-year duration facts only (skip quarterly/instant)
            if start and end and (int(end[:4]) - int(start[:4])) not in (0, 1):
                continue
            by_year[int(fy)] = float(val)
    return sorted(by_year.items())[-6:]


async def company_facts(cik: int) -> list[FinancialFactRecord]:
    cik_padded = f"{cik:010d}"
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_padded}.json"
    data = await fetcher.get_json("sec_edgar", url, ttl=DAY)
    if not isinstance(data, dict):
        return []
    gaap = (data.get("facts") or {}).get("us-gaap") or {}
    out: list[FinancialFactRecord] = []

    for metric, tags in (("revenue", _REVENUE_TAGS), ("net_income", ["NetIncomeLoss"])):
        for tag in tags:
            tag_data = gaap.get(tag)
            if not tag_data:
                continue
            series = _annual_series(tag_data.get("units") or {}, tag_data)
            if series:
                for fy, val in series:
                    out.append(
                        FinancialFactRecord(
                            source_id="sec_edgar", source_url=url, metric=metric, fiscal_year=fy, value=val
                        )
                    )
                break  # first tag that yields data wins
    return out
