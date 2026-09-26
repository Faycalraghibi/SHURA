"""Schemas for the System: what the models must return and what the app sends and receives."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EvidenceType = Literal[
    "recognition", "recall", "explanation", "modification", "debugging", "production", "transfer"
]
QuestFormat = Literal["choice", "written", "code"]
FailureCause = Literal[
    "none",
    "slip",
    "execution_error",
    "misconception",
    "missing_prerequisite",
    "forgotten",
    "transfer_gap",
    "off_topic",
]
TierName = Literal["F", "E", "D", "C", "B", "A", "S"]


# ---------- model outputs ----------


class ChoiceItem(BaseModel):
    competency_id: str
    question: str
    options: list[str] = Field(description="Exactly 4 distinct options.")
    answer_index: int = Field(description="Index (0-3) of the correct option.")
    explanation: str = Field(description="Why the correct option is right, in one or two sentences.")


class DiagnosticDraft(BaseModel):
    items: list[ChoiceItem]


class QuestDraft(BaseModel):
    title: str = Field(description="Short evocative quest name, e.g. 'The Path Through the Forest'.")
    flavor: str = Field(description="One sentence in the voice of the System announcing the quest.")
    objective: str = Field(description="What the player must be able to do, in one sentence.")
    format: QuestFormat
    instructions: str = Field(description="The full task statement the player works from.")
    requirements: list[str] = Field(description="Concrete things the submission must contain.")
    items: list[ChoiceItem] = Field(description="Only for format 'choice': 3 to 5 questions. Empty otherwise.")
    rubric: list[str] = Field(description="For 'written' and 'code': 3 to 6 observable pass criteria. Empty for 'choice'.")
    starter: str = Field(description="Optional starter code or text for the player; empty string if none.")
    resource_queries: list[str] = Field(description="2 or 3 search queries for free resources that teach this.")


class CriterionVerdict(BaseModel):
    criterion: str
    met: bool
    comment: str


class EvaluationDraft(BaseModel):
    criteria: list[CriterionVerdict]
    feedback: str = Field(description="Direct feedback to the player, 2 to 4 sentences.")
    strengths: list[str]
    weaknesses: list[str]
    failure_cause: FailureCause
    missing_prerequisite: str | None = Field(
        description="Competency id of a prerequisite the player seems to lack, or null."
    )


class HintDraft(BaseModel):
    hint: str


# ---------- API ----------


class AwakenIn(BaseModel):
    skill: str = Field(min_length=1, max_length=120)
    goal: str | None = Field(default=None, max_length=300)


class AssessIn(BaseModel):
    pack_id: str
    count: int = Field(default=8, ge=4, le=12)


class Resource(BaseModel):
    title: str
    url: str
    kind: Literal["video_search", "docs_search"]


class QuestIn(BaseModel):
    pack_id: str
    competency_id: str
    evidence_type: EvidenceType
    known: list[str] = Field(default_factory=list, description="Names of competencies already proven.")
    weakness: str | None = None
    retest: bool = False


class Quest(BaseModel):
    id: str
    pack_id: str
    competency_id: str
    competency_name: str
    tier: TierName
    evidence_type: EvidenceType
    retest: bool
    title: str
    flavor: str
    objective: str
    format: QuestFormat
    instructions: str
    requirements: list[str]
    items: list[ChoiceItem]
    rubric: list[str]
    starter: str
    resources: list[Resource]


class EvaluateIn(BaseModel):
    quest: Quest
    submission: str = Field(min_length=1, max_length=20000)
    hints_used: int = Field(default=0, ge=0, le=6)


class Evaluation(BaseModel):
    score: float
    passed: bool
    criteria: list[CriterionVerdict]
    feedback: str
    strengths: list[str]
    weaknesses: list[str]
    failure_cause: FailureCause
    missing_prerequisite: str | None


class HintIn(BaseModel):
    quest: Quest
    attempt: str = Field(default="", max_length=20000)
    level: int = Field(ge=1, le=6)
