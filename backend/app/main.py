"""FastAPI application factory."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.audit import RedactingFilter
from app.config import get_settings
from app.db import init_db, new_session
from app.errors import AppError
from app.github.errors import GitHubAuthError, GitHubError, GitHubNotFound, GitHubRateLimited
from app.models import iso_utc
from app.triage.providers.base import ProviderError

log = logging.getLogger("issuepilot")


def _envelope(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


def _configure_logging() -> None:
    root = logging.getLogger()
    if not any(isinstance(f, RedactingFilter) for f in root.filters):
        root.addFilter(RedactingFilter())
    for handler in root.handlers:
        if not any(isinstance(f, RedactingFilter) for f in handler.filters):
            handler.addFilter(RedactingFilter())


@asynccontextmanager
async def lifespan(_: FastAPI):  # noqa: ANN201
    from app.triage.service import mark_interrupted_runs

    _configure_logging()
    init_db()
    with new_session() as session:
        mark_interrupted_runs(session)
    yield


def create_app() -> FastAPI:
    from app.api import proposals, repos, system

    settings = get_settings()
    app = FastAPI(title="IssuePilot API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return _envelope(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(GitHubRateLimited)
    async def _rate(_: Request, exc: GitHubRateLimited) -> JSONResponse:
        reset = iso_utc(exc.reset_at)
        return _envelope(
            429, "GITHUB_RATE_LIMITED", "GitHub rate limit reached", {"reset_at": reset}
        )

    @app.exception_handler(GitHubNotFound)
    async def _gh404(_: Request, exc: GitHubNotFound) -> JSONResponse:
        return _envelope(404, "GITHUB_NOT_FOUND", "Repository or issue not found or not accessible")

    @app.exception_handler(GitHubAuthError)
    async def _ghauth(_: Request, exc: GitHubAuthError) -> JSONResponse:
        return _envelope(401, "GITHUB_AUTH_ERROR", str(exc))

    @app.exception_handler(GitHubError)
    async def _gh(_: Request, exc: GitHubError) -> JSONResponse:
        return _envelope(502, "GITHUB_ERROR", str(exc))

    @app.exception_handler(ProviderError)
    async def _provider(_: Request, exc: ProviderError) -> JSONResponse:
        return _envelope(502, "PROVIDER_ERROR", exc.message, {"code": exc.code})

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": [str(x) for x in e.get("loc", ())], "msg": e.get("msg", "")}
            for e in exc.errors()
        ]
        return _envelope(422, "VALIDATION_ERROR", "Invalid request", {"errors": errors})

    for module in (system, repos, proposals):
        app.include_router(module.router, prefix="/api")
    return app


app = create_app()
