"""T-PARSE-*, T-LBL-*, T-RED-*."""

import logging

import pytest

from app.audit import RedactingFilter, redact, redact_text
from app.config import Settings
from app.github.parsing import parse_repo_input, repo_key
from app.triage.labels import match_label, suggest_labels


@pytest.mark.parametrize(
    "value",
    [
        "owner/repo",
        "https://github.com/owner/repo",
        "https://github.com/owner/repo.git",
        "https://github.com/owner/repo/issues/12",
        "github.com/owner/repo/",
        "  www.github.com/owner/repo  ",
    ],
)
def test_parse_valid_inputs(value):  # T-PARSE-01
    assert parse_repo_input(value) == ("owner", "repo")


@pytest.mark.parametrize(
    "value",
    [
        "owner",
        "https://gitlab.com/a/b",
        "a/b/c d",
        "",
        "x" * 201,
        "a/b/c",
        "-bad/repo",
        "own er/repo",
    ],
)
def test_parse_invalid_inputs(value):  # T-PARSE-02
    with pytest.raises(ValueError):
        parse_repo_input(value)


def test_parse_preserves_case_and_key_lowercases():  # T-PARSE-03
    assert parse_repo_input("Pallets/Flask") == ("Pallets", "Flask")
    assert repo_key("Pallets/Flask") == "pallets/flask"


def test_label_matching():  # T-LBL-01..03
    assert match_label(["bug", "type: bug"], ["Type: Bug", "docs"]) == "Type: Bug"
    assert suggest_labels("bug", "high", ["kind/bug", "priority:high"]) == [
        {"name": "kind/bug", "reason": "Matches the 'bug' category"},
        {"name": "priority:high", "reason": "Matches high severity"},
    ]
    assert suggest_labels("question", "low", ["bug"]) == []


# Fake secret-shaped values are assembled at runtime so the repository secret scan
# (scripts/check-secrets.*) and GitHub push protection never see literal tokens.
FAKE_GH = "ghp" + "_" + "x" * 36
FAKE_PAT = "github" + "_pat_" + "1" * 22
FAKE_GOOGLE = "AI" + "za" + "y" * 35
FAKE_SK = "sk" + "-" + "z" * 24


def test_redact_text_masks_secrets():  # T-RED-01
    text = (
        f"token {FAKE_GH} and {FAKE_PAT} and {FAKE_GOOGLE} and {FAKE_SK} "
        "Authorization: Bearer secretvalue123"
    )
    out = redact_text(text)
    for secret in (FAKE_GH, FAKE_PAT, FAKE_GOOGLE, FAKE_SK, "secretvalue123"):
        assert secret not in out


def test_logging_filter_redacts(caplog):  # T-RED-01
    logger = logging.getLogger("test.redact")
    logger.addFilter(RedactingFilter())
    with caplog.at_level(logging.INFO, logger="test.redact"):
        logger.info("calling with %s", FAKE_GH)
    assert FAKE_GH not in caplog.text
    assert "[REDACTED]" in caplog.text


def test_redact_drops_sensitive_keys_at_any_depth():  # T-RED-02
    data = {
        "ok": 1,
        "github_token": "x",
        "nested": [{"api_key": "y", "fine": "z"}],
        "Authorization": "b",
    }
    assert redact(data) == {"ok": 1, "nested": [{"fine": "z"}]}


def test_settings_never_reveal_secrets():  # T-RED-03
    s = Settings(_env_file=None, github_token="SENTINEL_GH_TOKEN", gemini_api_key="SENTINEL_GEMINI")
    assert "SENTINEL" not in repr(s)
    assert "SENTINEL" not in str(s.model_dump())
    assert s.github_token_value == "SENTINEL_GH_TOKEN"
    assert Settings(_env_file=None, github_token="  ").github_token_value is None
