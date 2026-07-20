"""Web presence agent: official site + socials from Wikidata, GitHub org + top repos
(repo languages double as a tech-stack signal)."""
from app.agents.base import AgentContext
from app.agents.legitimacy import _domain_for
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, add_edge, get_or_create_entity, make_provenance
from app.sources import github, reader, socials

category = "web_presence"


async def run(ctx: AgentContext) -> dict:
    links = [l.model_dump(mode="json") for l in ctx.profile.get("links", [])]
    ctx.progress(category, f"Found {len(links)} official links")

    repos: list[dict] = []
    org = await github.find_org(ctx.root["name"])
    if org:
        ctx.progress(category, f"GitHub org: {org['login']}")
        links.append({"label": "github", "url": org["url"], "source_id": "github", "source_url": org["url"]})
        repo_records = await github.top_repos(org["login"])
        repos = [r.model_dump(mode="json") for r in repo_records]

    # Comprehensive official-channel detection: scan the homepage (footer socials live there),
    # the deep-crawled site, Wikidata social claims, and the GitHub org — deduped by platform.
    domain = _domain_for(ctx)
    # Jina Reader (with link summary) renders JS and lists footer links, so JS-heavy sites
    # (Stripe, Vercel…) surface their socials — a raw fetch would miss them.
    homepage = await reader.read_markdown(f"https://{domain}", links=True) if domain else None
    channels = socials.extract_socials(
        "\n".join([homepage or "", ctx.shared.get("site_content") or "",
                   *[l.get("url", "") for l in links], org["url"] if org else ""])
    )
    ctx.progress(category, f"{len(channels)} official channels")

    languages = sorted({r["language"] for r in repos if r.get("language")})
    with get_session() as session:
        entity = session.get(Entity, ctx.root["entity_id"])
        for link in links:
            prov = make_provenance(session, link.get("source_id", "wikidata"), link.get("source_url"))
            add_claim(session, entity, f"link_{link['label']}", {"text": link["url"]}, provenance=prov)
        if languages:
            prov = make_provenance(session, "github", org["url"] if org else None)
            for lang in languages:
                tech = get_or_create_entity(session, "technology", lang)
                add_edge(session, entity, tech, "USES_TECH", confidence=0.9, provenance=prov)
        session.commit()

    if languages:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"links": links, "github_org": org, "repos": repos, "languages": languages, "socials": channels}
