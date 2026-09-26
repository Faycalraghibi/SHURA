"""The System's server side: builds skill trees and quests, judges open answers, gives hints.

The AI proposes; this module validates. Scores are computed here from the rubric verdicts, never
taken from the model, and ranks are not computed here at all (the app derives them from evidence).
"""

from __future__ import annotations

import threading
import uuid
from pathlib import Path
from urllib.parse import quote_plus

from ..format.models import SkillPack
from ..forge.pipeline import forge_skeleton, slugify
from ..gateway import Gateway, GatewayError, data_block
from ..registry import PackRegistry
from ..validate import errors
from . import prompts
from .schemas import (
    ChoiceItem,
    DiagnosticDraft,
    Evaluation,
    EvaluationDraft,
    HintDraft,
    Quest,
    QuestDraft,
    QuestIn,
    Resource,
)

PASS_SCORE = 0.7
MAX_QUEST_ATTEMPTS = 2


class SystemRefusal(Exception):
    """A request the System cannot fulfil (bad input or unusable model output)."""


class PackStore:
    """Hand-written packs plus packs the Forge built, cached on disk so each skill is built once."""

    def __init__(self, base: PackRegistry, forged_dir: Path):
        self.base = base
        self.forged_dir = forged_dir
        self.forged_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._forged: dict[str, SkillPack] = {}
        for path in sorted(forged_dir.glob("*.json")):
            pack = SkillPack.model_validate_json(path.read_text(encoding="utf-8"))
            self._forged[pack.pack] = pack
        self._rebuild()

    def _rebuild(self) -> None:
        packs = {p.pack: p for p in self.base.all()}
        packs.update({k: v for k, v in self._forged.items() if k not in packs})
        self.registry = PackRegistry(packs, self.base.ranks)

    def get(self, pack_id: str) -> SkillPack | None:
        return self.registry.get(pack_id)

    def add(self, pack: SkillPack) -> SkillPack:
        with self._lock:
            if self.registry.get(pack.pack) is not None:
                return self.registry.get(pack.pack)  # type: ignore[return-value]
            (self.forged_dir / f"{pack.pack}.json").write_text(
                pack.model_dump_json(indent=2, exclude_none=True), encoding="utf-8"
            )
            self._forged[pack.pack] = pack
            self._rebuild()
            return pack


def awaken(store: PackStore, gateway: Gateway, skill: str, work_dir: Path) -> tuple[SkillPack, bool]:
    """Return (pack, newly_built). Reuses an existing pack whenever the request matches one."""
    match = store.registry.match(skill)
    if match:
        return match.pack, False
    pack_id = slugify(skill)
    existing = store.get(pack_id)
    if existing:
        return existing, False
    result = forge_skeleton(skill.strip(), gateway, work_dir / pack_id)
    blocking = errors(result.issues)
    if blocking:
        raise SystemRefusal(
            "The System could not build a sound skill tree for this request: "
            + "; ".join(str(i) for i in blocking[:3])
        )
    return store.add(result.pack), True


def _valid_choice(item: ChoiceItem) -> bool:
    opts = [o.strip() for o in item.options]
    return (
        len(opts) == 4
        and all(opts)
        and len({o.lower() for o in opts}) == 4
        and 0 <= item.answer_index < 4
        and bool(item.question.strip())
    )


def diagnostic(pack: SkillPack, gateway: Gateway, count: int) -> list[ChoiceItem]:
    ids = {c.id for c in pack.competencies}
    comps = "\n".join(
        f"{c.id} | {c.tier.value} | {c.name} | {c.mastery_criteria}"
        for c in sorted(pack.competencies, key=lambda c: c.tier.order)
        if c.tier.order <= 3  # F to C: the placement sweep never probes advanced tiers
    )
    draft = gateway.run(
        prompts.DIAGNOSTIC, DiagnosticDraft, tags={"pack": pack.pack},
        skill=pack.name, competencies=comps, count=str(count),
    )
    seen: set[str] = set()
    items = []
    for item in draft.items:
        key = item.question.strip().lower()
        if item.competency_id in ids and _valid_choice(item) and key not in seen:
            seen.add(key)
            items.append(item)
    if len(items) < min(4, count):
        raise SystemRefusal("The System produced too few valid diagnostic questions. Try again.")
    return items[:count]


def allowed_formats(pack: SkillPack, evidence_type: str) -> list[str]:
    if evidence_type == "recognition":
        return ["choice"]
    programming = any("code" in c.adapters for c in pack.competencies)
    return ["code", "written"] if programming else ["written"]


def resources_for(queries: list[str], skill: str) -> list[Resource]:
    """Links to searches, never to model-invented URLs, so they cannot be hallucinated."""
    out: list[Resource] = []
    for q in queries[:3]:
        q = q.strip()
        if not q:
            continue
        out.append(Resource(title=f"Videos: {q}", url=f"https://www.youtube.com/results?search_query={quote_plus(q)}", kind="video_search"))
    if queries:
        q = f"{skill} {queries[0]} documentation"
        out.append(Resource(title=f"Docs: {queries[0]}", url=f"https://duckduckgo.com/?q={quote_plus(q)}", kind="docs_search"))
    return out


def _validate_quest(draft: QuestDraft, formats: list[str], competency_id: str) -> QuestDraft:
    if draft.format not in formats:
        raise SystemRefusal(f"quest format {draft.format!r} not allowed (allowed: {formats})")
    if draft.format == "choice":
        items = [i.model_copy(update={"competency_id": competency_id}) for i in draft.items if _valid_choice(i)]
        if len(items) < 3:
            raise SystemRefusal("choice quest needs at least 3 valid questions")
        return draft.model_copy(update={"items": items[:5], "rubric": []})
    rubric = [r.strip() for r in draft.rubric if r.strip()]
    if not 2 <= len(rubric) <= 8:
        raise SystemRefusal("written/code quest needs 2 to 8 rubric criteria")
    if not draft.instructions.strip():
        raise SystemRefusal("quest has no instructions")
    return draft.model_copy(update={"items": [], "rubric": rubric})


def make_quest(pack: SkillPack, gateway: Gateway, req: QuestIn) -> Quest:
    comp = pack.competency(req.competency_id)
    if comp is None:
        raise SystemRefusal(f"unknown competency {req.competency_id!r}")
    formats = allowed_formats(pack, req.evidence_type)
    last_error: Exception | None = None
    for _ in range(MAX_QUEST_ATTEMPTS):
        draft = gateway.run(
            prompts.QUEST, QuestDraft, tags={"pack": pack.pack, "competency": comp.id},
            skill=pack.name, competency=comp.name, tier=comp.tier.value,
            criteria=comp.mastery_criteria, mistakes="; ".join(comp.common_mistakes) or "none listed",
            evidence=req.evidence_type, formats=", ".join(formats),
            known=", ".join(req.known[:30]) or "nothing yet", weakness=req.weakness or "none identified",
            retest=(
                "This is a RETEST: use a different problem than a typical first exercise." if req.retest else ""
            ),
        )
        try:
            draft = _validate_quest(draft, formats, comp.id)
            break
        except SystemRefusal as e:
            last_error = e
    else:
        raise SystemRefusal(f"The System could not produce a valid quest: {last_error}")
    return Quest(
        id=uuid.uuid4().hex,
        pack_id=pack.pack,
        competency_id=comp.id,
        competency_name=comp.name,
        tier=comp.tier.value,
        evidence_type=req.evidence_type,
        retest=req.retest,
        title=draft.title.strip(),
        flavor=draft.flavor.strip(),
        objective=draft.objective.strip(),
        format=draft.format,
        instructions=draft.instructions.strip(),
        requirements=[r for r in draft.requirements if r.strip()],
        items=draft.items,
        rubric=draft.rubric,
        starter=draft.starter,
        resources=resources_for(draft.resource_queries, pack.name),
    )


def evaluate(pack: SkillPack, gateway: Gateway, quest: Quest, submission: str) -> Evaluation:
    if quest.format == "choice":
        raise SystemRefusal("choice quests are graded on the device")
    comp = pack.competency(quest.competency_id)
    if comp is None:
        raise SystemRefusal(f"unknown competency {quest.competency_id!r}")
    prereqs = {p: (pack.competency(p).name if pack.competency(p) else p) for p in comp.prerequisites}
    draft = gateway.run(
        prompts.EVALUATE, EvaluationDraft, tags={"pack": pack.pack, "competency": comp.id},
        skill=pack.name, competency=comp.name, tier=comp.tier.value,
        prerequisites=", ".join(f"{k}: {v}" for k, v in prereqs.items()) or "none",
        instructions=quest.instructions, requirements="\n".join(f"- {r}" for r in quest.requirements),
        rubric="\n".join(f"{i + 1}. {r}" for i, r in enumerate(quest.rubric)),
        submission=data_block("submission", submission),
    )
    # Align verdicts to the quest's own rubric; anything the model skipped counts as not met.
    verdicts = []
    for i, criterion in enumerate(quest.rubric):
        v = draft.criteria[i] if i < len(draft.criteria) else None
        verdicts.append(
            {"criterion": criterion, "met": bool(v and v.met), "comment": v.comment if v else "Not assessed."}
        )
    score = round(sum(v["met"] for v in verdicts) / len(verdicts), 3) if verdicts else 0.0
    passed = score >= PASS_SCORE
    missing = draft.missing_prerequisite if draft.missing_prerequisite in prereqs else None
    cause = "none" if passed else draft.failure_cause
    if not passed and cause == "none":
        cause = "execution_error"
    return Evaluation(
        score=score,
        passed=passed,
        criteria=verdicts,
        feedback=draft.feedback,
        strengths=draft.strengths,
        weaknesses=draft.weaknesses,
        failure_cause=cause,
        missing_prerequisite=missing,
    )


def hint(pack: SkillPack, gateway: Gateway, quest: Quest, attempt: str, level: int) -> str:
    return gateway.run(
        prompts.HINT, HintDraft, tags={"pack": pack.pack, "competency": quest.competency_id},
        skill=pack.name, competency=quest.competency_name, instructions=quest.instructions,
        attempt=data_block("attempt", attempt or "(nothing yet)"), level=str(level),
    ).hint

