"""Shared HTTP layer: one AsyncClient, SQLite response cache, per-source rate limits, retries."""
import asyncio
import hashlib
import json
import logging
from datetime import timedelta

import httpx
from aiolimiter import AsyncLimiter
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import USER_AGENT, settings
from app.db.engine import get_session
from app.db.models import HttpCache, utcnow

log = logging.getLogger(__name__)

# requests per second budgets (SEC policy: max 10/s — stay well under)
_LIMITERS: dict[str, AsyncLimiter] = {
    "sec_edgar": AsyncLimiter(6, 1),
    "wikipedia": AsyncLimiter(10, 1),
    "wikidata": AsyncLimiter(5, 1),
    "google_news": AsyncLimiter(2, 1),
    "hn_algolia": AsyncLimiter(5, 1),
    "github": AsyncLimiter(1, 2),
    "firecrawl": AsyncLimiter(2, 1),
    "reddit": AsyncLimiter(2, 1),
    "patents": AsyncLimiter(3, 1),
    "rdap": AsyncLimiter(3, 1),
    "doh": AsyncLimiter(5, 1),
    "jina": AsyncLimiter(2, 1),
    "generic": AsyncLimiter(3, 1),
}


def _limiter(source_id: str) -> AsyncLimiter:
    return _LIMITERS.get(source_id, _LIMITERS["generic"])


def _cache_key(url: str, params: dict | None) -> str:
    raw = url + "|" + json.dumps(sorted((params or {}).items()), default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


class Fetcher:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(25.0),
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        )
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_fetches)

    async def close(self) -> None:
        await self._client.aclose()

    def _cache_get(self, key: str) -> str | None:
        with get_session() as session:
            row = session.get(HttpCache, key)
            if row is None:
                return None
            retrieved = row.retrieved_at
            if retrieved.tzinfo is None:
                from datetime import timezone

                retrieved = retrieved.replace(tzinfo=timezone.utc)
            if utcnow() - retrieved > timedelta(seconds=row.ttl_seconds):
                return None
            return row.body

    def _cache_put(self, key: str, url: str, status: int, body: str, ttl: int) -> None:
        with get_session() as session:
            session.merge(
                HttpCache(key=key, url=url, status=status, body=body, retrieved_at=utcnow(), ttl_seconds=ttl)
            )
            session.commit()

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, max=8),
        reraise=True,
    )
    async def _do_get(self, url: str, params: dict | None, headers: dict | None) -> httpx.Response:
        resp = await self._client.get(url, params=params, headers=headers)
        if resp.status_code in (429, 500, 502, 503, 504):
            resp.raise_for_status()
        return resp

    async def get_text(
        self,
        source_id: str,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
        ttl: int = 3600,
    ) -> str | None:
        key = _cache_key(url, params)
        cached = await asyncio.to_thread(self._cache_get, key)
        if cached is not None:
            return cached
        async with self._semaphore, _limiter(source_id):
            try:
                resp = await self._do_get(url, params, headers)
            except httpx.HTTPError as exc:
                log.warning("fetch failed source=%s url=%s err=%s", source_id, url, exc)
                return None
        if resp.status_code != 200:
            log.warning("fetch non-200 source=%s url=%s status=%s", source_id, url, resp.status_code)
            return None
        await asyncio.to_thread(self._cache_put, key, url, resp.status_code, resp.text, ttl)
        return resp.text

    async def get_json(
        self,
        source_id: str,
        url: str,
        params: dict | None = None,
        headers: dict | None = None,
        ttl: int = 3600,
    ) -> dict | list | None:
        text = await self.get_text(source_id, url, params=params, headers=headers, ttl=ttl)
        if text is None:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            log.warning("invalid json source=%s url=%s", source_id, url)
            return None

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, max=8),
        reraise=True,
    )
    async def _do_post(self, url: str, json_body: dict, headers: dict | None) -> httpx.Response:
        resp = await self._client.post(url, json=json_body, headers=headers)
        if resp.status_code in (429, 500, 502, 503, 504):
            resp.raise_for_status()
        return resp

    async def post_json(
        self,
        source_id: str,
        url: str,
        json_body: dict,
        headers: dict | None = None,
        ttl: int = 7 * 24 * 3600,
    ) -> dict | list | None:
        """POST with a JSON body, response cached by (url, body). Used by paid/credit
        APIs (Firecrawl) so repeat research reuses results instead of burning credits."""
        key = _cache_key(url, {"__post__": json.dumps(json_body, sort_keys=True, default=str)})
        cached = await asyncio.to_thread(self._cache_get, key)
        if cached is not None:
            try:
                return json.loads(cached)
            except json.JSONDecodeError:
                return None
        async with self._semaphore, _limiter(source_id):
            try:
                resp = await self._do_post(url, json_body, headers)
            except httpx.HTTPError as exc:
                log.warning("post failed source=%s url=%s err=%s", source_id, url, exc)
                return None
        if resp.status_code != 200:
            log.warning("post non-200 source=%s url=%s status=%s", source_id, url, resp.status_code)
            return None
        await asyncio.to_thread(self._cache_put, key, url, resp.status_code, resp.text, ttl)
        try:
            return json.loads(resp.text)
        except json.JSONDecodeError:
            log.warning("invalid json (post) source=%s url=%s", source_id, url)
            return None


fetcher = Fetcher()
