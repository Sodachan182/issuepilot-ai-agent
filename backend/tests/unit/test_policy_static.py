"""T-POL-*: write policy, and T-APP-16: static safety check of write call sites."""

import ast
from pathlib import Path

import pytest

from app.actions.policy import evaluate_write_policy
from app.config import Settings
from app.models import ActionProposal, Repository

APP_DIR = Path(__file__).resolve().parents[2] / "app"


def settings(**kw) -> Settings:
    values = {
        "github_token": "tok",
        "github_write_enabled": True,
        "write_allowed_repos": "octo/lib",
    }
    values.update(kw)
    return Settings(_env_file=None, **values)


def repo(**kw) -> Repository:
    values = {
        "owner": "octo",
        "name": "lib",
        "full_name": "octo/lib",
        "full_name_key": "octo/lib",
        "is_demo": False,
        "has_push_permission": True,
    }
    values.update(kw)
    return Repository(**values)


def proposal(status: str = "approved") -> ActionProposal:
    return ActionProposal(
        analysis_id=1, issue_id=1, repository_id=1, type="add_labels", status=status
    )


def codes(s=None, r=None, p=None, **kw):
    return evaluate_write_policy(
        s or settings(), r or repo(), p or proposal(), issue_number=142, **kw
    ).codes


def test_all_conditions_allowed():  # T-POL-01
    assert codes(confirm="octo/lib#142", check_confirmation=True) == []


def test_write_disabled():  # T-POL-02
    assert "WRITE_DISABLED" in codes(settings(github_write_enabled=False))


def test_no_token():  # T-POL-03
    assert "NO_TOKEN" in codes(settings(github_token=None))


@pytest.mark.parametrize("allow", ["", "octo/other", "octo/lib2", "octo/*", "*"])
def test_not_allowlisted(allow):  # T-POL-04, T-POL-10
    assert "REPO_NOT_ALLOWLISTED" in codes(settings(write_allowed_repos=allow))


def test_allowlist_case_and_whitespace_insensitive():  # T-POL-04
    assert codes(settings(write_allowed_repos=" OCTO/Lib , x/y ")) == []


def test_no_push_permission():  # T-POL-05
    assert "NO_PUSH_PERMISSION" in codes(r=repo(has_push_permission=False))
    assert "NO_PUSH_PERMISSION" in codes(r=repo(has_push_permission=None))


def test_demo_repo_blocked_even_when_everything_enabled():  # T-POL-06
    demo = repo(is_demo=True, full_name="octo/lib", full_name_key="octo/lib")
    assert "DEMO_REPO" in codes(r=demo)


@pytest.mark.parametrize(
    ("status", "code"),
    [
        ("proposed", "PROPOSAL_NOT_APPROVED"),
        ("rejected", "PROPOSAL_NOT_APPROVED"),
        ("applied", "ALREADY_APPLIED"),
    ],
)
def test_proposal_status(status, code):  # T-POL-07
    assert code in codes(p=proposal(status))


@pytest.mark.parametrize(
    "confirm", ["octo/lib#14", " octo/lib#142", "octo/lib#142 ", "other/lib#142", ""]
)
def test_confirmation_mismatch(confirm):  # T-POL-08
    assert "CONFIRMATION_MISMATCH" in codes(confirm=confirm, check_confirmation=True)


def test_all_reasons_collected():  # T-POL-09
    result = codes(
        settings(github_token=None, github_write_enabled=False, write_allowed_repos=""),
        p=proposal("proposed"),
    )
    assert {"WRITE_DISABLED", "NO_TOKEN", "REPO_NOT_ALLOWLISTED", "PROPOSAL_NOT_APPROVED"} <= set(
        result
    )


def _calls_to(name: str) -> list[Path]:
    hits = []
    for path in APP_DIR.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == name
            ):
                hits.append(path.relative_to(APP_DIR))
    return hits


def test_only_actions_service_calls_write_methods():  # T-APP-16
    for method in ("add_labels", "create_comment"):
        assert {str(p).replace("\\", "/") for p in _calls_to(method)} == {"actions/service.py"}


def test_no_destructive_github_operations_exist():  # T-APP-16
    source = (APP_DIR / "github" / "client.py").read_text(encoding="utf-8")
    assert '"PATCH"' not in source and '"DELETE"' not in source and '"PUT"' not in source
    for forbidden in (
        "def close_issue",
        "def edit_issue",
        "def remove_label",
        "def create_label",
        "def lock",
    ):
        assert forbidden not in source
