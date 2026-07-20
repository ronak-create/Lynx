"""Operational signals from the open web — tech stack, hiring, and reviews. All free.

  * fingerprint_tech  — pattern-match a homepage's HTML for the frameworks, analytics,
                        hosting and marketing tools it ships (BuiltWith-style, deterministic).
  * hiring            — probe the two dominant public ATS boards (Greenhouse, Lever) by slug
                        and count open roles. A hiring company is an operating company.
  * reviews           — Trustpilot's public aggregate rating (parsed from embedded JSON-LD).

None of these need an API key; failures return empty so the agent degrades cleanly."""
import logging
import re

from app.sources import firecrawl
from app.sources.http import fetcher

log = logging.getLogger(__name__)

# (display name, category, regex) — matched case-insensitively against homepage HTML
_TECH_SIGNATURES: list[tuple[str, str, str]] = [
    ("Next.js", "framework", r"/_next/|__NEXT_DATA__"),
    ("Nuxt", "framework", r"/_nuxt/|__NUXT__"),
    ("Gatsby", "framework", r"___gatsby"),
    ("SvelteKit", "framework", r"__sveltekit|/_app/immutable/"),
    ("Angular", "framework", r"ng-version="),
    ("Vue.js", "framework", r"__vue__|data-v-[0-9a-f]{8}"),
    ("React", "framework", r"data-reactroot|/_next/|react-dom"),
    ("WordPress", "cms", r"wp-content|wp-json|content=\"WordPress"),
    ("Shopify", "ecommerce", r"cdn\.shopify\.com|Shopify\.theme"),
    ("Wix", "cms", r"static\.wixstatic\.com|X-Wix-"),
    ("Squarespace", "cms", r"squarespace\.com|static1\.squarespace"),
    ("Webflow", "cms", r"assets\.website-files\.com|webflow\.io"),
    ("Framer", "cms", r"framerusercontent\.com|framer\.com"),
    ("HubSpot", "marketing", r"js\.hs-scripts\.com|hubspot"),
    ("Intercom", "support", r"widget\.intercom\.io|intercomcdn"),
    ("Drift", "support", r"js\.driftt\.com|drift\.com"),
    ("Zendesk", "support", r"zdassets\.com|zendesk"),
    ("Google Analytics", "analytics", r"google-analytics\.com|gtag\(|googletagmanager\.com"),
    ("Segment", "analytics", r"cdn\.segment\.com"),
    ("Mixpanel", "analytics", r"mixpanel"),
    ("Amplitude", "analytics", r"amplitude\.com|cdn\.amplitude"),
    ("Hotjar", "analytics", r"static\.hotjar\.com"),
    ("Plausible", "analytics", r"plausible\.io"),
    ("Stripe", "payments", r"js\.stripe\.com"),
    ("PayPal", "payments", r"paypal\.com/sdk|paypalobjects"),
    ("Cloudflare", "infra", r"cdn-cgi/|cloudflare"),
    ("Vercel", "infra", r"vercel\.app|/_vercel/"),
    ("Google Fonts", "fonts", r"fonts\.googleapis\.com"),
    ("Adobe Fonts", "fonts", r"use\.typekit\.net"),
]


def fingerprint_tech(html: str) -> list[dict]:
    """Detected technologies as [{name, category}], deduped, in signature order."""
    found: list[dict] = []
    seen: set[str] = set()
    for name, cat, pattern in _TECH_SIGNATURES:
        if name in seen:
            continue
        if re.search(pattern, html, re.IGNORECASE):
            found.append({"name": name, "category": cat})
            seen.add(name)
    return found


def _slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", name.lower())
    for suffix in ("inc", "llc", "ltd", "corp", "co", "company", "technologies", "labs"):
        if s.endswith(suffix) and len(s) > len(suffix) + 2:
            s = s[: -len(suffix)]
    return s


async def hiring(name: str, domain: str | None) -> dict:
    """Open roles from public ATS boards (Greenhouse, then Lever), matched by company slug."""
    candidates = [_slug(name)]
    if domain:
        candidates.append(_slug(domain.split(".")[0]))
    tried: set[str] = set()

    for slug in candidates:
        if not slug or slug in tried:
            continue
        tried.add(slug)

        gh = await fetcher.get_json(
            "generic", f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", ttl=6 * 3600
        )
        if isinstance(gh, dict) and gh.get("jobs"):
            jobs = gh["jobs"]
            return {
                "available": True,
                "source": "Greenhouse",
                "open_roles": len(jobs),
                "sample": [
                    {"title": j.get("title"), "location": (j.get("location") or {}).get("name")}
                    for j in jobs[:6]
                ],
            }

        lever = await fetcher.get_json(
            "generic", f"https://api.lever.co/v0/postings/{slug}?mode=json", ttl=6 * 3600
        )
        if isinstance(lever, list) and lever:
            return {
                "available": True,
                "source": "Lever",
                "open_roles": len(lever),
                "sample": [
                    {"title": j.get("text"), "location": (j.get("categories") or {}).get("location")}
                    for j in lever[:6]
                ],
            }

    return {"available": False}


async def reviews(domain: str) -> dict:
    """Trustpilot aggregate rating for a domain. Trustpilot 403s plain requests, so we parse
    JSON-LD when a direct fetch slips through, else fall back to a Firecrawl scrape (which
    bypasses the bot block) and parse the rendered text."""
    url = f"https://www.trustpilot.com/review/{domain}"
    unavailable = {"available": False}

    html = await fetcher.get_text("generic", url, ttl=24 * 3600)
    if html:
        rating = re.search(r'"ratingValue":\s*"?([\d.]+)', html)
        count = re.search(r'"reviewCount":\s*"?(\d+)', html) or re.search(r'"ratingCount":\s*"?(\d+)', html)
        if rating:
            return {
                "available": True, "source": "Trustpilot", "rating": float(rating.group(1)),
                "count": int(count.group(1)) if count else None, "url": url,
            }

    if firecrawl.available():
        md = await firecrawl.scrape(url)
        if md:
            rating = (
                re.search(r"TrustScore[^\d]{0,10}([0-5](?:\.\d)?)", md, re.IGNORECASE)
                or re.search(r"([0-5](?:\.\d)?)\s*(?:out of 5|/\s*5)", md, re.IGNORECASE)
            )
            count = re.search(r"([\d,]+)\s+(?:total\s+)?reviews?", md, re.IGNORECASE)
            if rating:
                return {
                    "available": True, "source": "Trustpilot", "rating": float(rating.group(1)),
                    "count": int(count.group(1).replace(",", "")) if count else None, "url": url,
                }

    return unavailable
