"""Source layer conventions.

Every source module exposes async functions that go through `app.sources.http.Fetcher`
(shared cache + per-source rate limits) and return typed records defined here.
Every record carries provenance (source_id, source_url, retrieved_at) so facts in the
UI can always cite where they came from.

Adding a paid source later (Apollo, Clearbit, paid news APIs) = one new module returning
these same record types + a REGISTRY entry; agents don't change.
"""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BaseRecord(BaseModel):
    source_id: str
    source_url: str | None = None
    retrieved_at: datetime = Field(default_factory=_now)


class ArticleRecord(BaseRecord):
    kind: Literal["article"] = "article"
    title: str
    url: str
    published_at: str | None = None
    publisher: str | None = None
    snippet: str | None = None
    points: int | None = None  # community score (e.g. HN)
    comments: int | None = None


class PriceSeriesRecord(BaseRecord):
    kind: Literal["price_series"] = "price_series"
    ticker: str
    currency: str | None = None
    price: float | None = None
    market_cap: float | None = None
    pe_ratio: float | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    series: list[tuple[str, float]] = []  # (ISO date, close)


class FilingRecord(BaseRecord):
    kind: Literal["filing"] = "filing"
    form: str
    filed_at: str
    title: str | None = None
    url: str | None = None


class FinancialFactRecord(BaseRecord):
    kind: Literal["financial_fact"] = "financial_fact"
    metric: str  # revenue|net_income
    fiscal_year: int
    value: float
    unit: str = "USD"


class PersonRecord(BaseRecord):
    kind: Literal["person"] = "person"
    name: str
    role: str  # founder|ceo|board_member|executive
    wikidata_id: str | None = None


class ProductRecord(BaseRecord):
    kind: Literal["product"] = "product"
    name: str
    wikidata_id: str | None = None
    description: str | None = None


class LinkRecord(BaseRecord):
    kind: Literal["link"] = "link"
    label: str  # website|twitter|facebook|instagram|linkedin|github|...
    url: str


class RepoRecord(BaseRecord):
    kind: Literal["repo"] = "repo"
    name: str
    url: str
    description: str | None = None
    stars: int = 0
    language: str | None = None


class FactRecord(BaseRecord):
    kind: Literal["fact"] = "fact"
    predicate: str
    text: str
    raw: dict | list | str | float | None = None


class SearchResultRecord(BaseRecord):
    kind: Literal["search_result"] = "search_result"
    title: str
    url: str
    description: str | None = None


class PatentRecord(BaseRecord):
    kind: Literal["patent"] = "patent"
    patent_id: str
    title: str
    date: str | None = None
    url: str | None = None


# Which sources serve which categories, and what they cost. Paid tiers slot in here later.
REGISTRY: dict[str, dict] = {
    "wikipedia": {"categories": {"overview", "competitors"}, "cost": "free"},
    "wikidata": {"categories": {"overview", "products", "people", "web_presence"}, "cost": "free"},
    "sec_edgar": {"categories": {"financials"}, "cost": "free"},
    "yfinance": {"categories": {"stock"}, "cost": "free"},
    "google_news": {"categories": {"news"}, "cost": "free"},
    "hn_algolia": {"categories": {"news", "web_presence"}, "cost": "free"},
    "github": {"categories": {"web_presence"}, "cost": "free"},
    "firecrawl": {"categories": {"profile", "funding"}, "cost": "freemium"},
    "duckduckgo": {"categories": {"competitors", "funding", "people", "products", "social"}, "cost": "free"},
    "gleif": {"categories": {"legitimacy", "overview"}, "cost": "free"},
    "wayback": {"categories": {"legitimacy", "profile", "overview"}, "cost": "free"},
    "reddit": {"categories": {"social"}, "cost": "free"},
    "patentsview": {"categories": {"patents"}, "cost": "free"},
    # future: "gdelt", "apollo" (paid), ...
}
