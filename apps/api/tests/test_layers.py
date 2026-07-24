from app.sources.layers import Deduper, LayerTracker, freshest


class FakeCtx:
    """Captures emitted events so we can assert the source ladder is reported."""

    def __init__(self):
        self.events: list[tuple[str, str, dict]] = []
        self.progress_calls: list[str] = []

    def emit(self, type_, agent=None, payload=None):
        self.events.append((type_, agent, payload or {}))

    def progress(self, agent, message, **_):
        self.progress_calls.append(message)


def test_deduper_first_layer_wins():
    dedup = Deduper()
    layer1 = dedup.add([{"n": "Ada"}, {"n": "Bob"}], key=lambda x: x["n"].lower())
    # a later, lower-authority layer re-mentions Ada plus a genuinely new name
    layer2 = dedup.add([{"n": "ada"}, {"n": "Cy"}], key=lambda x: x["n"].lower())
    assert [x["n"] for x in layer1] == ["Ada", "Bob"]
    assert [x["n"] for x in layer2] == ["Cy"]  # duplicate Ada dropped, Cy kept


def test_deduper_ignores_null_keys():
    dedup = Deduper()
    assert dedup.add([{"n": None}, {"n": "x"}], key=lambda x: x["n"]) == [{"n": "x"}]


def test_freshest_keeps_newest_per_key():
    items = [
        {"k": "rev", "t": "2022", "v": 1},
        {"k": "rev", "t": "2024", "v": 2},
        {"k": "hc", "t": None, "v": 3},
    ]
    out = {x["k"]: x["v"] for x in freshest(items, key=lambda x: x["k"], when=lambda x: x["t"])}
    assert out == {"rev": 2, "hc": 3}


def test_tracker_emits_ladder_snapshots():
    ctx = FakeCtx()
    t = LayerTracker(ctx, "people", [("Wikidata", "wikidata"), ("Web search", "web")])
    t.start("Wikidata")
    t.hit("Wikidata", 3)
    t.skip("Web search", "already found")

    layer_events = [p["layers"] for (ty, ag, p) in ctx.events if ty == "agent_layers"]
    assert all(ag == "people" for (ty, ag, _) in ctx.events if ty == "agent_layers")
    # every emit carries the WHOLE ladder so the client can just replace its copy
    final = layer_events[-1]
    assert [l["name"] for l in final] == ["Wikidata", "Web search"]
    wikidata = next(l for l in final if l["name"] == "Wikidata")
    web = next(l for l in final if l["name"] == "Web search")
    assert wikidata["status"] == "hit" and wikidata["count"] == 3
    assert web["status"] == "skipped" and web["detail"] == "already found"


def test_tracker_hit_with_zero_count_is_empty():
    ctx = FakeCtx()
    t = LayerTracker(ctx, "products", [("Wikidata", "wikidata")])
    t.hit("Wikidata", 0)
    final = [p["layers"] for (ty, _, p) in ctx.events if ty == "agent_layers"][-1]
    assert final[0]["status"] == "empty"
