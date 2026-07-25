"""Wikidata entity API: structured claims about companies (founded, founders, products, socials...)."""
from typing import Any

from app.sources.base import FactRecord, LinkRecord, PersonRecord, ProductRecord
from app.sources.http import fetcher

WD_API = "https://www.wikidata.org/w/api.php"
WEEK = 7 * 24 * 3600

# properties we understand
P = {
    "instance_of": "P31",
    "inception": "P571",
    "hq": "P159",
    "admin_region": "P131",
    "country": "P17",
    "industry": "P452",
    "employees": "P1128",
    "website": "P856",
    "founder": "P112",
    "ceo": "P169",
    "board_member": "P3320",
    "product": "P1056",
    "subsidiary": "P355",
    "parent_org": "P749",
    "twitter": "P2002",
    "facebook": "P2013",
    "instagram": "P2003",
    "linkedin": "P4264",
    "stock_exchange": "P414",
    "ticker": "P249",
    "total_revenue": "P2139",
}

SOCIAL_URL = {
    "twitter": "https://x.com/{}",
    "facebook": "https://facebook.com/{}",
    "instagram": "https://instagram.com/{}",
    "linkedin": "https://www.linkedin.com/company/{}",
}


async def get_entity(qid: str) -> dict | None:
    data = await fetcher.get_json(
        "wikidata",
        WD_API,
        params={
            "action": "wbgetentities",
            "ids": qid,
            "props": "claims|labels|descriptions|sitelinks",
            "languages": "en",
            "format": "json",
        },
        ttl=WEEK,
    )
    if not isinstance(data, dict):
        return None
    return (data.get("entities") or {}).get(qid)


async def resolve_location(qid: str) -> str | None:
    """Build a 'City, State, Country' address for a headquarters location item by walking its
    administrative-territory chain (P131) up to the state level and reading its country (P17)."""
    city = await get_entity(qid)
    if not city:
        return None
    country_ids = claim_item_ids(city, "country")
    # walk up the admin chain (Cupertino → Santa Clara County → California), stopping at the country
    admins: list[str] = []
    cur, seen = city, {qid}
    for _ in range(3):
        parents = claim_item_ids(cur, "admin_region")
        nxt = next((p for p in parents if p not in seen and p not in country_ids), None)
        if not nxt:
            break
        seen.add(nxt)
        admins.append(nxt)
        cur = await get_entity(nxt)
        if not cur:
            break
    # city + top-most admin (state-ish) + country, resolved and de-duplicated in order
    ids = [qid] + (admins[-1:] if admins else []) + country_ids[:1]
    labels = await get_labels(ids)
    parts: list[str] = []
    for q in ids:
        name = labels.get(q)
        if name and name not in parts:
            parts.append(name)
    return ", ".join(parts) if parts else None


async def get_labels(qids: list[str]) -> dict[str, str]:
    """Batch-resolve Q-ids to English labels."""
    labels: dict[str, str] = {}
    for i in range(0, len(qids), 50):
        batch = qids[i : i + 50]
        data = await fetcher.get_json(
            "wikidata",
            WD_API,
            params={
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels",
                "languages": "en",
                "format": "json",
            },
            ttl=WEEK,
        )
        if not isinstance(data, dict):
            continue
        for qid, ent in (data.get("entities") or {}).items():
            label = ((ent.get("labels") or {}).get("en") or {}).get("value")
            if label:
                labels[qid] = label
    return labels


def _claim_values(entity: dict, pid: str) -> list[Any]:
    """Raw datavalues for a property (strings, quantities, or {id: Q..} for items)."""
    out = []
    for claim in ((entity.get("claims") or {}).get(pid) or []):
        snak = (claim.get("mainsnak") or {}).get("datavalue")
        if snak is not None:
            out.append(snak.get("value"))
    return out


def claim_item_ids(entity: dict, key: str) -> list[str]:
    return [v["id"] for v in _claim_values(entity, P[key]) if isinstance(v, dict) and "id" in v]


def claim_strings(entity: dict, key: str) -> list[str]:
    return [v for v in _claim_values(entity, P[key]) if isinstance(v, str)]


def claim_time(entity: dict, key: str) -> str | None:
    for v in _claim_values(entity, P[key]):
        if isinstance(v, dict) and "time" in v:
            return v["time"].lstrip("+")[:10]
    return None


def claim_quantity(entity: dict, key: str) -> float | None:
    for v in _claim_values(entity, P[key]):
        if isinstance(v, dict) and "amount" in v:
            try:
                return float(v["amount"])
            except ValueError:
                pass
    return None


def _wd_url(qid: str) -> str:
    return f"https://www.wikidata.org/wiki/{qid}"


async def company_profile(qid: str) -> dict:
    """Everything we know deterministically about a company from Wikidata.

    Returns {facts: [FactRecord], people: [PersonRecord], products: [ProductRecord],
             links: [LinkRecord], related: {subsidiaries: [...], parent: [...]}}
    """
    entity = await get_entity(qid)
    if entity is None:
        return {"facts": [], "people": [], "products": [], "links": [], "related": {}}

    url = _wd_url(qid)
    facts: list[FactRecord] = []
    if inception := claim_time(entity, "inception"):
        facts.append(FactRecord(source_id="wikidata", source_url=url, predicate="founded", text=inception, raw=inception))
    if employees := claim_quantity(entity, "employees"):
        facts.append(FactRecord(source_id="wikidata", source_url=url, predicate="employees", text=f"{int(employees):,}", raw=employees))
    if revenue := claim_quantity(entity, "total_revenue"):
        facts.append(FactRecord(source_id="wikidata", source_url=url, predicate="revenue_wikidata", text=f"{revenue:,.0f}", raw=revenue))
    if tickers := claim_strings(entity, "ticker"):
        facts.append(FactRecord(source_id="wikidata", source_url=url, predicate="ticker", text=tickers[0], raw=tickers))

    # resolve item-valued claims to labels in one batch
    people_ids = {
        "founder": claim_item_ids(entity, "founder"),
        "ceo": claim_item_ids(entity, "ceo"),
        "board_member": claim_item_ids(entity, "board_member")[:8],
    }
    label_targets = {
        "hq": claim_item_ids(entity, "hq")[:2],
        "industry": claim_item_ids(entity, "industry")[:4],
        "product": claim_item_ids(entity, "product")[:15],
        "subsidiary": claim_item_ids(entity, "subsidiary")[:10],
        "parent_org": claim_item_ids(entity, "parent_org")[:3],
    }
    all_ids = [q for ids in (*people_ids.values(), *label_targets.values()) for q in ids]
    labels = await get_labels(all_ids) if all_ids else {}

    # headquarters: resolve the first location to a full "City, State, Country" address
    hq_ids = label_targets["hq"]
    if hq_ids:
        loc = await resolve_location(hq_ids[0])
        if not loc:  # fallback: de-duplicated raw labels (avoids "Cupertino, Cupertino")
            names = list(dict.fromkeys(labels[q] for q in hq_ids if q in labels))
            loc = ", ".join(names) if names else None
        if loc:
            facts.append(FactRecord(source_id="wikidata", source_url=url, predicate="hq", text=loc, raw=loc))

    industry_names = [labels[q] for q in label_targets["industry"] if q in labels]
    if industry_names:
        facts.append(
            FactRecord(source_id="wikidata", source_url=url, predicate="industry", text=", ".join(industry_names), raw=industry_names)
        )

    people = [
        PersonRecord(source_id="wikidata", source_url=_wd_url(q), name=labels[q], role=role, wikidata_id=q)
        for role, ids in people_ids.items()
        for q in ids
        if q in labels
    ]
    products = [
        ProductRecord(source_id="wikidata", source_url=_wd_url(q), name=labels[q], wikidata_id=q)
        for q in label_targets["product"]
        if q in labels
    ]

    links: list[LinkRecord] = []
    for site in claim_strings(entity, "website")[:2]:
        links.append(LinkRecord(source_id="wikidata", source_url=url, label="website", url=site))
    for social in ("twitter", "facebook", "instagram", "linkedin"):
        for handle in claim_strings(entity, social)[:1]:
            links.append(
                LinkRecord(source_id="wikidata", source_url=url, label=social, url=SOCIAL_URL[social].format(handle))
            )

    related = {
        "subsidiaries": [labels[q] for q in label_targets["subsidiary"] if q in labels],
        "parent": [labels[q] for q in label_targets["parent_org"] if q in labels],
    }
    return {"facts": facts, "people": people, "products": products, "links": links, "related": related}
