import pytest

from app.sources import wikipedia
from app.sources.http import fetcher


@pytest.mark.asyncio
async def test_summary_url_encoding(monkeypatch):
    requested_urls = []

    async def fake_get_json(source_id: str, url: str, **kwargs):
        requested_urls.append(url)
        return {
            "title": "OS/2",
            "extract": "OS/2 is a series of computer operating systems.",
            "description": "Operating system by IBM and Microsoft",
            "wikibase_item": "Q214227",
            "thumbnail": {"source": "https://upload.wikimedia.org/os2.png"},
            "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/OS/2"}},
            "type": "standard",
        }

    monkeypatch.setattr(fetcher, "get_json", fake_get_json)

    res = await wikipedia.summary("OS/2")
    assert res is not None
    assert res["title"] == "OS/2"
    assert res["wikidata_id"] == "Q214227"
    assert res["disambiguation"] is False
    assert res["thumbnail_url"] == "https://upload.wikimedia.org/os2.png"
    assert res["url"] == "https://en.wikipedia.org/wiki/OS/2"
    # Verify the slash was percent-encoded in the REST path rather than splitting the URL path
    assert requested_urls[-1] == "https://en.wikipedia.org/api/rest_v1/page/summary/OS%2F2"


@pytest.mark.asyncio
async def test_summary_encodes_spaces_and_special_chars(monkeypatch):
    requested_urls = []

    async def fake_get_json(source_id: str, url: str, **kwargs):
        requested_urls.append(url)
        return {"title": "AT&T", "type": "standard"}

    monkeypatch.setattr(fetcher, "get_json", fake_get_json)

    await wikipedia.summary("AT&T")
    assert requested_urls[-1] == "https://en.wikipedia.org/api/rest_v1/page/summary/AT%26T"

    await wikipedia.summary("AC/DC")
    assert requested_urls[-1] == "https://en.wikipedia.org/api/rest_v1/page/summary/AC%2FDC"

    await wikipedia.summary("Apple Inc.")
    assert requested_urls[-1] == "https://en.wikipedia.org/api/rest_v1/page/summary/Apple_Inc."


@pytest.mark.asyncio
async def test_summary_handles_not_found(monkeypatch):
    async def fake_get_json(source_id: str, url: str, **kwargs):
        return {"type": "https://mediawiki.org/wiki/HyperSwitch/errors/not_found"}

    monkeypatch.setattr(fetcher, "get_json", fake_get_json)

    res = await wikipedia.summary("NonExistentPage1234567")
    assert res is None


@pytest.mark.asyncio
async def test_summary_handles_disambiguation(monkeypatch):
    async def fake_get_json(source_id: str, url: str, **kwargs):
        return {
            "title": "Lilly",
            "extract": "Lilly may refer to...",
            "type": "disambiguation",
        }

    monkeypatch.setattr(fetcher, "get_json", fake_get_json)

    res = await wikipedia.summary("Lilly")
    assert res is not None
    assert res["disambiguation"] is True
