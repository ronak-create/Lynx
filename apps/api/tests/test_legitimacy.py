from app.agents.legitimacy import _age_score, _band, _scan_site


def test_age_score_bands():
    assert _age_score(12) == 1.0
    assert _age_score(6) == 0.85
    assert _age_score(3) == 0.65
    assert _age_score(1.5) == 0.45
    assert _age_score(0.7) == 0.25
    assert _age_score(0.2) == 0.0
    # unknown age is mildly negative, not zero
    assert _age_score(None) == 0.35


def test_band_verdicts():
    assert _band(95)[0] == "Well-established"
    assert _band(70)[0] == "Legitimate"
    assert _band(50)[0] == "Limited signals"
    assert _band(10)[0] == "Caution"


def test_scan_site_detects_policy_and_contact():
    text = "Read our Privacy Policy. Contact us at hello@acme.com or call 555.123.4567."
    has_policy, has_contact = _scan_site(text)
    assert has_policy is True
    assert has_contact is True


def test_scan_site_empty_signals():
    has_policy, has_contact = _scan_site("Welcome to our landing page. Buy now.")
    assert has_policy is False
    assert has_contact is False
