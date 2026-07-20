"""Live job-postings aggregator across the major public ATS platforms.

Why ATS APIs: a company's applicant-tracking system (Greenhouse, Lever, Ashby,
SmartRecruiters) is the source of truth for its openings, and these public board APIs return
ONLY currently-open roles — a filled/closed posting simply disappears. So every job we return
is verifiably live, with no need to re-check each link. All free, no keys, matched by slug."""
import logging
from datetime import datetime, timezone

from app.sources import webtech
from app.sources.http import fetcher

log = logging.getLogger(__name__)

TTL = 3 * 3600  # postings change through the day; keep the cache short


def _iso(v) -> str | None:
    """Normalize assorted date shapes (ISO string, ms epoch) to YYYY-MM-DD."""
    if not v:
        return None
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        return str(v)[:10]
    except (ValueError, OSError):
        return None


def _job(title, url, source, location=None, department=None, employment_type=None, posted_at=None) -> dict | None:
    title = (title or "").strip()
    if not title or not url:
        return None
    return {
        "title": title,
        "url": url,
        "source": source,
        "location": (location or "").strip() or None,
        "department": (department or "").strip() or None,
        "employment_type": (employment_type or "").strip() or None,
        "posted_at": _iso(posted_at),
    }


async def _greenhouse(slug: str) -> list[dict]:
    data = await fetcher.get_json(
        "generic", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", ttl=TTL
    )
    if not isinstance(data, dict) or not data.get("jobs"):
        return []
    out = []
    for j in data["jobs"]:
        out.append(_job(j.get("title"), j.get("absolute_url"), "Greenhouse",
                        location=(j.get("location") or {}).get("name"), posted_at=j.get("updated_at")))
    return [x for x in out if x]


async def _lever(slug: str) -> list[dict]:
    data = await fetcher.get_json("generic", f"https://api.lever.co/v0/postings/{slug}?mode=json", ttl=TTL)
    if not isinstance(data, list) or not data:
        return []
    out = []
    for j in data:
        cats = j.get("categories") or {}
        out.append(_job(j.get("text"), j.get("hostedUrl"), "Lever",
                        location=cats.get("location"), department=cats.get("team"),
                        employment_type=cats.get("commitment"), posted_at=j.get("createdAt")))
    return [x for x in out if x]


async def _ashby(slug: str) -> list[dict]:
    data = await fetcher.get_json(
        "generic", f"https://api.ashbyhq.com/posting-api/job-board/{slug}", ttl=TTL
    )
    if not isinstance(data, dict) or not data.get("jobs"):
        return []
    out = []
    for j in data["jobs"]:
        if j.get("isListed") is False:  # extra safety — only listed/live roles
            continue
        out.append(_job(j.get("title"), j.get("jobUrl") or j.get("applyUrl"), "Ashby",
                        location=j.get("location"), department=j.get("department") or j.get("team"),
                        employment_type=j.get("employmentType"), posted_at=j.get("publishedAt")))
    return [x for x in out if x]


async def _smartrecruiters(slug: str) -> list[dict]:
    data = await fetcher.get_json(
        "generic", f"https://api.smartrecruiters.com/v1/companies/{slug}/postings", ttl=TTL
    )
    if not isinstance(data, dict) or not data.get("content"):
        return []
    out = []
    for j in data["content"]:
        loc = j.get("location") or {}
        location = ", ".join(x for x in (loc.get("city"), loc.get("country")) if x)
        out.append(_job(j.get("name"), f"https://jobs.smartrecruiters.com/{slug}/{j.get('id')}",
                        "SmartRecruiters", location=location,
                        department=(j.get("department") or {}).get("label"),
                        employment_type=(j.get("typeOfEmployment") or {}).get("label"),
                        posted_at=j.get("releasedDate")))
    return [x for x in out if x]


_PROVIDERS = (_greenhouse, _lever, _ashby, _smartrecruiters)


async def live_jobs(name: str, domain: str | None) -> dict:
    """Aggregate live postings across every ATS the company might use, matched by slug."""
    slugs: list[str] = []
    domain_label = domain.lower().removeprefix("www.").split(".")[0] if domain else ""
    for s in (webtech._slug(name), webtech._slug(domain_label) if domain_label else ""):
        if s and s not in slugs:
            slugs.append(s)

    jobs: list[dict] = []
    seen: set[tuple] = set()
    sources: set[str] = set()
    for provider in _PROVIDERS:
        for slug in slugs:
            try:
                found = await provider(slug)
            except Exception:
                log.warning("jobs provider %s failed for %s", provider.__name__, slug, exc_info=True)
                found = []
            if not found:
                continue
            for j in found:
                key = (j["title"].lower(), (j["location"] or "").lower())
                if key in seen:
                    continue
                seen.add(key)
                jobs.append(j)
                sources.add(j["source"])
            break  # this provider matched on this slug; don't try the other slug

    jobs.sort(key=lambda j: j["posted_at"] or "", reverse=True)

    def _facet(field: str) -> list[dict]:
        counts: dict[str, int] = {}
        for j in jobs:
            v = j.get(field)
            if v:
                counts[v] = counts.get(v, 0) + 1
        return [{"name": k, "count": v} for k, v in sorted(counts.items(), key=lambda t: -t[1])]

    return {
        "available": bool(jobs),
        "count": len(jobs),
        "jobs": jobs,
        "sources": sorted(sources),
        "by_department": _facet("department"),
        "by_location": _facet("location"),
    }
