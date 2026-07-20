from app.agents.resolve import _clean_company, _entity_kind_score, _norm_title


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
