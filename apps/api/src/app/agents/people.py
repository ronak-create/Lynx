"""People agent: founders / CEO / board — a tracked source ladder.

Layers, hit one at a time in descending authority (see [[layers]]):
  1. Wikidata (P112/P169/P3320) — structured, but only exists for notable/public companies.
  2. The company's OWN site — the profile agent already deep-crawled it; LLM-extract the team.
  3. Web search — last resort for private startups (e.g. Sarvam AI) whose founders aren't on
     Wikidata or their own site; find them in press snippets, then LLM-extract.

Every person is deduped by name across layers (first/highest-authority mention wins), so the
same founder never shows twice, and each rung's outcome is reported to the dashboard.

After the team is assembled, a lightweight social-enrichment pass web-searches each person and
regex-extracts their ACTUAL profile URLs (LinkedIn /in/, X/Twitter, GitHub) and a plausible
email from the result set — real handles only, so the dashboard links straight to their profile
instead of a search page. Anything not found is simply left off (the UI hides missing icons)."""
import asyncio
import re

from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import websearch
from app.sources.layers import Deduper, LayerTracker

category = "people"

ROLE_EDGE = {"founder": "FOUNDED_BY", "ceo": "LED_BY", "board_member": "LED_BY"}

# --- social enrichment: patterns for real profile URLs + reserved (non-profile) handles ---
_LINKEDIN_RE = re.compile(r"https?://[^\s\"'<>]*linkedin\.com/in/[A-Za-z0-9\-_%]+", re.I)
_TWITTER_RE = re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/([A-Za-z0-9_]{2,15})", re.I)
_GITHUB_RE = re.compile(r"https?://(?:www\.)?github\.com/([A-Za-z0-9][A-Za-z0-9\-]{0,38})", re.I)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_TW_RESERVED = {"home", "search", "explore", "notifications", "messages", "i", "intent",
                "share", "hashtag", "login", "signup", "about", "tos", "privacy", "settings", "compose"}
_GH_RESERVED = {"features", "about", "pricing", "team", "enterprise", "login", "join", "marketplace",
                "topics", "collections", "trending", "events", "sponsors", "settings", "orgs", "search",
                "explore", "notifications", "new", "organizations", "site", "contact", "security", "readme"}

# generic corporate suffixes/words to ignore when matching a company's *distinctive* tokens
_COMPANY_STOP = {"technology", "technologies", "tech", "inc", "llc", "ltd", "limited", "pvt", "private",
                 "corp", "corporation", "company", "co", "solutions", "labs", "systems", "software",
                 "group", "global", "services", "holdings", "ventures", "the", "and"}


def _company_core(company: str) -> list[str]:
    """The distinctive tokens of a company name (drops generic suffixes like 'Technology'), used
    to confirm a person genuinely co-occurs with THIS company and not a mere namesake."""
    toks = re.findall(r"[a-z0-9]+", company.lower())
    core = [t for t in toks if t not in _COMPANY_STOP and len(t) >= 3]
    return core or toks


def _wb(token: str) -> re.Pattern:
    """Whole-word matcher — critical so 'Kesari' does NOT match inside 'KesariX' (the substring
    bug that let a namesake pass verification)."""
    return re.compile(rf"\b{re.escape(token)}\b", re.I)


async def _is_associated(name: str, company: str, core: list[str]) -> bool:
    """Confirm a person genuinely co-occurs with THIS company — guards against name-collision
    false positives (a namesake matched only on a shared token, e.g. 'Ganesh Kesari' surfacing
    for 'KesariX Technology'). Requires a single result that mentions BOTH the person's surname
    and a distinctive company token as whole words. We never show a person we can't tie to the
    company — showing false/made-up people is the one thing this tool must not do."""
    parts = name.split()
    last = parts[-1] if parts else ""
    if len(last) < 3 or not core:
        return False
    try:
        results = await websearch.search(f'"{name}" {company}', limit=6)
    except Exception:
        return False
    last_re = _wb(last)
    core_res = [_wb(c) for c in core]
    for r in results:
        blob = f"{r.title} {r.description or ''} {r.url}"
        if last_re.search(blob) and any(cr.search(blob) for cr in core_res):
            return True
    return False


async def _commit_verified(ctx: AgentContext, session, root_entity, members, dedup: Deduper,
                           src_id: str, src_url: str | None, source: str, out: list[dict]) -> int:
    """Clean → verify-association → persist. People that can't be tied to the company are dropped
    (never created as entities/edges), so false positives reach neither the card nor the graph."""
    candidates: list[tuple[str, str]] = []
    for m in members:
        cleaned = _clean(m, dedup)
        if cleaned:
            candidates.append(cleaned)
    if not candidates:
        return 0
    core = _company_core(ctx.root["name"])
    checks = await asyncio.gather(*[_is_associated(n, ctx.root["name"], core) for n, _ in candidates])
    added = 0
    for (name, role), ok in zip(candidates, checks):
        if not ok or name.lower() in dedup:
            continue
        dedup.seen.add(name.lower())
        prov = make_provenance(session, src_id, src_url, method="llm")
        node = get_or_create_entity(session, "person", name, attrs={"role": role})
        add_edge(session, root_entity, node, _edge_for(role), attrs={"role": role}, provenance=prov)
        out.append({"name": name, "role": role, "url": src_url, "source": source})
        added += 1
    return added


async def _enrich_socials(ctx: AgentContext, out: list[dict], company: str) -> None:
    """Best-effort: web-search each person and attach their real social profile URLs + email.
    Deterministic (regex over the result set), so no hallucinated links; runs even without an LLM."""
    sem = asyncio.Semaphore(3)  # keep concurrent DDG hits polite

    async def one(person: dict) -> None:
        name = str(person.get("name") or "")
        if not name:
            return
        async with sem:
            try:
                results = await websearch.search(f"{name} {company} linkedin twitter github", limit=6)
            except Exception:
                return
        text = " ".join(f"{r.url} {r.title} {r.description or ''}" for r in results)

        li = _LINKEDIN_RE.search(text)
        if li:
            person["linkedin"] = li.group(0).rstrip("/")
        tw = _TWITTER_RE.search(text)
        if tw and tw.group(1).lower() not in _TW_RESERVED:
            person["twitter"] = f"https://x.com/{tw.group(1)}"
        gh = _GITHUB_RE.search(text)
        if gh and gh.group(1).lower() not in _GH_RESERVED:
            person["github"] = f"https://github.com/{gh.group(1)}"

        # email: only accept one clearly tied to this person (name in local part) or the company domain
        parts = name.lower().split()
        first, last = (parts[0] if parts else ""), (parts[-1] if len(parts) > 1 else "")
        domain = (ctx.root.get("domain") or "").lower()
        for m in _EMAIL_RE.finditer(text):
            e = m.group(0).lower()
            local, _, dom = e.partition("@")
            if (len(first) >= 3 and first in local) or (len(last) >= 3 and last in local) or (domain and domain in dom):
                person["email"] = e
                break

    await asyncio.gather(*[one(p) for p in out[:10]])


class TeamMember(BaseModel):
    name: str = ""
    role: str = Field(default="", description="their title, e.g. Co-founder & CEO, CTO, Head of Research")


class Team(BaseModel):
    people: list[TeamMember] = Field(default_factory=list)


def _edge_for(role: str) -> str:
    return "FOUNDED_BY" if "found" in role.lower() else "LED_BY"


def _clean(m: TeamMember, dedup: Deduper) -> tuple[str, str] | None:
    """Validate + dedup one extracted member; returns (name, role) or None to drop."""
    name = (m.name or "").strip()
    role = (m.role or "").strip()
    if not name or len(name) < 3 or name.lower() in dedup:
        return None
    return name, role


async def run(ctx: AgentContext) -> dict:
    wikidata_people = ctx.profile.get("people", [])
    tracker = LayerTracker(ctx, category, [
        ("Wikidata", "wikidata"),
        ("Company site", "site"),
        ("Web search", "web"),
    ])
    dedup = Deduper()
    out: list[dict] = []

    # ---- Layer 1: Wikidata (no network — profile pre-fetched it) ----
    tracker.start("Wikidata", "Reading structured records (Wikidata)")
    with get_session() as session:
        root_entity = session.get(Entity, ctx.root["entity_id"])
        for person in wikidata_people:
            if person.name.lower() in dedup:
                continue
            dedup.seen.add(person.name.lower())
            prov = make_provenance(session, "wikidata", person.source_url)
            node = get_or_create_entity(
                session, "person", person.name,
                canonical_key=f"wikidata:{person.wikidata_id}" if person.wikidata_id else None,
                attrs={"role": person.role},
            )
            add_edge(session, root_entity, node, ROLE_EDGE.get(person.role, "LED_BY"),
                     attrs={"role": person.role}, provenance=prov)
            out.append({"name": person.name, "role": person.role,
                        "wikidata_url": person.source_url, "source": "wikidata"})
        # Release the write lock before emitting (a second connection writes job_events;
        # emitting mid-write self-deadlocks). Commit, THEN report the rung.
        session.commit()
        tracker.hit("Wikidata", len(out))

        # ---- Layer 2: the company's own site (LLM over the deep crawl) ----
        site = ctx.shared.get("site_content")
        site_url = ctx.shared.get("site_url")
        if not (ctx.llm and ctx.llm.available and site and len(wikidata_people) < 4):
            tracker.skip("Company site", "no site text / LLM, or Wikidata already sufficient")
        else:
            tracker.start("Company site", "Extracting the leadership team from the company site")
            team = await ctx.llm.extract(
                f"Extract the leadership team and key people for '{ctx.root['name']}' from its own "
                "website text below — founders, C-suite/executives, and other named leaders. Return "
                "only real, named individuals with their role/title; skip generic team blurbs, "
                "advisors listed without names, and duplicates.",
                site[:8000],
                Team,
            )
            # even own-site extractions are verified: if the wrong site was resolved, its people
            # must not surface as this company's team. Unverifiable names are dropped, not shown.
            added = await _commit_verified(
                ctx, session, root_entity, team.people if team else [],
                dedup, "site", site_url, "site", out,
            )
            session.commit()
            tracker.hit("Company site", added)

        # ---- Layer 3: web search (only if we still have nothing) ----
        if out:
            tracker.skip("Web search", "already found the team from higher-authority sources")
        elif not (ctx.llm and ctx.llm.available):
            tracker.skip("Web search", "needs an LLM provider")
        else:
            tracker.start("Web search", "Searching the web for the founding/leadership team")
            # quote the company so DDG matches the full name, not a shared token (e.g. "Kesari")
            results = await websearch.search(f'"{ctx.root["name"]}" founders CEO leadership team', limit=6)
            text = "\n".join(f"{r.title}. {r.description or ''}" for r in results)
            src_url = results[0].url if results else None
            src_id = results[0].source_id if results else "web"
            added = 0
            if text.strip():
                team = await ctx.llm.extract(
                    f"From these search-result snippets about '{ctx.root['name']}', extract ONLY "
                    "people the snippets explicitly tie to THIS exact company as a founder or "
                    "executive — the text must state their role AT this company. Do NOT include "
                    "someone merely because their name resembles the company name, and ignore "
                    "investors, journalists, analysts, and people from other companies. When in "
                    "doubt, leave them out.",
                    text[:6000],
                    Team,
                )
                # every web-derived name is association-verified before it's trusted
                added = await _commit_verified(
                    ctx, session, root_entity, team.people if team else [],
                    dedup, src_id, src_url, "web", out,
                )
            session.commit()
            tracker.hit("Web search", added)

    # enrich the assembled team with real social profile URLs + email (best-effort, outside the
    # DB session so long web searches don't hold the write lock)
    if out:
        ctx.progress(category, "Finding social profiles for the team")
        try:
            await _enrich_socials(ctx, out, ctx.root["name"])
        except Exception:
            pass  # enrichment is a nice-to-have; never fail the agent over it

    if out:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"people": out, "layers": tracker.summary()}
