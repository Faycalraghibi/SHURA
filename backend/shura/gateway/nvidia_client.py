"""NVIDIA API (build.nvidia.com) through its OpenAI-compatible endpoint.

Needs NVIDIA_API_KEY (a free "nvapi-..." key). The free tier is rate limited, so the client retries
429s with backoff.
"""

from __future__ import annotations

import os
from typing import Any

import openai

from .core import GatewayError, ModelRefused, RawResult

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


class NvidiaClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, temperature: float = 0.3):
        key = api_key or os.environ.get("NVIDIA_API_KEY")
        if not key:
            raise GatewayError("NVIDIA_API_KEY is not set. Get a free key at build.nvidia.com.")
        self._client = openai.OpenAI(
            api_key=key,
            base_url=base_url or os.environ.get("NVIDIA_BASE_URL", NVIDIA_BASE_URL),
            max_retries=4,
            timeout=180.0,
        )
        self._temperature = temperature
        # Guided JSON decoding is supported by many NIM models; fall back to plain prompting if not.
        self._guided = os.environ.get("SHURA_GUIDED_JSON", "1") == "1"

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
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        try:
            try:
                response = self._client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=self._temperature,
                    extra_body={"nvext": {"guided_json": json_schema}} if self._guided else None,
                )
            except openai.BadRequestError:
                if not self._guided:
                    raise
                self._guided = False
                response = self._client.chat.completions.create(
                    model=model, messages=messages, max_tokens=max_tokens, temperature=self._temperature
                )
        except openai.AuthenticationError as e:
            raise GatewayError("NVIDIA rejected the API key") from e
        except openai.NotFoundError as e:
            raise GatewayError(f"model {model!r} is not available on this NVIDIA endpoint") from e
        except openai.RateLimitError as e:
            raise GatewayError("NVIDIA free-tier rate limit reached; try again in a minute") from e
        except openai.APIStatusError as e:
            raise GatewayError(f"NVIDIA API error {e.status_code}") from e
        except openai.APIConnectionError as e:
            raise GatewayError("could not reach the NVIDIA API") from e

        choice = response.choices[0]
        if choice.finish_reason == "content_filter":
            raise ModelRefused("the model declined the request")
        if choice.finish_reason == "length":
            raise GatewayError("the model's reply was cut off (max_tokens)")
        usage = response.usage
        return RawResult(
            text=choice.message.content or "",
            model=response.model or model,
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
        )
