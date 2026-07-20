"""GitHub public API (unauthenticated, 60 req/h — cached a week to stay inside it)."""
from app.sources.base import RepoRecord
from app.sources.http import fetcher

WEEK = 7 * 24 * 3600
API = "https://api.github.com"


async def find_org(name: str) -> dict | None:
    data = await fetcher.get_json(
        "github", f"{API}/search/users", params={"q": f"{name} type:org", "per_page": 1}, ttl=WEEK
    )
    if not isinstance(data, dict) or not data.get("items"):
        return None
    item = data["items"][0]
    return {"login": item["login"], "url": item["html_url"]}


async def top_repos(org_login: str, limit: int = 6) -> list[RepoRecord]:
    data = await fetcher.get_json(
        "github",
        f"{API}/orgs/{org_login}/repos",
        params={"sort": "updated", "per_page": 30, "type": "public"},
        ttl=WEEK,
    )
    if not isinstance(data, list):
        return []
    repos = sorted(data, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:limit]
    return [
        RepoRecord(
            source_id="github",
            source_url=r["html_url"],
            name=r["name"],
            url=r["html_url"],
            description=r.get("description"),
            stars=r.get("stargazers_count", 0),
            language=r.get("language"),
        )
        for r in repos
    ]
