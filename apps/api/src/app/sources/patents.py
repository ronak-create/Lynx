"""Patents via PatentsView. Innovation output is a useful R&D signal for tech companies.
Best-effort: PatentsView has changed hosts over time, so failure degrades to no data."""
import json
import logging

from app.sources.base import PatentRecord
from app.sources.http import fetcher

log = logging.getLogger(__name__)

DAY = 24 * 3600


async def by_assignee(name: str, limit: int = 12) -> list[PatentRecord]:
    q = json.dumps({"_text_phrase": {"assignee_organization": name}})
    f = json.dumps(["patent_number", "patent_title", "patent_date"])
    o = json.dumps({"per_page": limit})
    data = await fetcher.get_json(
        "patents",
        "https://api.patentsview.org/patents/query",
        params={"q": q, "f": f, "o": o},
        ttl=DAY,
    )
    if not isinstance(data, dict):
        return []
    patents = data.get("patents") or []
    out: list[PatentRecord] = []
    for p in patents:
        if not isinstance(p, dict):
            continue
        num = p.get("patent_number")
        title = p.get("patent_title")
        if not num or not title:
            continue
        out.append(
            PatentRecord(
                source_id="patentsview",
                source_url=f"https://patents.google.com/patent/US{num}",
                patent_id=str(num),
                title=title.strip(),
                date=p.get("patent_date"),
                url=f"https://patents.google.com/patent/US{num}",
            )
        )
    return out
