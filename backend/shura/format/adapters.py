"""Evidence adapters: the fixed set of ways a submission becomes evidence.

The Forge chooses among these adapters; it cannot invent new ones. Only adapters in
`AVAILABLE_ADAPTERS` count toward a pack's verified ceiling, so ceilings rise automatically
when an adapter ships.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import Trust


@dataclass(frozen=True)
class Adapter:
    name: str
    checks: str
    trust: Trust
    phase: str  # mvp | launch | after_launch | later


ADAPTERS: dict[str, Adapter] = {
    a.name: a
    for a in [
        Adapter("choice", "Recognition and quick recall", Trust.objective, "mvp"),
        Adapter("exact_answer", "Numbers, symbolic math, short strings, readings", Trust.objective, "mvp"),
        Adapter("code", "Programs run against hidden tests in a sandbox", Trust.objective, "mvp"),
        Adapter("written", "Explanations and reasoning, graded by rubric plus viva", Trust.rubric, "mvp"),
        Adapter("spoken", "Speech-to-text plus rubric", Trust.rubric, "mvp"),
        Adapter("self_report", "Practice logs and reflections", Trust.self_reported, "mvp"),
        Adapter("project", "Repository checked against acceptance tests and a rubric", Trust.mixed, "launch"),
        Adapter("image", "Photos and artifacts graded by a vision model and rubric", Trust.rubric, "after_launch"),
        Adapter("audio_analysis", "Pitch, rhythm and pronunciation scoring", Trust.objective, "later"),
    ]
}

# Adapters the product will have at public launch. Update this set as adapters ship.
AVAILABLE_ADAPTERS: frozenset[str] = frozenset(
    name for name, a in ADAPTERS.items() if a.phase in {"mvp", "launch"}
)

# Strongest first. Self-reported evidence never counts toward Mastered.
TRUST_STRENGTH: list[Trust] = [Trust.objective, Trust.mixed, Trust.rubric, Trust.self_reported]
VERIFYING_TRUST: frozenset[Trust] = frozenset({Trust.objective, Trust.mixed, Trust.rubric})
