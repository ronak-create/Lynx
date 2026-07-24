"""Products agent: what the company makes/sells — a tracked source ladder.

Layers, hit one at a time, most-structured first (parallels people.py, see [[layers]]):
  1. Wikidata P1056 products — exists only for notable/public companies.
  2. The company's OWN site — the profile agent already LLM-extracted `offerings` into shared
     context, so we reuse them (no extra LLM call). Fills gaps beyond Wikidata.
  3. Web search — last resort: find products/services in press snippets + LLM, only if the
     higher-authority layers came up empty.
Every product is deduped by name across layers and becomes a `product` entity with a MAKES
edge from the root; each rung's outcome is reported to the dashboard."""
from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_edge, get_or_create_entity, make_provenance
from app.sources import websearch
from app.sources.layers import LayerTracker

category = "products"


class ProductList(BaseModel):
    products: list[str] = Field(default_factory=list, description="named products or services this company offers")


async def run(ctx: AgentContext) -> dict:
    wikidata_products = ctx.profile.get("products", [])
    tracker = LayerTracker(ctx, category, [
        ("Wikidata", "wikidata"),
        ("Company site", "site"),
        ("Web search", "web"),
    ])
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

        # ---- Layer 1: Wikidata ----
        tracker.start("Wikidata", "Reading structured records (Wikidata)")
        for product in wikidata_products:
            add(product.name, "wikidata", product.source_url,
                provider="wikidata", wikidata_id=product.wikidata_id)
        # Release the write lock before emitting (second connection writes job_events →
        # self-deadlock if we emit mid-write). Commit, THEN report the rung.
        session.commit()
        tracker.hit("Wikidata", len(out))

        # ---- Layer 2: offerings the profile agent already pulled from the company's own site ----
        site_profile = ctx.shared.get("site_profile") or {}
        site_url = ctx.shared.get("site_url")
        offerings = site_profile.get("offerings") or []
        if not offerings:
            tracker.skip("Company site", "no offerings extracted from the site")
        else:
            tracker.start("Company site", f"Adding {len(offerings)} offerings from the company site")
            before = len(out)
            for name in offerings:
                add(name, "site", site_url, provider="site", method="llm")
            session.commit()
            tracker.hit("Company site", len(out) - before)

        # ---- Layer 3: web search (only if we still have nothing) ----
        if out:
            tracker.skip("Web search", "already found products from higher-authority sources")
        elif not (ctx.llm and ctx.llm.available):
            tracker.skip("Web search", "needs an LLM provider")
        else:
            tracker.start("Web search", "Searching the web for products and services")
            results = await websearch.search(f"{ctx.root['name']} products services", limit=6)
            text = "\n".join(f"{r.title}. {r.description or ''}" for r in results)
            src_url = results[0].url if results else None
            src_id = results[0].source_id if results else "web"
            before = len(out)
            if text.strip():
                extracted = await ctx.llm.extract(
                    f"From these search-result snippets about '{ctx.root['name']}', list that "
                    "company's actual products or services — real named offerings. Ignore "
                    "competitors' products, generic categories, and unrelated names.",
                    text[:6000],
                    ProductList,
                )
                for name in (extracted.products if extracted else []):
                    add(name, "web", src_url, provider=src_id, method="llm")
            session.commit()
            tracker.hit("Web search", len(out) - before)

    if out:
        ctx.emit("graph_delta", agent=category, payload={})
    return {"products": out, "layers": tracker.summary()}
