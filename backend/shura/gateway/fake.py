from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from pydantic import BaseModel

from .core import LLMResult

T = TypeVar("T", bound=BaseModel)

Responder = Callable[[str, str], dict[str, Any]]


class FakeClient:
    """Deterministic stand-in for a model, keyed by output schema name.

    Used by tests and by offline Forge dry runs. Each responder gets (system, user) and returns a
    dict that must validate against the schema.
    """

    def __init__(self, responders: dict[str, Responder | dict[str, Any]]):
        self.responders = responders
        self.calls: list[tuple[str, str, str]] = []

    def complete(self, *, model: str, system: str, user: str, schema: type[T], max_tokens: int) -> LLMResult:
        self.calls.append((schema.__name__, system, user))
        responder = self.responders[schema.__name__]
        data = responder(system, user) if callable(responder) else responder
        output = schema.model_validate(data)
        return LLMResult(output=output, model=model, input_tokens=len(system + user) // 4, output_tokens=len(str(data)) // 4)
