"""Shared relevance filtering. Free search sources (Google News, Reddit, web search) match
loosely — searching a common name like "Ronak Parmar" returns unrelated local news. Every
agent that ingests search results runs them through here so only material that actually names
the entity survives. This is what keeps the dashboard, graph, and documentary about the entity
the user asked for, instead of whatever the words happened to match."""
import re

# generic words that must not, on their own, make a result "about" the entity
_STOPWORDS = {
    "technology", "technologies", "tech", "inc", "llc", "ltd", "limited", "corp",
    "corporation", "company", "co", "the", "and", "solutions", "software", "systems",
    "labs", "group", "global", "digital", "services", "pvt", "private", "app", "apps",
    "studio", "studios", "ventures", "capital", "holdings", "media", "network", "online",
    "world", "international", "india", "usa", "official", "home",
}


def distinctive_tokens(name: str) -> list[str]:
    """The identifying words of an entity name (drops generic suffixes like 'Technology').
    For a two-word personal name both tokens are kept (neither is generic)."""
    toks = [t for t in re.split(r"[^a-z0-9]+", name.lower()) if len(t) >= 3]
    distinctive = [t for t in toks if t not in _STOPWORDS and len(t) >= 4]
    return distinctive or toks


def haystack(*fields: object) -> str:
    return " ".join(str(f) for f in fields if f).lower()


def is_relevant(text: str, tokens: list[str], require: int = 1) -> bool:
    """True if the text mentions at least `require` of the distinctive tokens.
    For multi-token names (e.g. a person 'ronak parmar') we require the tokens that
    exist, so a headline must actually name them, not just share one common word."""
    if not tokens:
        return True
    hits = sum(1 for t in tokens if t in text)
    need = min(require, len(tokens))
    # a 2+ token name (person / distinctive brand) should match most of its tokens
    if len(tokens) >= 2:
        need = max(need, len(tokens) - (1 if len(tokens) > 2 else 0)) if len(tokens) <= 3 else 2
    return hits >= need


def filter_items(items: list[dict], tokens: list[str], fields: tuple[str, ...] = ("title", "snippet", "url")) -> list[dict]:
    if not tokens:
        return items
    out = []
    for it in items:
        hay = haystack(*(it.get(f) for f in fields))
        if is_relevant(hay, tokens):
            out.append(it)
    return out
