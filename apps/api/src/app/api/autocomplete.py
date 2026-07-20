"""Search autocomplete: Wikipedia opensearch merged with SEC ticker directory matches."""
import asyncio

from fastapi import APIRouter, Query
from rapidfuzz import fuzz

from app.sources import sec_edgar, wikipedia

router = APIRouter()


@router.get("/autocomplete")
async def autocomplete(q: str = Query(min_length=2, max_length=100)) -> list[dict]:
    wiki_task = asyncio.create_task(wikipedia.opensearch(q, limit=6))
    directory_task = asyncio.create_task(sec_edgar.ticker_directory())
    wiki_hits, directory = await asyncio.gather(wiki_task, directory_task)

    results: list[dict] = []
    seen: set[str] = set()
    for hit in wiki_hits:
        key = hit["title"].lower()
        seen.add(key)
        results.append({"name": hit["title"], "kind": "wikipedia", "url": hit["url"], "ticker": None})

    ql = q.lower()
    scored = []
    for row in directory:
        score = max(
            fuzz.partial_ratio(ql, row["title"].lower()),
            100 if ql == row["ticker"].lower() else 0,
        )
        if score >= 85:
            scored.append((score, row))
    scored.sort(key=lambda x: (-x[0], len(x[1]["title"])))
    for _score, row in scored[:4]:
        key = row["title"].lower()
        if any(fuzz.ratio(key, s) > 92 for s in seen):
            # already covered by a Wikipedia hit; attach the ticker to it instead
            for r in results:
                if fuzz.ratio(r["name"].lower(), key) > 92 and not r["ticker"]:
                    r["ticker"] = row["ticker"]
            continue
        results.append({"name": row["title"], "kind": "sec", "url": None, "ticker": row["ticker"]})
    return results[:8]
