"""Map triage categories/severities onto labels that actually exist in a repository."""

from __future__ import annotations

CATEGORY_LABELS: dict[str, list[str]] = {
    "bug": ["bug", "type: bug", "type:bug", "kind/bug", "defect", "bug report", "t-bug"],
    "feature_request": [
        "enhancement",
        "feature",
        "feature request",
        "feature-request",
        "type: feature",
        "type:feature",
        "kind/feature",
        "type: enhancement",
    ],
    "documentation": [
        "documentation",
        "docs",
        "type: docs",
        "type:docs",
        "kind/documentation",
        "type: documentation",
    ],
    "question": ["question", "support", "type: question", "kind/question", "usage question"],
    "maintenance": [
        "maintenance",
        "chore",
        "refactor",
        "tech debt",
        "tech-debt",
        "type: maintenance",
        "dependencies",
    ],
}

SEVERITY_LABELS: dict[str, list[str]] = {
    "critical": ["priority:critical", "priority: critical", "severity:critical", "critical", "p0"],
    "high": ["priority:high", "priority: high", "severity:high", "high priority", "p1"],
    "low": ["priority:low", "priority: low", "severity:low", "low priority", "p3"],
}


def match_label(candidates: list[str], repo_labels: list[str]) -> str | None:
    lookup = {name.lower(): name for name in repo_labels}
    for cand in candidates:
        if cand.lower() in lookup:
            return lookup[cand.lower()]
    return None


def category_for_labels(labels: list[str]) -> str | None:
    lowered = {lbl.lower() for lbl in labels}
    for category, names in CATEGORY_LABELS.items():
        if lowered & set(names):
            return category
    return None


def suggest_labels(category: str, severity: str, repo_labels: list[str]) -> list[dict]:
    out: list[dict] = []
    cat = match_label(CATEGORY_LABELS.get(category, []), repo_labels)
    if cat:
        out.append({"name": cat, "reason": f"Matches the '{category}' category"})
    sev = match_label(SEVERITY_LABELS.get(severity, []), repo_labels)
    if sev:
        out.append({"name": sev, "reason": f"Matches {severity} severity"})
    return out
