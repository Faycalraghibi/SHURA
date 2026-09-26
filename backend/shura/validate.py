"""Deterministic pack checks.

These run on every hand-written pack and on every pack the Forge produces. A pack with any
error-level issue is never served to learners.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from .format.adapters import ADAPTERS
from .format.ceiling import declared_verifiability, verified_ceiling
from .format.models import TIER_ORDER, SkillPack, Tier

MIN_SOURCES = 3


class Severity(str, Enum):
    error = "error"
    warning = "warning"


@dataclass(frozen=True)
class Issue:
    severity: Severity
    code: str
    message: str
    competency: str | None = None

    def __str__(self) -> str:
        where = f" [{self.competency}]" if self.competency else ""
        return f"{self.severity.value}: {self.code}{where}: {self.message}"


# Resolves a cross-pack reference "pack:competency.id" to that competency's tier, or None.
ExternalLookup = Callable[[str, str], Tier | None]


def validate_pack(pack: SkillPack, external: ExternalLookup | None = None) -> list[Issue]:
    issues: list[Issue] = []

    def err(code: str, msg: str, cid: str | None = None) -> None:
        issues.append(Issue(Severity.error, code, msg, cid))

    def warn(code: str, msg: str, cid: str | None = None) -> None:
        issues.append(Issue(Severity.warning, code, msg, cid))

    # Unique ids.
    seen: set[str] = set()
    for c in pack.competencies:
        if c.id in seen:
            err("duplicate_competency", f"competency id {c.id!r} appears more than once", c.id)
        seen.add(c.id)
    source_ids = [s.id for s in pack.sources]
    if len(source_ids) != len(set(source_ids)):
        err("duplicate_source", "source ids must be unique")

    comps = {c.id: c for c in pack.competencies}
    local_edges: dict[str, list[str]] = {cid: [] for cid in comps}
    has_dependents: set[str] = set()

    for c in pack.competencies:
        # Prerequisites exist and sit at or below this competency's tier.
        for ref in c.prerequisites:
            if ref == c.id:
                err("self_prerequisite", "a competency cannot require itself", c.id)
                continue
            if ":" in ref:
                other_pack, other_id = ref.split(":", 1)
                if other_pack == pack.pack:
                    err("self_pack_reference", f"use the local id {other_id!r} instead of {ref!r}", c.id)
                    continue
                if external is None:
                    warn("unchecked_external", f"cross-pack prerequisite {ref!r} not checked", c.id)
                    continue
                tier = external(other_pack, other_id)
                if tier is None:
                    err("unknown_prerequisite", f"cross-pack prerequisite {ref!r} does not exist", c.id)
                elif c.tier < tier:
                    err("tier_order", f"{c.id} ({c.tier.value}) sits below its prerequisite {ref} ({tier.value})", c.id)
                continue
            pre = comps.get(ref)
            if pre is None:
                err("unknown_prerequisite", f"prerequisite {ref!r} does not exist", c.id)
                continue
            local_edges[c.id].append(ref)
            has_dependents.add(ref)
            if c.tier < pre.tier:
                err("tier_order", f"{c.id} ({c.tier.value}) sits below its prerequisite {ref} ({pre.tier.value})", c.id)

        # Adapters exist.
        unknown = [a for a in c.adapters if a not in ADAPTERS]
        if unknown:
            err("unknown_adapter", f"unknown adapters {unknown}; the Forge cannot invent adapters", c.id)
        if len(set(c.adapters)) != len(c.adapters):
            warn("duplicate_adapter", "adapter listed twice", c.id)

        # Declared verifiability must match the rule.
        if c.verifiability is not None and not unknown:
            expected = declared_verifiability(c)
            if c.verifiability != expected:
                err(
                    "verifiability_mismatch",
                    f"declared {c.verifiability.value} but adapters give {expected.value if expected else 'none'}",
                    c.id,
                )

        # Grounding.
        if not c.grounded_in:
            err("ungrounded", "every competency must cite at least one source", c.id)
        for sid in c.grounded_in:
            if sid not in source_ids:
                err("unknown_source", f"grounded_in cites unknown source {sid!r}", c.id)

    # Orphans: above tier F, a competency must build on something.
    for c in pack.competencies:
        if c.tier is not Tier.F and not c.prerequisites:
            err("orphan", f"tier {c.tier.value} competency has no prerequisites", c.id)
    if len(comps) > 1:
        for c in pack.competencies:
            if not c.prerequisites and c.id not in has_dependents:
                warn("isolated", "competency is not connected to the rest of the graph", c.id)

    # No cycles (only reachable through tier-equal edges, but checked independently).
    for cycle in _find_cycles(local_edges):
        err("cycle", " -> ".join(cycle), cycle[0])

    # Tier coverage.
    if not any(c.tier is Tier.F for c in pack.competencies):
        err("no_foundation", "a pack needs at least one tier F competency")
    present = {c.tier for c in pack.competencies}
    top = max(present, key=lambda t: t.order)
    for t in TIER_ORDER[: top.order]:
        if t not in present:
            warn("tier_gap", f"no competencies at tier {t.value}; the verified ceiling stops below it")

    # Grounding volume.
    if len(pack.sources) < MIN_SOURCES:
        warn("low_grounding", f"only {len(pack.sources)} sources; at least {MIN_SOURCES} expected")

    # Declared ceiling must match the rule.
    ceiling = verified_ceiling(pack)
    if pack.verified_ceiling is not None and pack.verified_ceiling != ceiling:
        err(
            "ceiling_mismatch",
            f"declared ceiling {pack.verified_ceiling.value} but the rule gives {ceiling.value if ceiling else 'none'}",
        )

    # Goal templates point at real parts of the graph.
    names: set[str] = set()
    for g in pack.goal_templates:
        if g.name in names:
            err("duplicate_goal", f"goal template {g.name!r} appears twice")
        names.add(g.name)
        for prefix in g.emphasis:
            if not any(cid == prefix or cid.startswith(prefix + ".") for cid in comps):
                err("unknown_emphasis", f"goal {g.name!r} emphasis {prefix!r} matches no competency")
        if ceiling is None or ceiling < g.target_rank:
            warn("goal_above_ceiling", f"goal {g.name!r} targets rank {g.target_rank.value} above the verified ceiling")

    return issues


def errors(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i.severity is Severity.error]


def _find_cycles(edges: dict[str, list[str]]) -> list[list[str]]:
    WHITE, GREY, BLACK = 0, 1, 2
    color = {n: WHITE for n in edges}
    stack: list[str] = []
    cycles: list[list[str]] = []

    def visit(n: str) -> None:
        color[n] = GREY
        stack.append(n)
        for m in edges.get(n, []):
            if color.get(m) == GREY:
                cycles.append(stack[stack.index(m):] + [m])
            elif color.get(m) == WHITE:
                visit(m)
        stack.pop()
        color[n] = BLACK

    for n in edges:
        if color[n] == WHITE:
            visit(n)
    return cycles
