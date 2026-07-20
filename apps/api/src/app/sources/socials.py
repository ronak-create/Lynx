"""Detect a company's official social/profile accounts across every platform.

Scans raw HTML (the homepage footer is where these live) and any Wikidata-provided social
links, classifies each URL by platform, extracts the handle, and drops share/intent junk.
Deterministic, no keys."""
import re

# (platform, host regex, handle path pattern). Order matters: X before generic.
_RULES: list[tuple[str, str]] = [
    ("X", r"(?:twitter|x)\.com/([A-Za-z0-9_]{1,30})"),
    ("LinkedIn", r"linkedin\.com/(company/[A-Za-z0-9\-_%.]+|in/[A-Za-z0-9\-_%.]+|school/[A-Za-z0-9\-_%.]+)"),
    ("GitHub", r"github\.com/([A-Za-z0-9\-_.]+)"),
    ("YouTube", r"youtube\.com/(@[\w\-.]+|c/[\w\-.]+|channel/[\w\-.]+|user/[\w\-.]+)"),
    ("Instagram", r"instagram\.com/([A-Za-z0-9\-_.]+)"),
    ("Facebook", r"facebook\.com/([A-Za-z0-9\-_.]+)"),
    ("TikTok", r"tiktok\.com/(@[\w\-.]+)"),
    ("Discord", r"(?:discord\.gg|discord\.com/invite)/([A-Za-z0-9\-]+)"),
    ("Telegram", r"t\.me/([A-Za-z0-9\-_]+)"),
    ("Medium", r"medium\.com/(@?[A-Za-z0-9\-_.]+)"),
    ("Reddit", r"reddit\.com/r/([A-Za-z0-9\-_]+)"),
    ("Threads", r"threads\.net/(@?[A-Za-z0-9\-_.]+)"),
    ("Bluesky", r"bsky\.app/profile/([A-Za-z0-9\-_.]+)"),
    ("Twitch", r"twitch\.tv/([A-Za-z0-9\-_]+)"),
    ("Pinterest", r"pinterest\.com/([A-Za-z0-9\-_]+)"),
    ("Crunchbase", r"crunchbase\.com/organization/([A-Za-z0-9\-_.]+)"),
]

# path segments that are actions/pages, not a real account handle
_JUNK = {
    "intent", "share", "sharer", "home", "login", "signup", "signin", "hashtag", "search",
    "watch", "embed", "privacy", "tos", "terms", "help", "about", "policies", "explore",
    "p", "reel", "reels", "status", "posts", "events", "groups", "sharing", "dialog", "tr",
}

_URL = re.compile(r"https?://[^\s)\"'<>\\]+", re.IGNORECASE)


def _classify(url: str) -> dict | None:
    clean = url.split("?")[0].split("#")[0].rstrip("/")
    for platform, pat in _RULES:
        m = re.search(pat, clean, re.IGNORECASE)
        if not m:
            continue
        handle = m.group(1).strip("/").split("/")[-1]
        if not handle or handle.lower() in _JUNK or len(handle) < 2:
            return None
        return {"platform": platform, "url": clean, "handle": handle}
    return None


def extract_socials(text: str | None) -> list[dict]:
    """All official accounts found in a blob of HTML/markdown, deduped by (platform, handle)."""
    if not text:
        return []
    out: list[dict] = []
    seen: set[tuple] = set()
    for url in _URL.findall(text):
        rec = _classify(url)
        if not rec:
            continue
        key = (rec["platform"], rec["handle"].lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(rec)
    return out


def merge(*groups: list[dict]) -> list[dict]:
    """Merge several social lists, keeping the first URL seen per (platform, handle)."""
    out: list[dict] = []
    seen: set[tuple] = set()
    order = {p: i for i, (p, _) in enumerate(_RULES)}
    for g in groups:
        for rec in g:
            key = (rec["platform"], rec["handle"].lower())
            if key in seen:
                continue
            seen.add(key)
            out.append(rec)
    out.sort(key=lambda r: order.get(r["platform"], 99))
    return out
