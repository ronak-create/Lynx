"""People agent: founders / CEO / board.

Wikidata (P112 founder, P169 CEO, P3320 board) is the structured source, but that only exists
for notable/public companies. For private startups (e.g. Sarvam AI) Wikidata is empty, so we
also extract the leadership team from the company's OWN site — the profile agent already
deep-crawled it into shared context — via the LLM. This is what lets the People card work for
any business, not just ones with a Wikipedia page."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import firecrawl

category = "people"

ROLE_EDGE = {"founder": "FOUNDED_BY", "ceo": "LED_BY", "board_member": "LED_BY"}


class TeamMember(BaseModel):
    name: str = ""
    role: str = Field(default="", description="their title, e.g. Co-founder & CEO, CTO, Head of Research")


class Team(BaseModel):
    people: list[TeamMember] = Field(default_factory=list)


def _edge_for(role: str) -> str:
    return "FOUNDED_BY" if "found" in role.lower() else "LED_BY"


async def run(ctx: AgentContext) -> dict:
    wikidata_people = ctx.profile.get("people", [])
    out: list[dict] = []
    seen: set[str] = set()

    with get_session() as session:
        root_entity = session.get(Entity, ctx.root["entity_id"])

        for person in wikidata_people:
            prov = make_provenance(session, "wikidata", person.source_url)
            node = get_or_create_entity(
                session,
                "person",
                person.name,
                canonical_key=f"wikidata:{person.wikidata_id}" if person.wikidata_id else None,
                attrs={"role": person.role},
            )
            add_edge(session, root_entity, node, ROLE_EDGE.get(person.role, "LED_BY"),
                     attrs={"role": person.role}, provenance=prov)
            out.append({"name": person.name, "role": person.role,
                        "wikidata_url": person.source_url, "source": "wikidata"})
            seen.add(person.name.lower())

        # Fall back to the crawled site for private companies with thin Wikidata coverage.
        site = ctx.shared.get("site_content")
        site_url = ctx.shared.get("site_url")
        if ctx.llm and ctx.llm.available and site and len(wikidata_people) < 4:
            ctx.progress(category, "Extracting the leadership team from the company site")
            team = await ctx.llm.extract(
                f"Extract the leadership team and key people for '{ctx.root['name']}' from its own "
                "website text below — founders, C-suite/executives, and other named leaders. Return "
                "only real, named individuals with their role/title; skip generic team blurbs, "
                "advisors listed without names, and duplicates.",
                site[:8000],
                Team,
            )
            for m in (team.people if team else []):
                name = (m.name or "").strip()
                role = (m.role or "").strip()
                if not name or name.lower() in seen or len(name) < 3:
                    continue
                seen.add(name.lower())
                prov = make_provenance(session, "firecrawl", site_url, method="llm")
                node = get_or_create_entity(session, "person", name, attrs={"role": role})
                add_edge(session, root_entity, node, _edge_for(role),
                         attrs={"role": role}, provenance=prov)
                out.append({"name": name, "role": role, "url": site_url, "source": "site"})

        # Last resort for private companies whose founders aren't on Wikidata or their own site
        # (e.g. Sarvam AI): find them in press/news via web search, then LLM-extract the names.
        if not out and firecrawl.available() and ctx.llm and ctx.llm.available:
            ctx.progress(category, "Searching the web for the founding/leadership team")
            results = await firecrawl.search(f"{ctx.root['name']} founders CEO leadership team", limit=6)
            text = "\n".join(f"{r.title}. {r.description or ''}" for r in results)
            src_url = results[0].url if results else None
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
                    name = (m.name or "").strip()
                    role = (m.role or "").strip()
                    if not name or name.lower() in seen or len(name) < 3:
                        continue
                    seen.add(name.lower())
                    prov = make_provenance(session, "firecrawl", src_url, method="llm")
                    node = get_or_create_entity(session, "person", name, attrs={"role": role})
                    add_edge(session, root_entity, node, _edge_for(role),
                             attrs={"role": role}, provenance=prov)
                    out.append({"name": name, "role": role, "url": src_url, "source": "web"})

        session.commit()

    if out:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"people": out}
