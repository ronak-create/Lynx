"""GLEIF — the global Legal Entity Identifier registry (api.gleif.org).

Keyless, free, ~2.7M legal entities worldwide. For Lynx this is a strong, *official*
corroboration signal: an entity with an ACTIVE LEI is a real registered legal person with a
known jurisdiction and headquarters — exactly the kind of third-party record the legitimacy
agent rewards, and it works far beyond the US/public-company reach of SEC EDGAR.

Returns are cached (7-day TTL) and matched with rapidfuzz so "Apple" resolves to the record
whose legal name is closest, not the first alphabetical hit."""
import logging
import re
from dataclasses import dataclass

from rapidfuzz import fuzz

from app.sources.http import fetcher

log = logging.getLogger(__name__)

API = "https://api.gleif.org/api/v1/lei-records"
WEEK = 7 * 24 * 3600

# legal-form suffixes stripped before comparison so "Stripe" == "Stripe, Inc." == "Stripe LLC"
_SUFFIX = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|l\.?l\.?c|plc|sa|"
    r"s\.?a|ag|gmbh|nv|n\.?v|bv|oy|ab|a\.?s|spa|srl|sas|pte|pty|pbc|group|holdings?|"
    r"technologies|technology|labs?|ventures?)\b",
    re.IGNORECASE,
)


def _norm(name: str) -> str:
    """Core name: lowercased, punctuation and legal-form suffixes removed. This is what makes
    a bare query like 'Stripe' comparable to a registry legal name, without the leniency of
    token_set_ratio that lets unrelated same-token namesakes score 100."""
    s = re.sub(r"[^a-z0-9 ]", " ", name.lower())
    s = _SUFFIX.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


@dataclass
class LeiRecord:
    lei: str
    legal_name: str
    jurisdiction: str | None
    status: str | None            # entity status, e.g. ACTIVE / INACTIVE
    registration_status: str | None  # e.g. ISSUED / LAPSED
    hq_country: str | None
    registered_at: str | None     # initial LEI registration date (ISO)
    match: float                  # 0-100 name similarity
    source_url: str

    @property
    def is_active(self) -> bool:
        return (self.status or "").upper() == "ACTIVE"


def _addr_country(entity: dict, key: str) -> str | None:
    addr = entity.get(key) or {}
    return addr.get("country")


async def lookup(name: str, prefer_country: str | None = None, min_score: float = 88.0) -> LeiRecord | None:
    """Best legal-entity match for `name`, or None if nothing clears the similarity bar.

    Matching is on the *normalized core* name (suffixes stripped) with the strict `ratio`, so a
    same-industry namesake ("Stripe Payments Consulting") no longer scores 100 against "Stripe".
    Where the query name genuinely collides across jurisdictions (a US and a Belgian "Stripe"),
    `prefer_country` (e.g. "US" for an SEC-registered company) breaks the tie; ACTIVE status is
    the final tiebreaker. Ambiguity we can't resolve is surfaced via the returned jurisdiction,
    not hidden."""
    if not name or len(name) < 2:
        return None
    data = await fetcher.get_json(
        "gleif",
        API,
        params={"filter[entity.legalName]": name, "page[size]": 15},
        ttl=WEEK,
    )
    records = (data or {}).get("data") if isinstance(data, dict) else None
    if not records:
        return None

    q = _norm(name)
    want = (prefer_country or "").upper()
    best: LeiRecord | None = None
    best_rank: tuple = ()
    for row in records:
        attrs = row.get("attributes") or {}
        entity = attrs.get("entity") or {}
        legal_name = ((entity.get("legalName") or {}).get("name") or "").strip()
        if not legal_name:
            continue
        score = fuzz.ratio(q, _norm(legal_name))
        if score < min_score:
            continue
        jurisdiction = entity.get("jurisdiction") or ""
        active = (entity.get("status") or "").upper() == "ACTIVE"
        # rank: name score, then jurisdiction matches the hint, then ACTIVE
        rank = (score, 1 if want and jurisdiction.upper().startswith(want) else 0, 1 if active else 0)
        if best is not None and rank <= best_rank:
            continue
        best_rank = rank
        registration = attrs.get("registration") or {}
        lei = attrs.get("lei") or row.get("id") or ""
        best = LeiRecord(
            lei=lei,
            legal_name=legal_name,
            jurisdiction=entity.get("jurisdiction"),
            status=(entity.get("status") or "").upper() or None,
            registration_status=(registration.get("status") or "").upper() or None,
            hq_country=_addr_country(entity, "headquartersAddress")
            or _addr_country(entity, "legalAddress"),
            registered_at=(registration.get("initialRegistrationDate") or "")[:10] or None,
            match=score,
            source_url=f"https://search.gleif.org/#/record/{lei}" if lei else API,
        )

    return best
