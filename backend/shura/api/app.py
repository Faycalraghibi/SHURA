"""HTTP API used by the mobile app.

    uvicorn shura.api.app:app --reload --host 0.0.0.0
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..format.ceiling import ceiling_message, competency_verifiability
from ..format.models import FORMAT_VERSION, SkillPack, Tier
from ..registry import DEFAULT_PACKS_DIR, PackRegistry

app = FastAPI(title="SHURA API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("SHURA_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_registry() -> PackRegistry:
    return PackRegistry.from_dir(Path(os.environ.get("SHURA_PACKS_DIR", DEFAULT_PACKS_DIR)))


# In-memory for P0. P1 stores skill requests in Postgres; they are also the demand signal.
_requests: list[dict] = []


class PackSummary(BaseModel):
    pack: str
    name: str
    scope: str
    version: str
    maturity: str
    verified_ceiling: Tier | None
    ceiling_message: str
    competency_count: int
    top_tier: Tier


class CompetencyView(BaseModel):
    id: str
    name: str
    tier: Tier
    prerequisites: list[str]
    mastery_criteria: str
    common_mistakes: list[str]
    adapters: list[str]
    verifiability: str | None
    grounded_in: list[str]
    core: bool


class PackView(PackSummary):
    format_version: int = FORMAT_VERSION
    freshness: str
    sources: list[dict]
    competencies: list[CompetencyView]
    goal_templates: list[dict]


class SkillRequestIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class SkillRequestOut(BaseModel):
    status: Literal["matched", "queued"]
    request_id: str
    pack: str | None = None
    goal_template: str | None = None
    score: float | None = None
    message: str


def _summary(registry: PackRegistry, p: SkillPack) -> dict:
    ceiling = registry.ceiling(p.pack)
    return dict(
        pack=p.pack,
        name=p.name,
        scope=p.scope,
        version=p.version,
        maturity=p.maturity.value,
        verified_ceiling=ceiling,
        ceiling_message=ceiling_message(p, ceiling),
        competency_count=len(p.competencies),
        top_tier=max((c.tier for c in p.competencies), key=lambda t: t.order),
    )


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/ranks")
def ranks(registry: PackRegistry = Depends(get_registry)) -> dict:
    if registry.ranks is None:
        raise HTTPException(404, "rank definitions not loaded")
    return registry.ranks.model_dump(mode="json")


@app.get("/packs", response_model=list[PackSummary])
def list_packs(registry: PackRegistry = Depends(get_registry)) -> list[dict]:
    return [_summary(registry, p) for p in sorted(registry.all(), key=lambda p: p.name)]


@app.get("/packs/{pack_id}", response_model=PackView)
def get_pack(pack_id: str, registry: PackRegistry = Depends(get_registry)) -> dict:
    p = registry.get(pack_id)
    if p is None:
        raise HTTPException(404, f"no pack {pack_id!r}")
    comps = []
    for c in p.competencies:
        v = competency_verifiability(c)
        comps.append({**c.model_dump(mode="json", exclude={"verifiability"}), "verifiability": v.value if v else None})
    return dict(
        **_summary(registry, p),
        freshness=p.freshness.value,
        sources=[s.model_dump(mode="json") for s in p.sources],
        competencies=comps,
        goal_templates=[g.model_dump(mode="json") for g in p.goal_templates],
    )


@app.post("/skill-requests", response_model=SkillRequestOut)
def request_skill(body: SkillRequestIn, registry: PackRegistry = Depends(get_registry)) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty skill request")
    request_id = uuid.uuid4().hex
    match = registry.match(text)
    record = {"id": request_id, "text": text, "at": datetime.now(timezone.utc).isoformat()}
    if match:
        record.update(matched=match.pack.pack)
        _requests.append(record)
        return dict(
            status="matched",
            request_id=request_id,
            pack=match.pack.pack,
            goal_template=match.goal_template,
            score=round(match.score, 3),
            message=f"{match.pack.name} is ready.",
        )
    record.update(matched=None)
    _requests.append(record)
    return dict(
        status="queued",
        request_id=request_id,
        message="No pack exists for this skill yet. The Skill Forge will build it.",
    )
