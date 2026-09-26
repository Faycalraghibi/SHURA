"""Output schemas for each Forge agent. The gateway validates every model output against these."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AdapterName = Literal[
    "choice", "exact_answer", "code", "written", "spoken", "self_report", "project", "image", "audio_analysis"
]
TierName = Literal["F", "E", "D", "C", "B", "A", "S"]
SourceKindName = Literal["framework", "syllabus", "certification", "documentation", "book", "course", "other"]


class GroundedSource(BaseModel):
    kind: SourceKindName
    title: str
    url: str | None = Field(description="Only a URL you are certain exists; otherwise null.")
    topics: list[str] = Field(description="Main topics or chapters this source covers, in order.")


class GroundingOutput(BaseModel):
    """Stage 2, grounding scout."""

    scope: str = Field(description="One-sentence scope of the skill as it will be taught.")
    sources: list[GroundedSource]
    notes: str = Field(description="Anything that limits how well this skill can be grounded.")


class DraftCompetency(BaseModel):
    id: str = Field(description="Dotted lowercase id, e.g. 'join.inner'. Stable and unique.")
    name: str
    prerequisites: list[str] = Field(description="Ids of competencies in this list that must come first.")
    mastery_criteria: str = Field(description="Observable behaviour that proves mastery.")
    common_mistakes: list[str]
    adapters: list[AdapterName] = Field(description="How this competency can be evidenced.")
    grounded_in: list[str] = Field(description="Source ids (s1, s2, ...) this competency comes from.")
    core: bool = True


class GoalTemplateDraft(BaseModel):
    name: str = Field(description="snake_case name, e.g. data_analyst")
    target_rank: TierName
    emphasis: list[str] = Field(description="Competency id prefixes this goal weights up.")


class DecompositionOutput(BaseModel):
    """Stage 3, decomposer (P0 also chooses adapters, the evidence designer's job from P1 on)."""

    competencies: list[DraftCompetency]
    goal_templates: list[GoalTemplateDraft]


class TierAssignment(BaseModel):
    id: str
    tier: TierName
    rationale: str


class RankMapOutput(BaseModel):
    """Stage 4, rank mapper."""

    assignments: list[TierAssignment]


class CritiqueIssue(BaseModel):
    competency_id: str | None
    severity: Literal["blocking", "minor"]
    message: str


class CritiqueOutput(BaseModel):
    """Stage 8, critic. Sees only the pack, not the other agents' reasoning."""

    issues: list[CritiqueIssue]
    coverage_gaps: list[str] = Field(description="Source topics the graph does not cover.")
    verdict: Literal["accept", "revise"]
