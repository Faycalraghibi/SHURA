"""The ceiling rule, computed by plain code, never by a model.

A competency can reach Mastered only through objective or rubric evidence. If a tier's core
competencies cannot all be evidenced that way with adapters that exist today, the tier cannot be
verified, and the skill's verified ceiling stops below it.
"""

from __future__ import annotations

from collections.abc import Iterable

from .adapters import ADAPTERS, AVAILABLE_ADAPTERS, TRUST_STRENGTH, VERIFYING_TRUST
from .models import TIER_ORDER, Competency, SkillPack, Tier, Trust


def competency_verifiability(
    c: Competency, available: Iterable[str] = AVAILABLE_ADAPTERS
) -> Trust | None:
    """Strongest trust level among the competency's adapters that are available.

    Returns None when no listed adapter is available yet.
    """
    available = set(available)
    trusts = {ADAPTERS[a].trust for a in c.adapters if a in ADAPTERS and a in available}
    for t in TRUST_STRENGTH:
        if t in trusts:
            return t
    return None


def declared_verifiability(c: Competency) -> Trust | None:
    """Strongest trust among all listed adapters, shipped or not (what the format field records)."""
    return competency_verifiability(c, available=ADAPTERS.keys())


def tier_verifiable(
    competencies: list[Competency], available: Iterable[str] = AVAILABLE_ADAPTERS
) -> bool:
    core = [c for c in competencies if c.core] or competencies
    return all(competency_verifiability(c, available) in VERIFYING_TRUST for c in core)


def verified_ceiling(pack: SkillPack, available: Iterable[str] = AVAILABLE_ADAPTERS) -> Tier | None:
    """Highest rank SHURA can certify for this pack.

    Walks tiers from F upward and stops at the first tier that is empty or cannot be verified.
    S is the exception for emptiness: it is defined by the generic sustained-mastery rule
    (rank A held 90+ days, capstone, teach-back), so a verified A with no S competencies
    allows S. Returns None when even tier F cannot be verified.
    """
    available = set(available)
    by_tier: dict[Tier, list[Competency]] = {t: [] for t in TIER_ORDER}
    for c in pack.competencies:
        by_tier[c.tier].append(c)

    ceiling: Tier | None = None
    for tier in TIER_ORDER:
        comps = by_tier[tier]
        if not comps:
            if tier is Tier.S and ceiling is Tier.A:
                ceiling = Tier.S
            break
        if not tier_verifiable(comps, available):
            break
        ceiling = tier
    return ceiling


def ceiling_message(pack: SkillPack, ceiling: Tier | None) -> str:
    if ceiling is None:
        return f"SHURA cannot verify any rank in {pack.name} yet. It guides your training but cannot certify it."
    if ceiling is Tier.S:
        return f"SHURA can verify {pack.name} all the way to Rank S."
    return (
        f"SHURA can verify {pack.name} up to Rank {ceiling.value}. "
        "Beyond that it guides your training but cannot certify it."
    )
