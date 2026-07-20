from app.api.compare import _extract, _fmt_money, _num


def test_num_parses_variants():
    assert _num(1234) == 1234.0
    assert _num("1,234") == 1234.0
    assert _num("$3.2B") == 3.2e9
    assert _num("2.5T") == 2.5e12
    assert _num("55") == 55.0
    assert _num(None) is None
    assert _num("n/a") is None


def test_fmt_money_scales():
    assert _fmt_money(3.2e12) == "$3.20T"
    assert _fmt_money(2.5e9) == "$2.50B"
    assert _fmt_money(1_500_000) == "$1.5M"
    assert _fmt_money("nope") is None


def test_extract_pulls_headline_metrics():
    cats = {
        "legitimacy": {"score": 88, "verdict": "Well-established", "age_years": 12.0},
        "overview": {"facts": [{"predicate": "employees", "text": "221,000"}]},
        "stock": {"available": True, "price": 300, "currency": "USD", "market_cap": 2.5e12},
        "patents": {"count": 42},
    }
    out = _extract(cats)
    assert out["legitimacy"]["sort"] == 88.0
    assert out["market_cap"]["text"] == "$2.50T"
    assert out["employees"]["sort"] == 221000.0
    assert out["patents"]["text"] == "42"


def test_extract_missing_data_is_dash():
    out = _extract({})
    assert out["founded"]["text"] == "—"
    assert out["employees"]["sort"] is None
