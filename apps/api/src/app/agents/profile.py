"""Profile agent — the discovery step of the research process.

It deep-crawls the company's OWN website (home + about/services/team/pricing/work),
extracts a structured profile, and publishes what it learned into the shared research
context so every later agent (competitors, funding, social, documentary) works from real,
first-party information instead of guessing. This is what makes Lynx work for ANY business,
and what lets the agents build on each other rather than each starting blind."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.extraction import extract_graph, persist_extraction
from app.graph.resolution import add_claim, make_provenance
from app.sources import firecrawl, reader

category = "profile"


class PricingTier(BaseModel):
    name: str = ""
    price: str = ""
    detail: str = ""


class SiteProfile(BaseModel):
    what_they_do: str = Field(default="", description="2-4 sentences on what the business does")
    offerings: list[str] = Field(default_factory=list, description="products or services offered")
    target_market: str = ""
    business_model: str = Field(default="", description="e.g. SaaS subscription, marketplace, agency, retail")
    pricing: list[PricingTier] = Field(default_factory=list)
    headquarters: str = ""
    founded: str = ""
    notable_clients: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list, description="named tech/frameworks they use or offer")


async def run(ctx: AgentContext) -> dict:
    root = ctx.root

    ctx.progress(category, "Locating official website")
    site = f"https://{root['domain'].removeprefix('www.')}" if root.get("domain") else None
    if not site and firecrawl.available():
        site = await firecrawl.find_official_site(root["name"], None)
    if not site:
        return {"available": False, "message": "Could not locate an official website."}

    # Layered deep read: Firecrawl when available, but always fall back to (or top up with) the
    # free Jina-based reader, so JS-heavy or Firecrawl-less runs still get real, multi-page content.
    ctx.progress(category, f"Deep-crawling {site}")
    markdown = await firecrawl.deep_scrape(site) if firecrawl.available() else None
    # Top up when Firecrawl is absent, returned a thin blob, or only reached a single page
    # (coverage is about page count, not length) — the Jina reader adds about/team/careers pages.
    if not markdown or markdown.count("# PAGE:") <= 1 or len(markdown) < 1500:
        deep = await reader.deep_read(site)
        if deep and len(deep) > len(markdown or ""):
            markdown = deep
    if not markdown:
        return {"available": False, "message": f"Could not read {site}.", "site": site}

    ctx.shared["site_url"] = site  # so later agents (legitimacy) reuse it, no re-search
    ctx.shared["site_content"] = markdown  # hand the raw crawl to later agents

    profile: SiteProfile | None = None
    if ctx.llm and ctx.llm.available:
        ctx.progress(category, "Reading the site and summarizing the business")
        profile = await ctx.llm.extract(
            f"Extract a thorough business profile for '{root['name']}' from its own website "
            "(multiple pages are concatenated below). Use only what the text supports; leave "
            "fields blank if unknown. Prefer specifics over generic marketing phrases.",
            markdown[:10000],  # keep the extraction prompt within free-tier token budgets
            SiteProfile,
        )
        if profile:
            ctx.shared["site_profile"] = profile.model_dump()
            # publish a short dossier that downstream agents use to stay grounded
            dossier = profile.what_they_do or ""
            if profile.offerings:
                dossier += "\nOfferings: " + ", ".join(profile.offerings[:10])
            if profile.target_market:
                dossier += f"\nTarget market: {profile.target_market}"
            ctx.shared["dossier"] = dossier.strip()

        # dense graph straight from the site: services, partners, clients, tech, people, locations
        ctx.progress(category, "Mapping associations from the site")
        extraction = await extract_graph(ctx.llm, root["name"], markdown)
        if extraction:
            with get_session() as session:
                root_entity = session.get(Entity, root["entity_id"])
                if profile and profile.what_they_do and not root_entity.summary:
                    root_entity.summary = profile.what_they_do
                prov = make_provenance(session, "firecrawl", site, method="llm")
                add_claim(session, root_entity, "website", {"text": site}, provenance=prov)
                persist_extraction(session, root_entity, extraction, "firecrawl", site)
                session.commit()
            ctx.emit("graph_delta", agent=category, payload={})

    result: dict = {"available": True, "site": site, "pages_crawled": markdown.count("# PAGE:")}
    if profile:
        result.update(profile.model_dump())
    return result
