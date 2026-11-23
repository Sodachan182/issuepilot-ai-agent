"""Application error type mapped to the JSON error envelope."""

from __future__ import annotations


class AppError(Exception):
    def __init__(
        self, code: str, message: str, status_code: int = 400, details: dict | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


def not_found(what: str) -> AppError:
    return AppError("NOT_FOUND", f"{what} not found", 404)


def invalid_state(message: str) -> AppError:
    return AppError("INVALID_STATE", message, 409)
