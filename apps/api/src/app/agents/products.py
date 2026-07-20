"""Products agent: what the company makes/sells.

Three tiers, most-structured first (parallels people.py):
  1. Wikidata P1056 products — exists only for notable/public companies.
  2. The company's OWN site — the profile agent already LLM-extracted `offerings` into
     shared context, so we reuse them (no extra LLM call). This is what makes the Products
     card work for private startups with no Wikipedia footprint.
  3. Web-search fallback — for companies thin on both, find products/services in press via
     Firecrawl search + LLM.
Every product becomes a `product` entity with a MAKES edge from the root."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import firecrawl

category = "products"


class ProductList(BaseModel):
    products: list[str] = Field(default_factory=list, description="named products or services this company offers")


async def run(ctx: AgentContext) -> dict:
    wikidata_products = ctx.profile.get("products", [])
    out: list[dict] = []
    seen: set[str] = set()

    with get_session() as session:
        root_entity = session.get(Entity, ctx.root["entity_id"])

        def add(name: str, source: str, source_url: str | None, *, provider: str,
                method: str | None = None, wikidata_id: str | None = None) -> None:
            name = (name or "").strip()
            if not name or len(name) < 2 or name.lower() in seen:
                return
            seen.add(name.lower())
            prov = make_provenance(session, provider, source_url, method=method)
            node = get_or_create_entity(
                session, "product", name,
                canonical_key=f"wikidata:{wikidata_id}" if wikidata_id else None,
            )
            add_edge(session, root_entity, node, "MAKES", provenance=prov)
            out.append({"name": name, "source": source, "source_url": source_url,
                        "wikidata_id": wikidata_id})

        # Tier 1: Wikidata
        for product in wikidata_products:
            add(product.name, "wikidata", product.source_url,
                provider="wikidata", wikidata_id=product.wikidata_id)
        # Release the write lock before emitting: progress events write job_events on a second
        # connection, which deadlocks against our own open transaction.
        session.commit()
        ctx.progress(category, f"Found {len(out)} products in Wikidata")

        # Tier 2: offerings the profile agent already pulled from the company's own site.
        site_profile = ctx.shared.get("site_profile") or {}
        site_url = ctx.shared.get("site_url")
        offerings = site_profile.get("offerings") or []
        if offerings:
            ctx.progress(category, f"Adding {len(offerings)} offerings from the company site")
            for name in offerings:
                add(name, "site", site_url, provider="firecrawl", method="llm")

        # Tier 3: last resort — find products/services in press via web search.
        if not out and firecrawl.available() and ctx.llm and ctx.llm.available:
            session.commit()  # release the write lock before progress + network work
            ctx.progress(category, "Searching the web for products and services")
            results = await firecrawl.search(f"{ctx.root['name']} products services", limit=6)
            text = "\n".join(f"{r.title}. {r.description or ''}" for r in results)
            src_url = results[0].url if results else None
            if text.strip():
                extracted = await ctx.llm.extract(
                    f"From these search-result snippets about '{ctx.root['name']}', list that "
                    "company's actual products or services — real named offerings. Ignore "
                    "competitors' products, generic categories, and unrelated names.",
                    text[:6000],
                    ProductList,
                )
                for name in (extracted.products if extracted else []):
                    add(name, "web", src_url, provider="firecrawl", method="llm")

        session.commit()

    if out:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"products": out}
