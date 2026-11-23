"""Application settings loaded from environment variables / the repo-root .env file."""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB = (ROOT_DIR / "data" / "issuepilot.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # AI provider
    ai_provider: str = "heuristic"  # heuristic | gemini | openai_compatible
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.8-flash"
    openai_compat_api_key: SecretStr | None = None
    openai_compat_base_url: str = ""
    openai_compat_model: str = ""
    openai_compat_provider_name: str = "ShopAIKey"
    ai_timeout_seconds: float = 45
    ai_max_issue_chars: int = 12000
    ai_max_batch: int = 25

    # GitHub
    github_token: SecretStr | None = None
    github_api_base: str = "https://api.github.com"
    github_write_enabled: bool = False
    write_allowed_repos: str = ""
    max_sync_issues: int = 100

    # Duplicates
    dup_related_threshold: float = 0.35
    dup_likely_threshold: float = 0.60

    # App
    database_url: str = f"sqlite:///{DEFAULT_DB}"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    log_level: str = "INFO"

    @staticmethod
    def _secret(value: SecretStr | None) -> str | None:
        if value is None:
            return None
        raw = value.get_secret_value().strip()
        return raw or None

    @property
    def github_token_value(self) -> str | None:
        return self._secret(self.github_token)

    @property
    def gemini_key_value(self) -> str | None:
        return self._secret(self.gemini_api_key)

    @property
    def openai_compat_key_value(self) -> str | None:
        return self._secret(self.openai_compat_api_key)

    @property
    def allowed_repos(self) -> set[str]:
        return {r.strip().lower() for r in self.write_allowed_repos.split(",") if r.strip()}

    @property
    def allowed_repos_display(self) -> list[str]:
        return [r.strip() for r in self.write_allowed_repos.split(",") if r.strip()]

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def override_settings(settings: Settings | None) -> None:
    """Replace the process-wide settings (used by tests and the eval script)."""
    global _settings
    _settings = settings
