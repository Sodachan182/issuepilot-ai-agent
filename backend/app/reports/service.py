"""Reports built only from stored analyses (latest successful analysis per issue)."""

from __future__ import annotations

from collections import Counter
from datetime import datetime

from sqlmodel import Session, select

from app.models import ActionProposal, IssueAnalysis, IssueSnapshot, Repository, iso_utc, utcnow
from app.schemas.triage import CATEGORIES, CATEGORY_DISPLAY, PRIORITIES, SEVERITIES

DISCLAIMER = "Counts reflect IssuePilot suggestions, not verified ground truth."


def build_summary(
    session: Session, repo: Repository, start: datetime | None, end: datetime | None
) -> dict:
    issues = {
        i.id: i
        for i in session.exec(select(IssueSnapshot).where(IssueSnapshot.repository_id == repo.id))
    }
    analyses = session.exec(
        select(IssueAnalysis)
        .where(IssueAnalysis.issue_id.in_(list(issues) or [-1]))  # type: ignore[attr-defined]
        .order_by(IssueAnalysis.id)  # type: ignore[arg-type]
    ).all()
    if start:
        analyses = [a for a in analyses if a.created_at >= start]
    if end:
        analyses = [a for a in analyses if a.created_at <= end]

    latest: dict[int, IssueAnalysis] = {}
    failed = 0
    for a in analyses:
        if a.status == "succeeded":
            latest[a.issue_id] = a
        else:
            failed += 1
    by_category = Counter(a.category for a in latest.values())
    by_severity = Counter(a.severity for a in latest.values())
    by_priority = Counter(a.priority for a in latest.values())

    proposals = session.exec(
        select(ActionProposal).where(ActionProposal.repository_id == repo.id)
    ).all()
    if start:
        proposals = [p for p in proposals if p.created_at >= start]
    if end:
        proposals = [p for p in proposals if p.created_at <= end]
    p_counts = Counter(p.status for p in proposals)

    pairs: dict[tuple[int, int], float] = {}
    for a in latest.values():
        issue = issues[a.issue_id]
        for d in a.duplicates:
            if d.get("verdict") == "likely_duplicate":
                key = tuple(sorted((issue.number, int(d["number"]))))
                pairs[key] = max(pairs.get(key, 0.0), float(d.get("similarity", 0)))  # type: ignore[index]

    attention = []
    for a in latest.values():
        if a.priority in ("P0", "P1"):
            i = issues[a.issue_id]
            attention.append(
                {
                    "number": i.number,
                    "title": i.title,
                    "priority": a.priority,
                    "severity": a.severity,
                    "category": a.category,
                    "html_url": i.html_url,
                }
            )
    attention.sort(key=lambda x: (x["priority"], x["number"]))

    return {
        "repository": repo.full_name,
        "range": {
            "from": iso_utc(start),
            "to": iso_utc(end),
        },
        "generated_at": iso_utc(utcnow()),
        "totals": {
            "issues_cached": len(issues),
            "issues_analyzed": len(latest),
            "analyses_ai": sum(1 for a in latest.values() if a.mode == "ai"),
            "analyses_heuristic": sum(1 for a in latest.values() if a.mode == "heuristic"),
            "analyses_failed": failed,
        },
        "by_category": {c: by_category.get(c, 0) for c in CATEGORIES},
        "by_severity": {s: by_severity.get(s, 0) for s in SEVERITIES},
        "by_priority": {p: by_priority.get(p, 0) for p in PRIORITIES},
        "proposals": {
            s: p_counts.get(s, 0) for s in ("proposed", "approved", "rejected", "applied", "failed")
        },
        "likely_duplicate_pairs": [
            {"a": a, "b": b, "similarity": round(sim, 3)}
            for (a, b), sim in sorted(pairs.items(), key=lambda x: -x[1])
        ],
        "needs_attention": attention,
        "disclaimer": DISCLAIMER,
    }


def render_markdown(summary: dict) -> str:
    t = summary["totals"]
    lines = [
        f"# IssuePilot triage report: {summary['repository']}",
        "",
        f"Generated {summary['generated_at']}",
        "",
        f"> {summary['disclaimer']}",
        "",
        "## Totals",
        "",
        "| Metric | Count |",
        "|---|---|",
        f"| Issues cached | {t['issues_cached']} |",
        f"| Issues analyzed | {t['issues_analyzed']} |",
        f"| AI analyses | {t['analyses_ai']} |",
        f"| Heuristic (rule-based) analyses | {t['analyses_heuristic']} |",
        f"| Failed analyses | {t['analyses_failed']} |",
        "",
    ]
    for title, key, names in (
        ("Category", "by_category", {c: CATEGORY_DISPLAY[c] for c in CATEGORIES}),
        ("Severity", "by_severity", {s: s.capitalize() for s in SEVERITIES}),
        ("Priority", "by_priority", {p: p for p in PRIORITIES}),
    ):
        lines += [f"## By {title.lower()}", "", f"| {title} | Count |", "|---|---|"]
        lines += [f"| {names[k]} | {v} |" for k, v in summary[key].items()]
        lines.append("")
    lines += ["## Proposals", "", "| Status | Count |", "|---|---|"]
    lines += [f"| {k.capitalize()} | {v} |" for k, v in summary["proposals"].items()]
    lines += ["", "## Needs attention (P0/P1)", ""]
    if summary["needs_attention"]:
        lines += ["| # | Title | Priority | Severity |", "|---|---|---|---|"]
        for i in summary["needs_attention"]:
            title = i["title"].replace("|", "\\|")
            lines.append(f"| #{i['number']} | {title} | {i['priority']} | {i['severity']} |")
    else:
        lines.append("None.")
    lines += ["", "## Likely duplicate pairs", ""]
    if summary["likely_duplicate_pairs"]:
        lines += [
            f"- #{p['a']} and #{p['b']} (lexical similarity {p['similarity']:.2f})"
            for p in summary["likely_duplicate_pairs"]
        ]
    else:
        lines.append("None.")
    return "\n".join(lines) + "\n"
