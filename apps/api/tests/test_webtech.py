from app.sources.webtech import _slug, fingerprint_tech


def test_fingerprint_detects_stack():
    html = """
    <html><head><script src="/_next/static/chunk.js"></script>
    <script src="https://www.googletagmanager.com/gtag/js"></script></head>
    <body data-reactroot></body></html>
    """
    names = {t["name"] for t in fingerprint_tech(html)}
    assert "Next.js" in names
    assert "React" in names
    assert "Google Analytics" in names


def test_fingerprint_wordpress_and_shopify():
    assert any(t["name"] == "WordPress" for t in fingerprint_tech('<link href="/wp-content/theme.css">'))
    assert any(t["name"] == "Shopify" for t in fingerprint_tech('<script src="https://cdn.shopify.com/x.js">'))


def test_fingerprint_empty_on_plain_html():
    assert fingerprint_tech("<html><body><h1>hello</h1></body></html>") == []


def test_fingerprint_dedupes():
    names = [t["name"] for t in fingerprint_tech("/_next/ /_next/ __NEXT_DATA__")]
    assert names.count("Next.js") == 1


def test_slug_strips_suffixes():
    assert _slug("Acme Inc") == "acme"
    assert _slug("Ramp Technologies") == "ramp"
    assert _slug("Figma") == "figma"
    # too-short-after-strip keeps the whole thing rather than emptying it
    assert _slug("Co") == "co"
