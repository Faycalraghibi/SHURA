"""Pack registry: loads packs, validates them and matches skill requests to them.

P0 keeps packs as YAML files in `packs/`. P1 moves them into Postgres with immutable versions and
pgvector matching; the interface here stays the same.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

import yaml

from .format.ceiling import verified_ceiling
from .format.models import RankDefinitions, SkillPack, Tier
from .validate import Issue, errors, validate_pack

DEFAULT_PACKS_DIR = Path(__file__).resolve().parents[2] / "packs"

# Words that describe intent rather than the skill itself ("learn", "for data analysis").
_STOPWORDS = {"learn", "learning", "i", "want", "to", "how", "the", "a", "an", "basics", "basic", "intro", "introduction", "programming", "language", "for", "and", "of", "in", "with", "course", "skills", "skill"}
MATCH_THRESHOLD = 0.8


class PackLoadError(Exception):
    def __init__(self, path: Path, issues: list[Issue]):
        self.path = path
        self.issues = issues
        super().__init__(f"{path.name}: " + "; ".join(str(i) for i in issues))


@dataclass(frozen=True)
class Match:
    pack: SkillPack
    score: float
    matched_on: str
    goal_template: str | None = None


def normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9+#\s]", " ", text)
    return " ".join(text.split())


def _core_terms(text: str) -> str:
    return " ".join(w for w in normalize(text).split() if w not in _STOPWORDS)


class PackRegistry:
    def __init__(self, packs: dict[str, SkillPack], ranks: RankDefinitions | None = None):
        self._packs = packs
        self.ranks = ranks
        self._ceilings = {pid: verified_ceiling(p) for pid, p in packs.items()}

    @classmethod
    def from_dir(cls, directory: Path = DEFAULT_PACKS_DIR) -> "PackRegistry":
        packs: dict[str, SkillPack] = {}
        ranks = None
        for path in sorted(directory.glob("*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            if path.stem == "ranks":
                ranks = RankDefinitions.model_validate(data)
                continue
            pack = SkillPack.model_validate(data)
            if pack.pack in packs:
                raise PackLoadError(path, [])
            packs[pack.pack] = pack
        registry = cls(packs, ranks)
        for pid, pack in packs.items():
            problems = errors(validate_pack(pack, registry.lookup_tier))
            if problems:
                raise PackLoadError(directory / f"{pid}.yaml", problems)
        return registry

    def lookup_tier(self, pack_id: str, competency_id: str) -> Tier | None:
        pack = self._packs.get(pack_id)
        comp = pack.competency(competency_id) if pack else None
        return comp.tier if comp else None

    def all(self) -> list[SkillPack]:
        return list(self._packs.values())

    def get(self, pack_id: str) -> SkillPack | None:
        return self._packs.get(pack_id)

    def ceiling(self, pack_id: str) -> Tier | None:
        return self._ceilings[pack_id]

    def match(self, request: str) -> Match | None:
        """Map a free-text skill request onto an existing pack.

        "Python", "python programming" and "Python for data analysis" all land on the python pack;
        the intent difference becomes a goal template, not a new pack. P1 replaces the string
        similarity with embeddings.
        """
        query = normalize(request)
        core = _core_terms(request)
        if not query:
            return None
        best: Match | None = None
        for pack in self._packs.values():
            names = [pack.pack, pack.name, *pack.aliases]
            for name in names:
                n = normalize(name)
                if n == query:
                    score = 1.0
                elif core and (core == _core_terms(name) or re.search(rf"\b{re.escape(n)}\b", query)):
                    score = 0.95
                else:
                    score = max(
                        SequenceMatcher(None, query, n).ratio(),
                        SequenceMatcher(None, core, _core_terms(name)).ratio() if core else 0.0,
                    )
                if best is None or score > best.score:
                    best = Match(pack, score, name)
        if best is None or best.score < MATCH_THRESHOLD:
            return None
        return Match(best.pack, best.score, best.matched_on, _goal_for(best.pack, core))


def _goal_for(pack: SkillPack, core_query: str) -> str | None:
    """Pick a goal template whose name shares a meaningful word with the request."""
    words = set(core_query.split())
    for g in pack.goal_templates:
        if words & (set(g.name.split("_")) - _STOPWORDS - {"first", "job"}):
            return g.name
    return None
