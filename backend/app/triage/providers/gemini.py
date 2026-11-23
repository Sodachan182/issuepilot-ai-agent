"""Gemini provider using the official google-genai SDK with structured JSON output."""

from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import Settings
from app.schemas.triage import ProviderResult, TriageInput, triage_json_schema
from app.triage.providers.base import (
    ProviderError,
    build_user_content,
    call_with_retry,
    system_prompt,
)


def _map_error(exc: Exception) -> ProviderError:
    from google.genai import errors as genai_errors

    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, httpx.TimeoutException | TimeoutError):
        return ProviderError("timeout", "Gemini request timed out")
    if isinstance(exc, genai_errors.APIError):
        code = getattr(exc, "code", None)
        if code in (401, 403):
            return ProviderError("auth", "Gemini rejected the API key (check GEMINI_API_KEY)")
        if code == 429:
            return ProviderError("rate_limited", "Gemini rate limit or quota exceeded")
        if code == 404:
            return ProviderError("unknown", "Gemini model not found (check GEMINI_MODEL)")
        return ProviderError("unknown", f"Gemini API error (HTTP {code})")
    return ProviderError("unknown", f"Gemini call failed ({type(exc).__name__})")


class GeminiProvider:
    name = "gemini"
    mode = "ai"

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.settings = settings
        self.model = settings.gemini_model or None
        self.label = "Gemini"
        self._client = client

    def is_configured(self) -> bool:
        return bool(self.settings.gemini_key_value and self.settings.gemini_model)

    def _get_client(self) -> Any:
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(
                api_key=self.settings.gemini_key_value,
                http_options=types.HttpOptions(
                    timeout=int(self.settings.ai_timeout_seconds * 1000)
                ),
            )
        return self._client

    def _config(self) -> Any:
        from google.genai import types

        return types.GenerateContentConfig(
            system_instruction=system_prompt(),
            response_mime_type="application/json",
            response_json_schema=triage_json_schema(),
            temperature=0.2,
        )

    def analyze(self, inp: TriageInput) -> ProviderResult:
        if not self.is_configured():
            raise ProviderError("not_configured", "Set GEMINI_API_KEY and GEMINI_MODEL in .env")
        client = self._get_client()
        usage = {"in": 0, "out": 0, "seen": False}

        def call(content: str) -> str:
            try:
                response = client.models.generate_content(
                    model=self.settings.gemini_model, contents=content, config=self._config()
                )
            except Exception as exc:  # noqa: BLE001 - mapped to safe codes
                raise _map_error(exc) from exc
            meta = getattr(response, "usage_metadata", None)
            if meta is not None:
                usage["seen"] = True
                usage["in"] += getattr(meta, "prompt_token_count", 0) or 0
                usage["out"] += getattr(meta, "candidates_token_count", 0) or 0
            text = getattr(response, "text", None)
            if not text:
                feedback = getattr(response, "prompt_feedback", None)
                if feedback is not None and getattr(feedback, "block_reason", None):
                    raise ProviderError("blocked", "Gemini blocked this request (safety filter)")
                return ""
            return text

        started = time.perf_counter()
        triage, _attempts = call_with_retry(call, build_user_content(inp))
        return ProviderResult(
            triage=triage,
            mode="ai",
            provider=self.name,
            provider_label=self.label,
            model=self.settings.gemini_model,
            latency_ms=int((time.perf_counter() - started) * 1000),
            input_tokens=usage["in"] if usage["seen"] else None,
            output_tokens=usage["out"] if usage["seen"] else None,
        )

    def health_check(self) -> tuple[bool, str]:
        if not self.is_configured():
            return False, "GEMINI_API_KEY or GEMINI_MODEL is not set"
        try:
            response = self._get_client().models.generate_content(
                model=self.settings.gemini_model, contents="Reply with the single word: ok"
            )
            return True, f"Gemini responded ({(response.text or '').strip()[:20]})"
        except Exception as exc:  # noqa: BLE001
            return False, _map_error(exc).message
