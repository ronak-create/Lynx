"""Legitimacy / trust check — is this a real, established business or a thin front?

Runs in the investigation phase, so the discovery agents (profile deep-crawl, overview)
have already populated shared context and `root`. It fuses two kinds of evidence:

  * Infrastructure & substance (applies to ANY business, big or tiny): domain age, a valid
    TLS cert, DNS/MX, a website with real offerings/pricing, policy pages, contact details.
    These form the base trust score.
  * Third-party corroboration (bonus, never a penalty for small legit firms): a Wikidata
    record, a Wikipedia article, SEC registration. Their presence lifts the score and the
    verdict; their absence just means "independently unverified", not "illegitimate".

Everything is deterministic so it works with no LLM key; when a model is available it adds a
short human assessment and can surface extra flags from the crawled site text."""
import logging
import re
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from app.agents.base import AgentContext
from app.db.engine import get_session
from app.db.models import Entity
from app.graph.resolution import add_claim, make_provenance
from app.sources import domain as domain_src
from app.sources import firecrawl
from app.sources.http import fetcher

log = logging.getLogger(__name__)

category = "legitimacy"

# score bands → verdict
_BANDS = [
    (80, "Well-established", "Strong, corroborated footprint across infrastructure and third-party records."),
    (62, "Legitimate", "Consistent signals of a real, operating business."),
    (42, "Limited signals", "Some positive signals, but a thin or young footprint."),
    (0, "Caution", "Sparse or weak signals — verify independently before trusting."),
]


class LegitAssessment(BaseModel):
    assessment: str = Field(default="", description="2-3 sentence plain assessment of legitimacy")
    extra_flags: list[str] = Field(default_factory=list, description="specific risk/trust notes from the site text")


def _domain_for(ctx: AgentContext) -> str | None:
    """Best domain to check: URL input → crawled site → Wikidata website → None."""
    if ctx.root.get("domain"):
        return ctx.root["domain"]
    if ctx.shared.get("site_url"):
        return urlparse(ctx.shared["site_url"]).netloc
    for link in ctx.profile.get("links", []):
        if getattr(link, "label", None) == "website":
            return urlparse(link.url).netloc
    return None


def _band(score: float) -> tuple[str, str]:
    for threshold, verdict, blurb in _BANDS:
        if score >= threshold:
            return verdict, blurb
    return _BANDS[-1][1], _BANDS[-1][2]


def _age_score(years: float | None) -> float:
    if years is None:
        return 0.35  # unknown age is mildly negative, not damning (many registries hide dates)
    for cutoff, val in ((10, 1.0), (5, 0.85), (2, 0.65), (1, 0.45), (0.5, 0.25)):
        if years >= cutoff:
            return val
    return 0.0


def _scan_site(text: str) -> tuple[bool, bool]:
    """(has_policy_pages, has_contact) from crawled site markdown / homepage html."""
    low = text.lower()
    has_policy = bool(re.search(r"privacy policy|terms of (service|use)|\bgdpr\b|cookie policy", low))
    has_contact = bool(
        re.search(r"mailto:|tel:|contact us|\b\d{3}[.\-\s]\d{3}[.\-\s]\d{4}\b", low)
        or re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", low)
    )
    return has_policy, has_contact


async def run(ctx: AgentContext) -> dict:
    root = ctx.root
    domain = _domain_for(ctx)

    # --- gather site substance signals (reuse the deep crawl if profile already ran) ---
    site_text = ctx.shared.get("site_content") or ""
    if not site_text and domain:
        ctx.progress(category, "Checking the website")
        homepage = await fetcher.get_text("generic", f"https://{domain}", ttl=24 * 3600)
        site_text = homepage or ""
    has_policy, has_contact = _scan_site(site_text) if site_text else (False, False)

    site_profile = ctx.shared.get("site_profile") or {}
    substantive_site = bool(
        site_profile.get("offerings") or site_profile.get("pricing") or (len(site_text) > 1500)
    )

    # --- domain infrastructure probes ---
    intel: dict = {}
    if domain:
        ctx.progress(category, f"Probing {domain} (age, TLS, DNS)")
        intel = await domain_src.domain_intel(domain)
    tls = intel.get("tls", {})
    dns = intel.get("dns", {})

    # --- third-party corroboration (present = bonus, absent = not penalised) ---
    has_wikidata = bool(root.get("wikidata_id"))
    has_wikipedia = bool(root.get("url"))
    is_sec = bool(root.get("cik"))

    # --- weighted base score from infra + substance (each value in 0..1) ---
    signals = [
        ("Domain age", 0.26, _age_score(intel.get("age_years")),
         (f"{intel['age_years']}y (since {intel['registered']})" if intel.get("age_years") is not None
          else "registration date unavailable")),
        ("Secure connection (TLS)", 0.20,
         1.0 if tls.get("secure") else (0.15 if tls.get("reachable") else 0.0),
         (f"valid cert · {tls.get('issuer')}" if tls.get("secure")
          else "certificate invalid/expired" if tls.get("reachable") else "no HTTPS / unreachable")),
        ("DNS resolves", 0.08, 1.0 if dns.get("resolves") else 0.0,
         "resolves" if dns.get("resolves") else "does not resolve"),
        ("Business email (MX)", 0.10, 1.0 if dns.get("has_mx") else 0.0,
         "mail server configured" if dns.get("has_mx") else "no MX records"),
        ("Website substance", 0.18, 1.0 if substantive_site else (0.4 if site_text else 0.0),
         "real offerings/content" if substantive_site else "thin or no site content"),
        ("Policy pages", 0.10, 1.0 if has_policy else 0.0,
         "privacy/terms present" if has_policy else "none found"),
        ("Contact details", 0.08, 1.0 if has_contact else 0.0,
         "contact info present" if has_contact else "none found"),
    ]
    base = sum(weight * value for _, weight, value, _ in signals) * 100

    # corroboration lifts the score (cap the boost so infra still dominates)
    boost = (12 if has_wikidata else 0) + (10 if is_sec else 0) + (4 if has_wikipedia and not has_wikidata else 0)
    score = round(min(100.0, base + boost))
    verdict, blurb = _band(score)

    # --- risk flags: concrete, actionable negatives ---
    flags: list[str] = []
    if intel.get("age_years") is not None and intel["age_years"] < 0.5:
        flags.append("Domain registered less than 6 months ago")
    if domain and not tls.get("secure"):
        flags.append("No valid HTTPS certificate")
    if domain and not dns.get("has_mx"):
        flags.append("No business email (MX) configured")
    if site_text and not has_policy:
        flags.append("No privacy/terms pages found")
    if not (has_wikidata or has_wikipedia or is_sec):
        flags.append("No independent third-party record (Wikipedia/Wikidata/SEC)")
    if not domain:
        flags.append("Could not determine an official domain to verify")

    corroboration = [
        label for present, label in (
            (has_wikipedia, "Wikipedia"), (has_wikidata, "Wikidata"), (is_sec, "SEC-registered"),
        ) if present
    ]

    # --- optional LLM colour on top of the deterministic score ---
    assessment = blurb
    if ctx.llm and ctx.llm.available and site_text:
        ctx.progress(category, "Summarizing the trust assessment")
        signal_lines = "\n".join(f"- {name}: {detail}" for name, _, _, detail in signals)
        out = await ctx.llm.extract(
            f"You are assessing whether '{root['name']}' is a legitimate, operating business. "
            f"Computed trust score: {score}/100 ({verdict}). Signals:\n{signal_lines}\n"
            f"Third-party records: {', '.join(corroboration) or 'none'}.\n"
            "Give a brief, balanced assessment and any concrete extra flags supported by the site text.",
            site_text[:6000],
            LegitAssessment,
        )
        if out:
            if out.assessment:
                assessment = out.assessment
            for f in out.extra_flags:
                if f and f not in flags:
                    flags.append(f)

    # persist the verdict as a cited claim on the root entity
    try:
        with get_session() as session:
            entity = session.get(Entity, root["entity_id"])
            if entity:
                prov = make_provenance(session, "legitimacy", intel.get("domain") and f"https://{intel['domain']}")
                add_claim(session, entity, "legitimacy_score",
                          {"text": f"{score}/100 — {verdict}", "raw": score}, provenance=prov)
                session.commit()
    except Exception:
        log.exception("failed to persist legitimacy claim")

    return {
        "domain": domain,
        "score": score,
        "verdict": verdict,
        "assessment": assessment,
        "signals": [
            {"label": name, "value": round(value, 2), "detail": detail}
            for name, _, value, detail in signals
        ],
        "corroboration": corroboration,
        "flags": flags,
        "registered": intel.get("registered"),
        "age_years": intel.get("age_years"),
        "tls_issuer": tls.get("issuer"),
    }
