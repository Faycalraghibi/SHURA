import pytest
from pydantic import ValidationError

from shura.format import SkillPack, Tier, verified_ceiling
from shura.format.ceiling import ceiling_message
from shura.validate import Severity, errors, validate_pack


def make_pack(competencies, **kw):
    base = dict(
        pack="demo",
        name="Demo",
        scope="A demo skill used in tests",
        version="0.1.0",
        sources=[
            {"id": "s1", "kind": "syllabus", "title": "Syllabus one"},
            {"id": "s2", "kind": "book", "title": "Book two"},
            {"id": "s3", "kind": "framework", "title": "Framework three"},
        ],
        competencies=competencies,
    )
    base.update(kw)
    return SkillPack.model_validate(base)


def comp(cid, tier, prereqs=(), adapters=("choice",), **kw):
    return dict(
        id=cid,
        name=f"Skill {cid}",
        tier=tier,
        prerequisites=list(prereqs),
        mastery_criteria=f"Does {cid} without help.",
        adapters=list(adapters),
        grounded_in=["s1"],
        **kw,
    )


def codes(issues):
    return {i.code for i in issues}


def test_tier_ordering():
    assert Tier.F < Tier.E < Tier.S
    assert Tier.C <= Tier.C
    assert not Tier.A < Tier.B


def test_valid_pack_has_no_errors():
    pack = make_pack([comp("a", "F"), comp("b", "E", ["a"]), comp("c", "D", ["b"])])
    assert errors(validate_pack(pack)) == []


def test_rejects_bad_ids_and_version():
    with pytest.raises(ValidationError):
        make_pack([comp("Bad Id", "F")])
    with pytest.raises(ValidationError):
        make_pack([comp("a", "F")], version="1.0")


def test_unknown_prerequisite_and_tier_order():
    pack = make_pack([comp("a", "E"), comp("b", "F", ["a"]), comp("c", "E", ["missing"])])
    got = codes(validate_pack(pack))
    assert {"tier_order", "unknown_prerequisite", "orphan"} <= got


def test_cycle_detected():
    pack = make_pack([comp("root", "F"), comp("a", "E", ["b", "root"]), comp("b", "E", ["a"])])
    assert "cycle" in codes(errors(validate_pack(pack)))


def test_grounding_and_adapter_checks():
    bad = comp("a", "F", adapters=("telepathy",))
    bad["grounded_in"] = ["s9"]
    pack = make_pack([bad, {**comp("b", "E", ["a"]), "grounded_in": []}])
    got = codes(errors(validate_pack(pack)))
    assert {"unknown_adapter", "unknown_source", "ungrounded"} <= got


def test_low_grounding_is_a_warning():
    pack = make_pack([comp("a", "F")], sources=[{"id": "s1", "kind": "book", "title": "Only book"}])
    issues = validate_pack(pack)
    assert any(i.code == "low_grounding" and i.severity is Severity.warning for i in issues)


def test_ceiling_stops_at_self_reported_tier():
    # Swimming-like skill: technique beyond E can only be self-reported.
    pack = make_pack(
        [
            comp("water.float", "F", adapters=("choice", "self_report")),
            comp("stroke.names", "E", ["water.float"], adapters=("choice",)),
            comp("stroke.freestyle", "D", ["stroke.names"], adapters=("self_report",)),
            comp("stroke.butterfly", "C", ["stroke.freestyle"], adapters=("self_report",)),
        ]
    )
    assert verified_ceiling(pack) is Tier.E
    assert "up to Rank E" in ceiling_message(pack, Tier.E)


def test_ceiling_ignores_unshipped_adapters_and_non_core():
    pack = make_pack(
        [
            comp("a", "F"),
            comp("b", "E", ["a"], adapters=("audio_analysis",), core=False),
            comp("c", "E", ["a"]),
            comp("d", "D", ["c"], adapters=("audio_analysis",)),
        ]
    )
    assert verified_ceiling(pack) is Tier.E
    assert verified_ceiling(pack, available={"choice", "audio_analysis"}) is Tier.D


def test_ceiling_stops_at_tier_gap_and_none_when_f_unverifiable():
    gap = make_pack([comp("a", "F"), comp("b", "D", ["a"])])
    assert verified_ceiling(gap) is Tier.F
    assert "tier_gap" in codes(validate_pack(gap))
    unverifiable = make_pack([comp("a", "F", adapters=("self_report",))])
    assert verified_ceiling(unverifiable) is None


def test_s_follows_verified_a_without_s_competencies():
    tiers = ["F", "E", "D", "C", "B", "A"]
    comps = [comp(f"t{i}", t, [f"t{i - 1}"] if i else []) for i, t in enumerate(tiers)]
    assert verified_ceiling(make_pack(comps)) is Tier.S


def test_declared_ceiling_and_verifiability_must_match():
    pack = make_pack(
        [comp("a", "F", verifiability="rubric"), comp("b", "E", ["a"])],
        verified_ceiling="A",
    )
    got = codes(errors(validate_pack(pack)))
    assert {"verifiability_mismatch", "ceiling_mismatch"} <= got


def test_goal_emphasis_must_match_competencies():
    pack = make_pack(
        [comp("kana.read", "F")],
        goal_templates=[{"name": "travel", "target_rank": "D", "emphasis": ["kana", "speaking"]}],
    )
    issues = validate_pack(pack)
    assert "unknown_emphasis" in codes(errors(issues))
    assert "goal_above_ceiling" in codes(issues)


def test_cross_pack_prerequisites():
    pack = make_pack([comp("a", "F"), comp("ml.basics", "E", ["a", "python:functions.define"])])
    lookup = {("python", "functions.define"): Tier.E}.get
    assert errors(validate_pack(pack, lambda p, c: lookup((p, c)))) == []
    assert "unknown_prerequisite" in codes(validate_pack(pack, lambda p, c: None))
    assert "unchecked_external" in codes(validate_pack(pack))
