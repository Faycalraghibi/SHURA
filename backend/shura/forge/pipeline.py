"""Skill Forge prototype: stages 2 to 4 plus the critic, as resumable steps.

Each step's output is stored as JSON in the run directory. Re-running a build with the same run
directory skips finished steps, so an interrupted build resumes where it stopped. P1 moves the
step store to Postgres and runs steps on a job queue.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from ..format.ceiling import verified_ceiling
from ..format.models import Competency, GoalTemplate, Maturity, SkillPack, Source, Tier
from ..gateway import Gateway, data_block
from ..validate import Issue, errors, validate_pack
from . import prompts
from .schemas import CritiqueOutput, DecompositionOutput, GroundingOutput, RankMapOutput

T = TypeVar("T", bound=BaseModel)

FORGE_VERSION = "0.1.0"
MAX_REVISIONS = 1


class StepStore:
    def __init__(self, directory: Path):
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)

    def run(self, name: str, schema: type[T], fn: Callable[[], T]) -> T:
        path = self.dir / f"{name}.json"
        if path.exists():
            return schema.model_validate_json(path.read_text(encoding="utf-8"))
        out = fn()
        path.write_text(out.model_dump_json(indent=2), encoding="utf-8")
        return out


@dataclass
class ForgeResult:
    pack: SkillPack
    issues: list[Issue]
    critique: CritiqueOutput
    ceiling: Tier | None
    cost_usd: float
    revisions: int
    step_costs: dict[str, float] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not errors(self.issues) and self.critique.verdict == "accept"


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return s[:40] or "skill"


def forge_skeleton(
    skill: str,
    gateway: Gateway,
    run_dir: Path,
    reference_outline: str = "",
) -> ForgeResult:
    store = StepStore(run_dir)
    tags = {"skill": skill}

    grounding = store.run(
        "2_grounding",
        GroundingOutput,
        lambda: gateway.run(
            prompts.GROUNDING, GroundingOutput, tags=tags, skill=skill,
            reference=data_block("reference_outline", reference_outline or "(none)"),
        ),
    )
    sources = [
        Source(id=f"s{i + 1}", kind=s.kind, title=s.title, url=s.url) for i, s in enumerate(grounding.sources)
    ]
    sources_text = "\n".join(
        f"{src.id}: [{g.kind}] {g.title} :: topics: {'; '.join(g.topics)}" for src, g in zip(sources, grounding.sources)
    )

    feedback = ""
    revisions = 0
    while True:
        suffix = f"_r{revisions}" if revisions else ""
        decomposition = store.run(
            f"3_decompose{suffix}",
            DecompositionOutput,
            lambda: gateway.run(
                prompts.DECOMPOSE, DecompositionOutput, tags=tags, skill=skill, scope=grounding.scope,
                sources=data_block("sources", sources_text), feedback=feedback or "(none)",
            ),
        )
        comp_text = "\n".join(
            f"{c.id}: {c.name} (requires: {', '.join(c.prerequisites) or 'nothing'})"
            for c in decomposition.competencies
        )
        rank_map = store.run(
            f"4_rank_map{suffix}",
            RankMapOutput,
            lambda: gateway.run(prompts.RANK_MAP, RankMapOutput, tags=tags, skill=skill, competencies=comp_text),
        )
        pack = assemble(skill, grounding, sources, decomposition, rank_map)
        issues = validate_pack(pack)
        critique = store.run(
            f"8_critic{suffix}",
            CritiqueOutput,
            lambda: gateway.run(prompts.CRITIC, CritiqueOutput, tags=tags, pack=data_block("pack", pack_to_text(pack))),
        )
        blocking = errors(issues)
        if (not blocking and critique.verdict == "accept") or revisions >= MAX_REVISIONS:
            break
        revisions += 1
        feedback = "\n".join(
            [f"validator: {i}" for i in blocking]
            + [f"critic ({c.severity}): {c.competency_id or 'pack'}: {c.message}" for c in critique.issues]
            + [f"coverage gap: {g}" for g in critique.coverage_gaps]
        )

    result = ForgeResult(
        pack=pack,
        issues=issues,
        critique=critique,
        ceiling=verified_ceiling(pack),
        cost_usd=gateway.spent_usd,
        revisions=revisions,
    )
    for r in gateway.records:
        result.step_costs[r.prompt] = round(result.step_costs.get(r.prompt, 0) + r.cost_usd, 6)
    (run_dir / "pack.json").write_text(pack.model_dump_json(indent=2, exclude_none=True), encoding="utf-8")
    return result


def assemble(
    skill: str,
    grounding: GroundingOutput,
    sources: list[Source],
    decomposition: DecompositionOutput,
    rank_map: RankMapOutput,
) -> SkillPack:
    """Deterministic assembly of agent outputs into the standard format.

    Tiers the rank mapper missed default to F so the validator reports them as orphans instead of
    silently dropping competencies.
    """
    tiers = {a.id: Tier(a.tier) for a in rank_map.assignments}
    ids = {c.id for c in decomposition.competencies}
    competencies = [
        Competency(
            id=c.id,
            name=c.name,
            tier=tiers.get(c.id, Tier.F),
            prerequisites=c.prerequisites,
            mastery_criteria=c.mastery_criteria,
            common_mistakes=c.common_mistakes,
            adapters=list(dict.fromkeys(c.adapters)),
            grounded_in=c.grounded_in,
            core=c.core,
        )
        for c in decomposition.competencies
    ]
    goals = [
        GoalTemplate(name=slugify(g.name), target_rank=Tier(g.target_rank), emphasis=[e for e in g.emphasis if any(i == e or i.startswith(e + ".") for i in ids)])
        for g in decomposition.goal_templates
    ]
    return SkillPack(
        pack=slugify(skill),
        name=skill.strip().title() if skill.islower() else skill.strip(),
        scope=grounding.scope,
        version="0.1.0",
        maturity=Maturity.draft,
        sources=sources,
        competencies=competencies,
        goal_templates=goals,
    )


def pack_to_text(pack: SkillPack) -> str:
    lines = [f"Skill: {pack.name}", f"Scope: {pack.scope}", "Sources:"]
    lines += [f"  {s.id}: [{s.kind.value}] {s.title}" for s in pack.sources]
    lines.append("Competencies:")
    for c in sorted(pack.competencies, key=lambda c: c.tier.order):
        lines.append(
            f"  [{c.tier.value}] {c.id}: {c.name}. Mastery: {c.mastery_criteria} "
            f"Requires: {', '.join(c.prerequisites) or '-'}. Adapters: {', '.join(c.adapters)}. "
            f"Sources: {', '.join(c.grounded_in)}"
        )
    return "\n".join(lines)


def coverage(pack: SkillPack, outline_topics: list[str]) -> tuple[float, list[str]]:
    """Rough lexical coverage of a reference outline: share of topics whose key words all appear
    in some competency. A model-judged coverage score replaces this in P1; hand scoring is the
    reference until then."""
    text = [f"{c.id} {c.name} {c.mastery_criteria}".lower() for c in pack.competencies]
    missing = []
    for topic in outline_topics:
        words = [w for w in re.findall(r"[a-z0-9]+", topic.lower()) if len(w) > 2]
        if words and not any(all(w in t for w in words) for t in text):
            missing.append(topic)
    total = len([t for t in outline_topics if t.strip()])
    return (1 - len(missing) / total if total else 1.0), missing


def write_report(result: ForgeResult, path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "forge_version": FORGE_VERSION,
                "pack": result.pack.pack,
                "competencies": len(result.pack.competencies),
                "verified_ceiling": result.ceiling.value if result.ceiling else None,
                "issues": [str(i) for i in result.issues],
                "critic_verdict": result.critique.verdict,
                "critic_issues": [i.model_dump() for i in result.critique.issues],
                "coverage_gaps": result.critique.coverage_gaps,
                "revisions": result.revisions,
                "cost_usd": result.cost_usd,
                "step_costs": result.step_costs,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
