"""OpenAI-compatible provider (e.g. the ShopAIKey gateway) via the official openai SDK."""

from __future__ import annotations

import time
from typing import Any

from app.config import Settings
from app.schemas.triage import ProviderResult, TriageInput, triage_json_schema
from app.triage.providers.base import (
    ProviderError,
    build_user_content,
    call_with_retry,
    system_prompt,
)


def _map_error(exc: Exception) -> ProviderError:
    import openai

    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, openai.APITimeoutError):
        return ProviderError("timeout", "The AI gateway timed out")
    if isinstance(exc, openai.AuthenticationError | openai.PermissionDeniedError):
        return ProviderError("auth", "The AI gateway rejected the API key")
    if isinstance(exc, openai.RateLimitError):
        return ProviderError("rate_limited", "The AI gateway rate limit or quota was exceeded")
    if isinstance(exc, openai.APIStatusError):
        return ProviderError("unknown", f"AI gateway error (HTTP {exc.status_code})")
    if isinstance(exc, openai.APIConnectionError):
        return ProviderError("unknown", "Could not reach the AI gateway (check base URL)")
    return ProviderError("unknown", f"AI gateway call failed ({type(exc).__name__})")


class OpenAICompatibleProvider:
    name = "openai_compatible"
    mode = "ai"

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.settings = settings
        self.model = settings.openai_compat_model or None
        self.label = settings.openai_compat_provider_name or "OpenAI-compatible"
        self._client = client
        self._json_mode = True

    def is_configured(self) -> bool:
        s = self.settings
        return bool(
            s.openai_compat_key_value and s.openai_compat_base_url and s.openai_compat_model
        )

    def _get_client(self) -> Any:
        if self._client is None:
            import openai

            self._client = openai.OpenAI(
                api_key=self.settings.openai_compat_key_value,
                base_url=self.settings.openai_compat_base_url,
                timeout=self.settings.ai_timeout_seconds,
                max_retries=1,
            )
        return self._client

    def analyze(self, inp: TriageInput) -> ProviderResult:
        import openai

        if not self.is_configured():
            raise ProviderError(
                "not_configured",
                "Set OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_MODEL",
            )
        client = self._get_client()
        usage = {"in": 0, "out": 0, "seen": False}
        schema_hint = "\n\nThe JSON object must follow this JSON schema:\n" + __import__(
            "json"
        ).dumps(triage_json_schema())
        system = system_prompt() + schema_hint

        def call(content: str) -> str:
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ]
            kwargs: dict[str, Any] = {
                "model": self.settings.openai_compat_model,
                "messages": messages,
                "temperature": 0.2,
            }
            if self._json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            try:
                response = client.chat.completions.create(**kwargs)
            except openai.BadRequestError as exc:
                if not self._json_mode:
                    raise _map_error(exc) from exc
                # Gateway may not support response_format: retry once without it.
                self._json_mode = False
                kwargs.pop("response_format", None)
                try:
                    response = client.chat.completions.create(**kwargs)
                except Exception as exc2:  # noqa: BLE001
                    raise _map_error(exc2) from exc2
            except Exception as exc:  # noqa: BLE001
                raise _map_error(exc) from exc
            if getattr(response, "usage", None) is not None:
                usage["seen"] = True
                usage["in"] += getattr(response.usage, "prompt_tokens", 0) or 0
                usage["out"] += getattr(response.usage, "completion_tokens", 0) or 0
            choice = response.choices[0] if response.choices else None
            return (choice.message.content or "") if choice else ""

        started = time.perf_counter()
        triage, _ = call_with_retry(call, build_user_content(inp))
        return ProviderResult(
            triage=triage,
            mode="ai",
            provider=self.name,
            provider_label=self.label,
            model=self.settings.openai_compat_model,
            latency_ms=int((time.perf_counter() - started) * 1000),
            input_tokens=usage["in"] if usage["seen"] else None,
            output_tokens=usage["out"] if usage["seen"] else None,
        )

    def health_check(self) -> tuple[bool, str]:
        if not self.is_configured():
            return False, "OpenAI-compatible provider is not fully configured"
        try:
            response = self._get_client().chat.completions.create(
                model=self.settings.openai_compat_model,
                messages=[{"role": "user", "content": "Reply with the single word: ok"}],
                max_tokens=5,
            )
            text = response.choices[0].message.content if response.choices else ""
            return True, f"{self.label} responded ({(text or '').strip()[:20]})"
        except Exception as exc:  # noqa: BLE001
            return False, _map_error(exc).message
