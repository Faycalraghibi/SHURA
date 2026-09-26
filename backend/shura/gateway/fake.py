from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from .core import RawResult

Responder = Callable[[str, str], dict[str, Any] | str]


class FakeClient:
    """Deterministic stand-in for a model, keyed by output schema name.

    Used by tests and offline dry runs. Each responder gets (system, user) and returns either a dict
    (sent as JSON) or a raw string (to test parsing and repair).
    """

    def __init__(self, responders: dict[str, Responder | dict[str, Any]]):
        self.responders = responders
        self.calls: list[tuple[str, str, str]] = []

    def complete(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int,
        json_schema: dict[str, Any],
        schema_name: str,
    ) -> RawResult:
        self.calls.append((schema_name, system, user))
        responder = self.responders[schema_name]
        data = responder(system, user) if callable(responder) else responder
        text = data if isinstance(data, str) else json.dumps(data)
        return RawResult(text=text, model=model, input_tokens=len(system + user) // 4, output_tokens=len(text) // 4)
