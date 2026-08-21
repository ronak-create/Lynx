from app.agents.resolve import _clean_company, _detect_url, _entity_kind_score, _norm_title


def test_norm_title():
    assert _norm_title("ELI LILLY & Co.") == "eli lilly co"
    assert _norm_title("Apple Inc.") == "apple inc"


def test_clean_company_strips_corp_words():
    assert _clean_company("ELI LILLY & Co") == "eli lilly"
    assert _clean_company("APPLE INC") == "apple"
    assert _clean_company("DELTA AIR LINES INC") == "delta air lines"


def test_entity_kind_prefers_company_over_person():
    company = {"description": "American pharmaceutical company"}
    person = {"description": "American pharmacist and businessman"}
    case = {"description": "1990 United States Supreme Court case"}
    assert _entity_kind_score(company) > _entity_kind_score(person)
    assert _entity_kind_score(company) > _entity_kind_score(case)
    assert _entity_kind_score(person) < 0


def test_detect_url():
    # Full URLs
    assert _detect_url("https://figma.com") == "https://figma.com"
    assert _detect_url("http://stripe.com/about") == "http://stripe.com/about"

    # Bare domains with and without www
    assert _detect_url("figma.com") == "https://figma.com"
    assert _detect_url("www.stripe.com") == "https://www.stripe.com"
    assert _detect_url("linear.app/features") == "https://linear.app/features"
    assert _detect_url("sub.domain.co.uk") == "https://sub.domain.co.uk"

    # Plain company names should not be detected as URLs
    assert _detect_url("Microsoft") is None
    assert _detect_url("Apple Inc.") is None
    assert _detect_url("Eli Lilly & Co") is None
