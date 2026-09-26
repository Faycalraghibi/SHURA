"""HTTP API used by the mobile app.

    export NVIDIA_API_KEY=nvapi-...
    uvicorn shura.api.app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..format.ceiling import ceiling_message, competency_verifiability
from ..format.models import FORMAT_VERSION, SkillPack, Tier
from ..gateway import Gateway, GatewayError
from ..registry import DEFAULT_PACKS_DIR, PackRegistry
from ..system import service
from ..system.schemas import (
    AssessIn,
    AwakenIn,
    ChoiceItem,
    Evaluation,
    EvaluateIn,
    HintIn,
    Quest,
    QuestIn,
)

app = FastAPI(title="SHURA API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("SHURA_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

DATA_DIR = Path(os.environ.get("SHURA_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))


@lru_cache(maxsize=1)
def get_store() -> service.PackStore:
    base = PackRegistry.from_dir(Path(os.environ.get("SHURA_PACKS_DIR", DEFAULT_PACKS_DIR)))
    return service.PackStore(base, DATA_DIR / "forged")


def get_registry(store: service.PackStore = Depends(get_store)) -> PackRegistry:
    return store.registry


@lru_cache(maxsize=1)
def get_gateway() -> Gateway:
    from ..gateway.nvidia_client import NvidiaClient

    try:
        client = NvidiaClient()
    except GatewayError as e:
        raise HTTPException(503, str(e)) from e
    return Gateway(client, log_path=DATA_DIR / "calls.jsonl")


# ---------- views ----------


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
    pack: str | None = None
    goal_template: str | None = None
    score: float | None = None
    message: str


class AwakenOut(BaseModel):
    pack: PackView
    newly_built: bool


class AssessOut(BaseModel):
    items: list[ChoiceItem]


class HintOut(BaseModel):
    level: int
    hint: str


def summary(registry: PackRegistry, p: SkillPack) -> dict:
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


def pack_view(registry: PackRegistry, p: SkillPack) -> dict:
    comps = []
    for c in p.competencies:
        v = competency_verifiability(c)
        comps.append({**c.model_dump(mode="json", exclude={"verifiability"}), "verifiability": v.value if v else None})
    return dict(
        **summary(registry, p),
        freshness=p.freshness.value,
        sources=[s.model_dump(mode="json") for s in p.sources],
        competencies=comps,
        goal_templates=[g.model_dump(mode="json") for g in p.goal_templates],
    )


def _pack_or_404(store: service.PackStore, pack_id: str) -> SkillPack:
    pack = store.get(pack_id)
    if pack is None:
        raise HTTPException(404, f"no pack {pack_id!r}")
    return pack


def _system_errors(fn):
    try:
        return fn()
    except service.SystemRefusal as e:
        raise HTTPException(422, str(e)) from e
    except GatewayError as e:
        raise HTTPException(502, str(e)) from e


# ---------- knowledge layer ----------


@app.get("/health")
def health() -> dict:
    return {"ok": True, "ai": "configured" if os.environ.get("NVIDIA_API_KEY") else "missing NVIDIA_API_KEY"}


@app.get("/ranks")
def ranks(registry: PackRegistry = Depends(get_registry)) -> dict:
    if registry.ranks is None:
        raise HTTPException(404, "rank definitions not loaded")
    return registry.ranks.model_dump(mode="json")


@app.get("/packs", response_model=list[PackSummary])
def list_packs(registry: PackRegistry = Depends(get_registry)) -> list[dict]:
    return [summary(registry, p) for p in sorted(registry.all(), key=lambda p: p.name)]


@app.get("/packs/{pack_id}", response_model=PackView)
def get_pack(pack_id: str, store: service.PackStore = Depends(get_store)) -> dict:
    return pack_view(store.registry, _pack_or_404(store, pack_id))


@app.post("/skill-requests", response_model=SkillRequestOut)
def request_skill(body: SkillRequestIn, registry: PackRegistry = Depends(get_registry)) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "empty skill request")
    match = registry.match(text)
    if match:
        return dict(
            status="matched", pack=match.pack.pack, goal_template=match.goal_template,
            score=round(match.score, 3), message=f"{match.pack.name} is ready.",
        )
    return dict(status="queued", message="No skill tree exists for this skill yet.")


# ---------- the System ----------


@app.post("/system/awaken", response_model=AwakenOut)
def system_awaken(body: AwakenIn, store: service.PackStore = Depends(get_store)) -> dict:
    match = store.registry.match(body.skill)
    if match:  # no model needed for skills that already have a tree
        return {"pack": pack_view(store.registry, match.pack), "newly_built": False}
    gateway = get_gateway()
    pack, built = _system_errors(lambda: service.awaken(store, gateway, body.skill, DATA_DIR / "forge_runs"))
    return {"pack": pack_view(store.registry, pack), "newly_built": built}


@app.post("/system/assess", response_model=AssessOut)
def system_assess(body: AssessIn, store: service.PackStore = Depends(get_store), gateway: Gateway = Depends(get_gateway)) -> dict:
    pack = _pack_or_404(store, body.pack_id)
    return {"items": _system_errors(lambda: service.diagnostic(pack, gateway, body.count))}


@app.post("/system/quest", response_model=Quest)
def system_quest(body: QuestIn, store: service.PackStore = Depends(get_store), gateway: Gateway = Depends(get_gateway)) -> Quest:
    pack = _pack_or_404(store, body.pack_id)
    return _system_errors(lambda: service.make_quest(pack, gateway, body))


@app.post("/system/evaluate", response_model=Evaluation)
def system_evaluate(body: EvaluateIn, store: service.PackStore = Depends(get_store), gateway: Gateway = Depends(get_gateway)) -> Evaluation:
    pack = _pack_or_404(store, body.quest.pack_id)
    return _system_errors(lambda: service.evaluate(pack, gateway, body.quest, body.submission))


@app.post("/system/hint", response_model=HintOut)
def system_hint(body: HintIn, store: service.PackStore = Depends(get_store), gateway: Gateway = Depends(get_gateway)) -> dict:
    pack = _pack_or_404(store, body.quest.pack_id)
    return {"level": body.level, "hint": _system_errors(lambda: service.hint(pack, gateway, body.quest, body.attempt, body.level))}
