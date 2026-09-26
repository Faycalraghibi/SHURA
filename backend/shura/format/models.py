"""Standard program format v1.

Every skill, from Python to photography, is described with these models. The learner model,
planner, rank arbiter and app only ever see this format, never skill-specific code.
"""

from __future__ import annotations

import re
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator

FORMAT_VERSION = 1

_ID = r"[a-z0-9_]+(\.[a-z0-9_]+)*"
LOCAL_ID_RE = re.compile(rf"^{_ID}$")
# A prerequisite may point into another pack: "python:functions.define".
REF_ID_RE = re.compile(rf"^([a-z0-9_]+:)?{_ID}$")
PACK_ID_RE = re.compile(r"^[a-z0-9_]+$")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


class Tier(str, Enum):
    F = "F"
    E = "E"
    D = "D"
    C = "C"
    B = "B"
    A = "A"
    S = "S"

    @property
    def order(self) -> int:
        return TIER_ORDER.index(self)

    def __lt__(self, other: object) -> bool:  # type: ignore[override]
        if not isinstance(other, Tier):
            return NotImplemented
        return self.order < other.order

    def __le__(self, other: object) -> bool:  # type: ignore[override]
        if not isinstance(other, Tier):
            return NotImplemented
        return self.order <= other.order


TIER_ORDER: list[Tier] = [Tier.F, Tier.E, Tier.D, Tier.C, Tier.B, Tier.A, Tier.S]


class Maturity(str, Enum):
    draft = "draft"
    calibrated = "calibrated"
    reviewed = "reviewed"


class Freshness(str, Enum):
    slow = "slow"  # re-grounded about once a year
    fast = "fast"  # re-grounded every few months


class Trust(str, Enum):
    objective = "objective"
    rubric = "rubric"
    mixed = "mixed"
    self_reported = "self_reported"


class SourceKind(str, Enum):
    framework = "framework"
    syllabus = "syllabus"
    certification = "certification"
    documentation = "documentation"
    book = "book"
    course = "course"
    other = "other"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(_Strict):
    id: str = Field(pattern=r"^[a-z0-9_]+$")
    kind: SourceKind
    title: str = Field(min_length=3)
    url: str | None = None


class Competency(_Strict):
    id: str
    name: str = Field(min_length=3)
    tier: Tier
    prerequisites: list[str] = Field(default_factory=list)
    mastery_criteria: str = Field(min_length=10)
    common_mistakes: list[str] = Field(default_factory=list)
    adapters: list[str] = Field(min_length=1)
    # Optional in authored packs: the ceiling module computes it. If declared it must agree.
    verifiability: Trust | None = None
    grounded_in: list[str] = Field(default_factory=list)
    # Non-core competencies never block a tier from being verifiable.
    core: bool = True

    @field_validator("id")
    @classmethod
    def _id_shape(cls, v: str) -> str:
        if not LOCAL_ID_RE.match(v):
            raise ValueError(f"competency id {v!r} must be dotted lowercase, e.g. 'kana.hiragana.read'")
        return v

    @field_validator("prerequisites")
    @classmethod
    def _prereq_shape(cls, v: list[str]) -> list[str]:
        for ref in v:
            if not REF_ID_RE.match(ref):
                raise ValueError(f"prerequisite {ref!r} must be a competency id or 'pack:competency.id'")
        return v


class GoalTemplate(_Strict):
    name: str = Field(pattern=r"^[a-z0-9_]+$")
    target_rank: Tier
    # Competency id prefixes the goal weights up, e.g. "speaking" matches "speaking.self_introduction".
    emphasis: list[str] = Field(default_factory=list)


class SkillPack(_Strict):
    pack: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    scope: str = Field(min_length=10)
    version: str
    maturity: Maturity = Maturity.draft
    freshness: Freshness = Freshness.slow
    # Optional in authored packs: always recomputed by rule. If declared it must agree.
    verified_ceiling: Tier | None = None
    sources: list[Source] = Field(default_factory=list)
    competencies: list[Competency] = Field(min_length=1)
    goal_templates: list[GoalTemplate] = Field(default_factory=list)

    @field_validator("pack")
    @classmethod
    def _pack_shape(cls, v: str) -> str:
        if not PACK_ID_RE.match(v):
            raise ValueError("pack id must be lowercase letters, digits and underscores")
        return v

    @field_validator("version")
    @classmethod
    def _semver(cls, v: str) -> str:
        if not SEMVER_RE.match(v):
            raise ValueError("version must be semver, e.g. 0.3.0")
        return v

    def competency(self, cid: str) -> Competency | None:
        return next((c for c in self.competencies if c.id == cid), None)


class RankDefinition(_Strict):
    rank: Tier
    title: str
    meaning: str
    observable: str
    evidence_focus: list[str]
    trial: str


class RankDefinitions(_Strict):
    format_version: int
    ranks: list[RankDefinition]
