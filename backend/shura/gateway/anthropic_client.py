from __future__ import annotations

from typing import TypeVar

import anthropic
from pydantic import BaseModel

from .core import GatewayError, LLMResult, ModelRefused

T = TypeVar("T", bound=BaseModel)


class AnthropicClient:
    """Claude through the official SDK, with structured (schema-constrained) outputs.

    Credentials resolve the SDK's usual way (ANTHROPIC_API_KEY or an `ant auth login` profile).
    """

    def __init__(self, client: anthropic.Anthropic | None = None, effort: str = "high"):
        self._client = client or anthropic.Anthropic()
        self._effort = effort

    def complete(self, *, model: str, system: str, user: str, schema: type[T], max_tokens: int) -> LLMResult:
        try:
            response = self._client.messages.parse(
                model=model,
                max_tokens=max_tokens,
                system=system,
                thinking={"type": "adaptive"},
                output_config={"effort": self._effort},
                messages=[{"role": "user", "content": user}],
                output_format=schema,
            )
        except anthropic.RateLimitError as e:
            raise GatewayError(f"rate limited: {e.message}") from e
        except anthropic.APIStatusError as e:
            raise GatewayError(f"API error {e.status_code}: {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise GatewayError("could not reach the Claude API") from e

        if response.stop_reason == "refusal":
            category = response.stop_details.category if response.stop_details else None
            raise ModelRefused(f"model declined the request (category: {category})")
        if response.stop_reason == "max_tokens":
            raise GatewayError("output hit max_tokens before completing the schema")
        if response.parsed_output is None:
            raise GatewayError("model returned no parsable output")
        return LLMResult(
            output=response.parsed_output,
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
