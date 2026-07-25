"""Recent posts from a company's X (Twitter) profile via the public syndication timeline.

No auth: X's syndication endpoint serves an HTML page whose embedded __NEXT_DATA__ JSON carries
the recent timeline. It is rate-limited and undocumented, so every failure degrades to an empty
list (the UI hides the block) rather than erroring the request."""
import json
import re

from app.sources.http import fetcher

_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)

# X's syndication endpoint 429s the default bot UA; it only serves the timeline to a browser UA.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


async def recent_posts(handle: str, limit: int = 8) -> list[dict]:
    handle = (handle or "").lstrip("@").strip()
    if not handle or not re.fullmatch(r"[A-Za-z0-9_]{1,15}", handle):
        return []

    url = f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}"
    # X 429s every Python HTTP client on fingerprint but serves curl's fingerprint — go via curl.
    html = await fetcher.get_text_via_curl(
        "x_syndication",
        url,
        headers={
            "User-Agent": _BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
        ttl=1800,  # 30 min
    )
    if not html:
        return []
    m = _NEXT_DATA.search(html)
    if not m:
        return []
    try:
        entries = json.loads(m.group(1))["props"]["pageProps"]["timeline"]["entries"]
    except (json.JSONDecodeError, KeyError, TypeError):
        return []

    out: list[dict] = []
    for e in entries:
        tweet = (e.get("content") or {}).get("tweet")
        if not isinstance(tweet, dict):
            continue
        tid = tweet.get("id_str") or tweet.get("id")
        text = (tweet.get("full_text") or tweet.get("text") or "").strip()
        if not text:
            continue
        out.append(
            {
                "id": tid,
                "text": text,
                "created_at": tweet.get("created_at"),
                "likes": tweet.get("favorite_count"),
                "replies": tweet.get("reply_count"),
                "retweets": tweet.get("retweet_count"),
                "url": f"https://x.com/{handle}/status/{tid}" if tid else f"https://x.com/{handle}",
            }
        )
        if len(out) >= limit:
            break
    return out
