"""Entity dedup/resolution against an isolated in-memory SQLite — no dependency on the app's
real database. Verifies the three-tier merge: canonical_key → exact name → normalized name."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.graph.resolution import _norm, add_edge, get_or_create_entity


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine, expire_on_commit=False)()
    yield s
    s.close()


def test_canonical_key_dedupes(session):
    a = get_or_create_entity(session, "company", "Microsoft", canonical_key="wikidata:Q2283")
    b = get_or_create_entity(session, "company", "Microsoft Corporation", canonical_key="wikidata:Q2283")
    assert a.id == b.id


def test_normalized_name_dedupes(session):
    a = get_or_create_entity(session, "company", "Acme Inc")
    b = get_or_create_entity(session, "company", "Acme")  # suffix stripped by _norm → same
    assert a.id == b.id


def test_distinct_entities_stay_separate(session):
    a = get_or_create_entity(session, "company", "Apple")
    b = get_or_create_entity(session, "company", "Google")
    assert a.id != b.id


def test_enrich_without_clobber(session):
    a = get_or_create_entity(session, "company", "Stripe", attrs={"ticker": None, "domain": "stripe.com"})
    get_or_create_entity(session, "company", "Stripe", canonical_key="wikidata:Q20038035", attrs={"cik": "123"})
    session.refresh(a)
    assert a.canonical_key == "wikidata:Q20038035"
    assert a.attrs["domain"] == "stripe.com"  # original kept
    assert a.attrs["cik"] == "123"  # new merged in


def test_add_edge_no_self_loops(session):
    a = get_or_create_entity(session, "company", "SoloCo")
    assert add_edge(session, a, a, "RELATED") is None


def test_norm_strips_legal_suffixes():
    assert _norm("Acme Inc.") == "acme"
    assert _norm("Foo Holdings LLC") == "foo"
