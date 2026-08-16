"""SEC directory matching.

Regression: SEC titles of the form "Duolingo, Inc." used to score ~73 against the bare query,
because the comma stayed attached to the company token and the fuzzy comparison never saw an
overlap. Everything named that way — Airbnb, Cloudflare, Datadog, Duolingo — fell under the
match threshold, so resolution attached no ticker and no CIK, and the run reported a listed
company as "Not publicly traded" with no SEC filings.
"""
import pytest

from app.sources import sec_edgar

DIRECTORY = [
    {"cik": 1562088, "ticker": "DUOL", "title": "Duolingo, Inc."},
    {"cik": 1559720, "ticker": "ABNB", "title": "Airbnb, Inc."},
    {"cik": 1477333, "ticker": "NET", "title": "Cloudflare, Inc."},
    {"cik": 789019, "ticker": "MSFT", "title": "MICROSOFT CORP"},
    {"cik": 59478, "ticker": "LLY", "title": "ELI LILLY & Co"},
    {"cik": 320193, "ticker": "AAPL", "title": "Apple Inc."},
    {"cik": 1090727, "ticker": "UPS", "title": "UNITED PARCEL SERVICE INC"},
]


@pytest.fixture(autouse=True)
def _directory(monkeypatch):
    async def fake_directory() -> list[dict]:
        return DIRECTORY

    monkeypatch.setattr(sec_edgar, "ticker_directory", fake_directory)


@pytest.mark.parametrize(
    ("query", "ticker"),
    [
        ("Duolingo", "DUOL"),  # the regression: single word + ", Inc."
        ("Airbnb", "ABNB"),
        ("Cloudflare", "NET"),
        ("Microsoft", "MSFT"),
        ("Apple", "AAPL"),
        ("Lilly", "LLY"),
        ("duolingo, inc.", "DUOL"),  # full legal name still matches
    ],
)
async def test_matches_public_companies(query, ticker):
    match = await sec_edgar.match_company(query)
    assert match is not None, f"{query} should match the SEC directory"
    assert match["ticker"] == ticker


@pytest.mark.parametrize("query", ["Stripe", "Anthropic", "some company that does not exist"])
async def test_private_companies_do_not_match(query):
    """The threshold must stay tight enough that a private company gets no ticker at all —
    a false positive here would attach someone else's filings to the wrong entity."""
    assert await sec_edgar.match_company(query) is None
