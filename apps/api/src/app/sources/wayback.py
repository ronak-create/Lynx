"""Wayback Machine CDX — how long a company's site has actually existed (archive.org).

Keyless and free. A domain's first archived capture is a hard-to-fake lower bound on how long
a business has been online — a useful founding/"online since" signal for private companies with
no registry footprint, and a legitimacy cue (a site first seen 12 years ago is not a thin front).

One yearly-collapsed CDX query gives us the earliest capture plus a coarse activity span without
downloading a domain's entire (possibly huge) capture history."""
import logging
from dataclasses import dataclass
from datetime import date

from app.sources.http import fetcher

log = logging.getLogger(__name__)

CDX = "https://web.archive.org/cdx/search/cdx"
WEEK = 7 * 24 * 3600


@dataclass
class SiteHistory:
    first_capture: str          # ISO date of the earliest archived snapshot
    first_year: int
    years_active: int           # distinct years with at least one capture
    source_url: str

    @property
    def years_online(self) -> float:
        return round((date.today().year - self.first_year), 1)


def _iso(ts: str) -> str:
    # CDX timestamps are YYYYMMDDhhmmss
    return f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}" if len(ts) >= 8 else ts[:4]


async def history(domain: str) -> SiteHistory | None:
    """Earliest capture + activity span for a domain, or None if never archived."""
    if not domain:
        return None
    host = domain.removeprefix("https://").removeprefix("http://").removeprefix("www.").split("/")[0]
    data = await fetcher.get_json(
        "wayback",
        CDX,
        params={"url": host, "collapse": "timestamp:4", "fl": "timestamp", "output": "json", "limit": 60},
        ttl=WEEK,
    )
    # CDX json is a list-of-lists with a header row; empty history → [] or just the header
    if not isinstance(data, list) or len(data) < 2:
        return None
    rows = [r[0] for r in data[1:] if r and isinstance(r[0], str) and r[0].isdigit()]
    if not rows:
        return None
    rows.sort()
    years = sorted({ts[:4] for ts in rows})
    first_ts = rows[0]
    return SiteHistory(
        first_capture=_iso(first_ts),
        first_year=int(first_ts[:4]),
        years_active=len(years),
        source_url=f"https://web.archive.org/web/{first_ts}/{host}",
    )
