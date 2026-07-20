"""Resolve free-text or a URL into a root Company entity before agents run."""
import re
from urllib.parse import urlparse

from rapidfuzz import fuzz

from app.db.engine import get_session
from app.graph.resolution import get_or_create_entity
from app.sources import sec_edgar, wikipedia
from app.sources.http import fetcher


async def _name_from_url(url: str) -> str | None:
    """Fetch homepage and pull a name from og:site_name / <title>."""
    text = await fetcher.get_text("generic", url, ttl=7 * 24 * 3600)
    if not text:
        return None
    m = re.search(r'property=["\']og:site_name["\']\s+content=["\']([^"\']+)', text) or re.search(
        r'content=["\']([^"\']+)["\']\s+property=["\']og:site_name', text
    )
    if m:
        return m.group(1).strip()
    m = re.search(r"<title[^>]*>([^<]+)</title>", text, re.IGNORECASE)
    if m:
        title = m.group(1).strip()
        # "Figma: the collaborative..." -> "Figma"; "Stripe | Payments" -> "Stripe"
        return re.split(r"[|:–—-]", title)[0].strip()
    return None


_CORP_WORDS = r"inc|incorporated|corp|corporation|company|co|plc|ltd|limited|llc|holdings|group|sa|ag|nv"


def _norm_title(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t.lower())).strip()


def _clean_company(t: str) -> str:
    """SEC titles ('ELI LILLY & Co', 'APPLE INC') → a plain search term ('eli lilly', 'apple')."""
    t = _norm_title(t)
    t = re.sub(rf"\b({_CORP_WORDS})\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


_COMPANY_DESC = re.compile(
    r"company|corporation|multinational|manufacturer|automaker|carmaker|retailer|airline|bank|"
    r"enterprise|conglomerate|holding|group|maker|producer|firm|platform|brand|chain|studio",
)
_PERSON_DESC = re.compile(
    r"\bborn\b|singer|actor|actress|politician|officer|businessman|businesswoman|footballer|"
    r"player|author|musician|painter|writer|\b1[89]\d\d[–\-]",
)


def _entity_kind_score(s: dict) -> int:
    """+ when the article's own DESCRIPTION reads like an organization, − like a person. Judged
    on the short description only (not the extract) so a court case whose body mentions the
    company doesn't score as one. Separates 'Eli Lilly and Company' from 'Eli Lilly' the founder
    and 'Apple Inc.' from the fruit — far more reliable than title similarity alone."""
    desc = (s.get("description") or "").lower()
    score = 0
    if _COMPANY_DESC.search(desc):
        score += 100
    if _PERSON_DESC.search(desc):
        score -= 100
    return score


async def _company_summary(sec_title: str) -> dict | None:
    """Resolve a Wikipedia article for a known company name. Searches by the cleaned name for
    recall, then ranks non-disambiguation hits: organization-like first, ties broken by title
    closeness (token_sort_ratio penalises extra tokens like '…of Canada' or 'v. Medtronic')."""
    prefer = _norm_title(sec_title)
    best, best_score = None, -1e9
    for hit in await wikipedia.opensearch(_clean_company(sec_title), limit=6):
        s = await wikipedia.summary(hit["title"])
        if not s or s.get("disambiguation"):
            continue
        score = _entity_kind_score(s) + fuzz.token_sort_ratio(prefer, _norm_title(s.get("title") or "")) / 10
        if score > best_score:
            best, best_score = s, score
    return best


async def resolve_query(query: str) -> dict:
    """Returns the root dict used by all agents; creates/updates the root entity row."""
    query = query.strip()
    domain = None
    name = query

    if re.match(r"https?://", query):
        parsed = urlparse(query)
        domain = parsed.netloc.removeprefix("www.")
        name = (await _name_from_url(query)) or domain.split(".")[0].title()

    # Wikipedia is the canonical resolver: opensearch -> REST summary, skipping disambiguation pages.
    wiki_title = None
    wikidata_id = None
    description = None
    summary_text = None
    wiki_url = None
    hits = await wikipedia.opensearch(name, limit=1)
    s = await wikipedia.summary(hits[0]["title"]) if hits else None

    sec = await sec_edgar.match_company(name)
    ticker = sec["ticker"] if sec else None
    cik = sec["cik"] if sec else None

    # Prefer the SEC-identified public company's Wikipedia article when either the typed name is
    # ambiguous (Wikipedia returned a disambiguation page like "Lilly", or a non-company like
    # "Apple" the fruit) or the name essentially IS the company (strong SEC match). Guarded by a
    # similarity check so a weak SEC fuzzy-match can't hijack an unrelated term.
    sim = fuzz.token_set_ratio(name.lower(), sec["title"].lower()) if sec else 0
    ambiguous = s is None or s.get("disambiguation")
    if sec and sim >= 60 and (ambiguous or sim >= 88):
        better = await _company_summary(sec["title"])
        if better:
            s = better

    if s and not s.get("disambiguation"):
        wiki_title = s["title"]
        wikidata_id = s["wikidata_id"]
        description = s["description"]
        summary_text = s["extract"]
        wiki_url = s["url"]
        name = s["title"]
    elif sec:
        # no clean Wikipedia article, but we know the company from SEC — use its proper name
        name = sec["title"].title()

    canonical = (
        f"wikidata:{wikidata_id}"
        if wikidata_id
        else (f"ticker:{ticker}" if ticker else (f"domain:{domain}" if domain else None))
    )

    with get_session() as session:
        entity = get_or_create_entity(
            session,
            "company",
            name,
            canonical_key=canonical,
            attrs={
                "wikipedia_title": wiki_title,
                "wikidata_id": wikidata_id,
                "ticker": ticker,
                "cik": cik,
                "domain": domain,
                "description": description,
                "wikipedia_url": wiki_url,
                "is_root": True,
            },
            summary=summary_text,
        )
        session.commit()
        entity_id = entity.id

    return {
        "entity_id": entity_id,
        "name": name,
        "wikipedia_title": wiki_title,
        "wikidata_id": wikidata_id,
        "ticker": ticker,
        "cik": cik,
        "domain": domain,
        "description": description,
        "url": wiki_url,
    }
