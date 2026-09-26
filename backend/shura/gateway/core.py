from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-opus-5"

# USD per million tokens (input, output). Keep in sync with the provider's price list.
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


class GatewayError(Exception):
    pass


class ModelRefused(GatewayError):
    """The model declined the request (stop_reason == "refusal")."""


@dataclass(frozen=True)
class Prompt:
    """A versioned prompt. Changing the text means bumping the version."""

    name: str
    version: int
    system: str
    template: str
    # Feature key used for cost tracking and per-feature model choice (SHURA_MODEL_<FEATURE>).
    feature: str
    max_tokens: int = 16000

    @property
    def key(self) -> str:
        return f"{self.name}@v{self.version}"

    def render(self, **variables: str) -> str:
        return self.template.format(**variables)


@dataclass
class LLMResult:
    output: BaseModel
    model: str
    input_tokens: int
    output_tokens: int


class LLMClient(Protocol):
    def complete(
        self, *, model: str, system: str, user: str, schema: type[T], max_tokens: int
    ) -> LLMResult: ...


@dataclass
class CallRecord:
    prompt: str
    feature: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    seconds: float
    tags: dict[str, str] = field(default_factory=dict)
    at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = PRICES.get(model, PRICES[DEFAULT_MODEL])
    return round(input_tokens * pin / 1e6 + output_tokens * pout / 1e6, 6)


def data_block(label: str, text: str) -> str:
    """Wrap untrusted text (web pages, job postings, learner submissions) as quoted data.

    Prompts that include untrusted text must tell the model that anything inside <data> blocks is
    material to analyze, never instructions to follow.
    """
    safe = text.replace("</data>", "<\\/data>")
    return f'<data label="{label}">\n{safe}\n</data>'


class Gateway:
    def __init__(self, client: LLMClient, log_path: Path | None = None, budget_usd: float | None = None):
        self.client = client
        self.log_path = log_path
        self.budget_usd = budget_usd
        self.records: list[CallRecord] = []

    @property
    def spent_usd(self) -> float:
        return round(sum(r.cost_usd for r in self.records), 6)

    def model_for(self, prompt: Prompt) -> str:
        return os.environ.get(f"SHURA_MODEL_{prompt.feature.upper()}") or os.environ.get(
            "SHURA_MODEL", DEFAULT_MODEL
        )

    def run(self, prompt: Prompt, schema: type[T], tags: dict[str, str] | None = None, **variables: str) -> T:
        if self.budget_usd is not None and self.spent_usd >= self.budget_usd:
            raise GatewayError(f"budget of ${self.budget_usd} reached")
        model = self.model_for(prompt)
        started = time.monotonic()
        result = self.client.complete(
            model=model,
            system=prompt.system,
            user=prompt.render(**variables),
            schema=schema,
            max_tokens=prompt.max_tokens,
        )
        # Re-validate even when the client already parsed: the gateway owns the schema check.
        try:
            output = schema.model_validate(result.output.model_dump())
        except ValidationError as e:
            raise GatewayError(f"{prompt.key} returned output that fails {schema.__name__}: {e}") from e
        record = CallRecord(
            prompt=prompt.key,
            feature=prompt.feature,
            model=result.model,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            cost_usd=cost_usd(result.model, result.input_tokens, result.output_tokens),
            seconds=round(time.monotonic() - started, 3),
            tags=tags or {},
        )
        self.records.append(record)
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(record)) + "\n")
        return output
