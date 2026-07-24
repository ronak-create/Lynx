"""People agent: founders / CEO / board — a tracked source ladder.

Layers, hit one at a time in descending authority (see [[layers]]):
  1. Wikidata (P112/P169/P3320) — structured, but only exists for notable/public companies.
  2. The company's OWN site — the profile agent already deep-crawled it; LLM-extract the team.
  3. Web search — last resort for private startups (e.g. Sarvam AI) whose founders aren't on
     Wikidata or their own site; find them in press snippets, then LLM-extract.

Every person is deduped by name across layers (first/highest-authority mention wins), so the
same founder never shows twice, and each rung's outcome is reported to the dashboard."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import websearch
from app.sources.layers import Deduper, LayerTracker

category = "people"

ROLE_EDGE = {"founder": "FOUNDED_BY", "ceo": "LED_BY", "board_member": "LED_BY"}


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
            added = 0
            for m in (team.people if team else []):
                cleaned = _clean(m, dedup)
                if not cleaned:
                    continue
                name, role = cleaned
                dedup.seen.add(name.lower())
                prov = make_provenance(session, "site", site_url, method="llm")
                node = get_or_create_entity(session, "person", name, attrs={"role": role})
                add_edge(session, root_entity, node, _edge_for(role),
                         attrs={"role": role}, provenance=prov)
                out.append({"name": name, "role": role, "url": site_url, "source": "site"})
                added += 1
            session.commit()
            tracker.hit("Company site", added)

        # ---- Layer 3: web search (only if we still have nothing) ----
        if out:
            tracker.skip("Web search", "already found the team from higher-authority sources")
        elif not (ctx.llm and ctx.llm.available):
            tracker.skip("Web search", "needs an LLM provider")
        else:
            tracker.start("Web search", "Searching the web for the founding/leadership team")
            results = await websearch.search(f"{ctx.root['name']} founders CEO leadership team", limit=6)
            text = "\n".join(f"{r.title}. {r.description or ''}" for r in results)
            src_url = results[0].url if results else None
            src_id = results[0].source_id if results else "web"
            added = 0
            if text.strip():
                team = await ctx.llm.extract(
                    f"From these search-result snippets about '{ctx.root['name']}', extract that "
                    "company's founders and key executives — real named individuals with their "
                    "role. Only include people clearly associated with THIS company; ignore "
                    "investors, journalists, and unrelated names.",
                    text[:6000],
                    Team,
                )
                for m in (team.people if team else []):
                    cleaned = _clean(m, dedup)
                    if not cleaned:
                        continue
                    name, role = cleaned
                    dedup.seen.add(name.lower())
                    prov = make_provenance(session, src_id, src_url, method="llm")
                    node = get_or_create_entity(session, "person", name, attrs={"role": role})
                    add_edge(session, root_entity, node, _edge_for(role),
                             attrs={"role": role}, provenance=prov)
                    out.append({"name": name, "role": role, "url": src_url, "source": "web"})
                    added += 1
            session.commit()
            tracker.hit("Web search", added)

    if out:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"people": out, "layers": tracker.summary()}
