from __future__ import annotations

from app.config import Settings
from app.triage.providers.gemini import GeminiProvider
from app.triage.providers.heuristic import HeuristicProvider
from app.triage.providers.openai_compat import OpenAICompatibleProvider

# Tests can register a provider instance here to replace the configured one.
_override = None


def set_provider_override(provider) -> None:  # noqa: ANN001
    global _override
    _override = provider


def get_provider(settings: Settings):  # noqa: ANN201
    """Return the configured provider. Never silently substitutes the heuristic engine."""
    if _override is not None:
        return _override
    choice = (settings.ai_provider or "heuristic").strip().lower()
    if choice == "gemini":
        return GeminiProvider(settings)
    if choice in ("openai_compatible", "openai-compatible", "shopaikey"):
        return OpenAICompatibleProvider(settings)
    return HeuristicProvider(settings)
