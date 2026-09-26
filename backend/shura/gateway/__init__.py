"""LLM gateway: the only path from SHURA code to a model.

Every prompt is versioned, every output is validated against a pydantic schema, and every call is
logged with its token usage and cost, per feature. Nothing in `shura.format`, `shura.validate` or
(later) the rank arbiter may import this package.
"""

from .core import (
    CallRecord,
    Gateway,
    GatewayError,
    LLMClient,
    ModelRefused,
    Prompt,
    RawResult,
    data_block,
    extract_json,
)
from .fake import FakeClient

__all__ = [
    "CallRecord",
    "FakeClient",
    "Gateway",
    "GatewayError",
    "LLMClient",
    "ModelRefused",
    "Prompt",
    "RawResult",
    "data_block",
    "extract_json",
]
