"""Domain intelligence for the legitimacy check — all free, no API keys, no new deps.

Three independent signals a real business almost always has and a thrown-together scam
usually lacks:
  * a domain that has existed for a while         (RDAP registration date)
  * a valid TLS certificate from a known CA       (stdlib ssl handshake)
  * DNS that resolves + mail (MX) records set up  (DNS-over-HTTPS via dns.google)

Each probe fails soft: a missing signal is information, never an exception that breaks
the run."""
import asyncio
import logging
import socket
import ssl
from datetime import datetime, timezone

from dateutil import parser as dateparser

from app.sources.http import fetcher

log = logging.getLogger(__name__)

RDAP = "https://rdap.org/domain/{domain}"
DOH = "https://dns.google/resolve"
YEAR = 365 * 24 * 3600


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _registration_date(domain: str) -> str | None:
    """Domain creation date from RDAP (redirects to the authoritative registry)."""
    data = await fetcher.get_json("rdap", RDAP.format(domain=domain), ttl=YEAR)
    if not isinstance(data, dict):
        return None
    for event in data.get("events") or []:
        if isinstance(event, dict) and event.get("eventAction") == "registration":
            return event.get("eventDate")
    return None


def _tls_probe(host: str) -> dict:
    """Synchronous TLS handshake — issuer + validity window of the served certificate."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=6) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
    except (ssl.SSLCertVerificationError, ssl.SSLError) as exc:
        # reachable but the cert doesn't validate — a real negative signal, not just "down"
        return {"secure": False, "reachable": True, "error": str(exc.args[-1] if exc.args else exc)}
    except (OSError, socket.timeout) as exc:
        return {"secure": False, "reachable": False, "error": str(exc)}

    issuer = {k: v for part in cert.get("issuer", ()) for (k, v) in part}
    not_after = cert.get("notAfter")
    days_left = None
    expired = False
    if not_after:
        try:
            exp = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            days_left = (exp - _now()).days
            expired = days_left < 0
        except ValueError:
            pass
    return {
        "secure": not expired,
        "reachable": True,
        "issuer": issuer.get("organizationName") or issuer.get("commonName"),
        "expires": not_after,
        "days_to_expiry": days_left,
        "expired": expired,
    }


async def _dns(domain: str) -> dict:
    """A-record resolution (stdlib) + MX presence (DNS-over-HTTPS, cached)."""
    try:
        resolves = bool(await asyncio.to_thread(socket.getaddrinfo, domain, 443))
    except OSError:
        resolves = False

    mx: list[str] = []
    data = await fetcher.get_json("doh", DOH, params={"name": domain, "type": "MX"}, ttl=7 * 24 * 3600)
    if isinstance(data, dict):
        for ans in data.get("Answer") or []:
            record = (ans.get("data") or "").strip()
            if record:
                mx.append(record.split()[-1].rstrip("."))
    return {"resolves": resolves, "has_mx": bool(mx), "mx": mx[:5]}


async def domain_intel(domain: str) -> dict:
    """Bundle the three probes for one domain, running them concurrently."""
    domain = domain.strip().lower().removeprefix("www.")
    reg, tls, dns = await asyncio.gather(
        _registration_date(domain),
        asyncio.to_thread(_tls_probe, domain),
        _dns(domain),
    )

    age_days = age_years = None
    if reg:
        try:
            age_days = (_now() - dateparser.parse(reg).astimezone(timezone.utc)).days
            age_years = round(age_days / 365.25, 1)
        except (ValueError, OverflowError, TypeError):
            pass

    return {
        "domain": domain,
        "registered": reg[:10] if reg else None,
        "age_days": age_days,
        "age_years": age_years,
        "tls": tls,
        "dns": dns,
    }
