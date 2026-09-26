import pytest
from fastapi.testclient import TestClient

from shura.api.app import app
from shura.format import Tier
from shura.registry import PackRegistry


@pytest.fixture(scope="module")
def registry():
    return PackRegistry.from_dir()


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_hand_written_packs_load_and_have_expected_ceilings(registry):
    assert {p.pack for p in registry.all()} >= {"sql", "python", "japanese"}
    assert registry.ceiling("japanese") is Tier.B  # A and S need audio analysis
    assert registry.ceiling("sql") is Tier.B
    assert registry.ranks is not None and [r.rank for r in registry.ranks.ranks][0] is Tier.F


@pytest.mark.parametrize(
    "text,pack,goal",
    [
        ("Python", "python", None),
        ("python programming", "python", None),
        ("Python for data analysis", "python", "data_analysis"),
        ("I want to learn SQL", "sql", None),
        ("PostgreSQL", "sql", None),
        ("nihongo", "japanese", None),
        ("Japanese for travel", "japanese", "travel"),
    ],
)
def test_matching(registry, text, pack, goal):
    m = registry.match(text)
    assert m is not None and m.pack.pack == pack
    assert m.goal_template == goal


@pytest.mark.parametrize("text", ["Rust", "swimming", "photography", "", "   "])
def test_no_false_matches(registry, text):
    assert registry.match(text) is None


def test_api_lists_and_gets_packs(client):
    packs = client.get("/packs").json()
    by_id = {p["pack"]: p for p in packs}
    assert by_id["japanese"]["verified_ceiling"] == "B"
    assert "up to Rank B" in by_id["japanese"]["ceiling_message"]

    pack = client.get("/packs/sql").json()
    assert pack["competency_count"] == len(pack["competencies"])
    first = next(c for c in pack["competencies"] if c["id"] == "select.basic")
    assert first["verifiability"] == "objective"
    assert client.get("/packs/nope").status_code == 404


def test_api_ranks(client):
    ranks = client.get("/ranks").json()["ranks"]
    assert [r["rank"] for r in ranks] == ["F", "E", "D", "C", "B", "A", "S"]


def test_api_skill_requests(client):
    r = client.post("/skill-requests", json={"text": "learn sql"}).json()
    assert r["status"] == "matched" and r["pack"] == "sql"
    r = client.post("/skill-requests", json={"text": "Rust"}).json()
    assert r["status"] == "queued" and r["pack"] is None
    assert client.post("/skill-requests", json={"text": ""}).status_code == 422
