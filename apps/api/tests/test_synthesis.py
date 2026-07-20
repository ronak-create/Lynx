from app.agents.synthesis import _scorecard, _template_swot, _timeline


def _results():
    return {
        "overview": {"facts": [{"predicate": "founded", "text": "1975-04-04"},
                               {"predicate": "employees", "text": "221,000"}]},
        "legitimacy": {"score": 100, "verdict": "Well-established",
                       "corroboration": ["Wikipedia"], "flags": []},
        "financials": {"revenue_series": [[2023, 100.0], [2024, 150.0]],
                       "filings": [{"form": "10-K", "filed_at": "2024-07-30"}]},
        "news": {"tone_summary": {"positive": 3, "negative": 1},
                 "articles": [{"title": "Big news", "published_at": "2026-06-01"}]},
        "competitors": {"competitors": [{"name": "Rival A"}, {"name": "Rival B"}]},
        "profile": {"offerings": ["A", "B", "C"]},
    }


def test_scorecard_computes_yoy_growth():
    cards = {c["label"]: c for c in _scorecard({"name": "X"}, _results())}
    assert cards["Revenue"]["value"] == "$150"
    assert cards["Revenue"]["sub"] == "+50% YoY"
    assert cards["Legitimacy"]["value"] == "100/100"


def test_timeline_sorted_desc_and_dated_only():
    tl = _timeline(_results())
    dates = [e["date"] for e in tl]
    assert dates == sorted(dates, reverse=True)
    assert dates[0] == "2026-06-01"  # newest first
    assert all(e["date"] for e in tl)  # undated events dropped


def test_timeline_caps_at_20():
    # funding rounds have no per-source cap, so 25 dated rounds exercise the global 20-cap
    results = {"funding": {"rounds": [{"stage": f"R{i}", "date": f"20{i:02d}-01-01"} for i in range(1, 26)]}}
    assert len(_timeline(results)) == 20


def test_timeline_news_capped_upstream():
    results = {"news": {"articles": [{"title": f"n{i}", "published_at": f"2020-01-{i:02d}"} for i in range(1, 26)]}}
    # news contributes at most 8 events to the timeline
    assert len(_timeline(results)) == 8


def test_template_swot_derives_from_signals():
    swot = _template_swot({"name": "X"}, _results())
    joined = " ".join(swot.strengths).lower()
    assert "legitimacy" in joined or "corroborated" in joined
    assert any("growing" in s.lower() for s in swot.strengths)
    # two competitors → a threat is surfaced
    assert any("competitive" in t.lower() for t in swot.threats)
