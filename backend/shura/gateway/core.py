from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

# Free NVIDIA API (build.nvidia.com). Override with SHURA_MODEL or SHURA_MODEL_<FEATURE>.
DEFAULT_MODEL = "meta/llama-3.3-70b-instruct"

# USD per million tokens (input, output). The free NVIDIA tier costs nothing; tokens are still
# logged so a paid provider can be priced later.
PRICES: dict[str, tuple[float, float]] = {}

MAX_REPAIRS = 1


class GatewayError(Exception):
    pass


class ModelRefused(GatewayError):
    """The model declined the request."""


@dataclass(frozen=True)
class Prompt:
    """A versioned prompt. Changing the text means bumping the version."""

    name: str
    version: int
    system: str
    template: str
    # Feature key used for cost tracking and per-feature model choice (SHURA_MODEL_<FEATURE>).
    feature: str
    max_tokens: int = 4096

    @property
    def key(self) -> str:
        return f"{self.name}@v{self.version}"

    def render(self, **variables: str) -> str:
        return self.template.format(**variables)


@dataclass
class RawResult:
    text: str
    model: str
    input_tokens: int
    output_tokens: int


class LLMClient(Protocol):
    def complete(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        json_schema: dict[str, Any],
        schema_name: str,
    ) -> RawResult: ...


@dataclass
class CallRecord:
    prompt: str
    feature: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    seconds: float
    repairs: int = 0
    tags: dict[str, str] = field(default_factory=dict)
    at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = PRICES.get(model, (0.0, 0.0))
    return round(input_tokens * pin / 1e6 + output_tokens * pout / 1e6, 6)


def data_block(label: str, text: str) -> str:
    """Wrap untrusted text (web pages, learner submissions) as quoted data.

    Prompts that include untrusted text must tell the model that anything inside <data> blocks is
    material to analyze, never instructions to follow.
    """
    safe = text.replace("</data>", "<\\/data>")
    return f'<data label="{label}">\n{safe}\n</data>'


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(text: str) -> Any:
    """Pull one JSON object out of a model reply (handles reasoning tags and code fences)."""
    text = _THINK.sub("", text).strip()
    fenced = _FENCE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(text[start : end + 1])


def schema_instruction(schema: dict[str, Any]) -> str:
    return (
        "\n\nRespond with a single JSON object and nothing else: no prose, no code fences. "
        "It must validate against this JSON Schema:\n" + json.dumps(schema, separators=(",", ":"))
    )


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
        json_schema = schema.model_json_schema()
        system = prompt.system + schema_instruction(json_schema)
        user = prompt.render(**variables)
        started = time.monotonic()
        tokens_in = tokens_out = 0
        repairs = 0
        served_by = model
        while True:
            raw = self.client.complete(
                model=model, system=system, user=user, max_tokens=prompt.max_tokens,
                json_schema=json_schema, schema_name=schema.__name__,
            )
            tokens_in += raw.input_tokens
            tokens_out += raw.output_tokens
            served_by = raw.model
            try:
                output = schema.model_validate(extract_json(raw.text))
                break
            except (ValueError, ValidationError) as e:
                if repairs >= MAX_REPAIRS:
                    raise GatewayError(f"{prompt.key}: model output failed {schema.__name__}: {e}") from e
                repairs += 1
                user = (
                    prompt.render(**variables)
                    + "\n\nYour previous reply was rejected:\n"
                    + str(e)[:1500]
                    + "\nReply again with only the corrected JSON object."
                )
        record = CallRecord(
            prompt=prompt.key,
            feature=prompt.feature,
            model=served_by,
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            cost_usd=cost_usd(served_by, tokens_in, tokens_out),
            seconds=round(time.monotonic() - started, 3),
            repairs=repairs,
            tags=tags or {},
        )
        self.records.append(record)
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(record)) + "\n")
        return output
