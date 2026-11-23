"""Agreement on the synthetic, self-authored demo dataset.

Usage (from the repo root, with the backend venv):
    backend/.venv/Scripts/python eval/run_eval.py --provider heuristic
    backend/.venv/Scripts/python eval/run_eval.py --provider gemini      # needs GEMINI_API_KEY

Writes eval/results/<date>-<provider>-<model>.md. These numbers measure consistency with labels
written by the same project that wrote the issues. They are NOT a real-world accuracy benchmark.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from collections import Counter
from datetime import date
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import Settings, override_settings  # noqa: E402
from app.db import get_engine, init_db, reset_engine  # noqa: E402
from app.demo.seed import seed_demo  # noqa: E402
from app.models import IssueSnapshot  # noqa: E402
from app.schemas.triage import CATEGORIES, SEVERITIES  # noqa: E402
from app.triage.providers.factory import get_provider  # noqa: E402
from app.triage.service import analyze_issue, build_index  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

CAVEAT = (
    "> Synthetic, self-authored dataset (n = {n}). The expected labels were written by the same "
    "project that wrote the issues, so these numbers show consistency on this data and are "
    "**not** a benchmark of real-world accuracy."
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default="heuristic")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    labels = json.loads((ROOT / "eval" / "labels_synthetic.json").read_text(encoding="utf-8"))
    expected = {row["number"]: row for row in labels}

    with tempfile.TemporaryDirectory() as tmp:
        base = Settings()
        settings = base.model_copy(
            update={
                "database_url": f"sqlite:///{Path(tmp, 'eval.db').as_posix()}",
                "ai_provider": args.provider,
            }
        )
        override_settings(settings)
        reset_engine()
        init_db()
        provider = get_provider(settings)
        if not provider.is_configured():
            print(f"Provider {args.provider} is not configured (check .env).")
            return 2
        rows = []
        with Session(get_engine()) as session:
            repo, _ = seed_demo(session)
            issues = session.exec(
                select(IssueSnapshot).where(IssueSnapshot.repository_id == repo.id)
            ).all()
            issues = sorted(issues, key=lambda i: i.number)
            if args.limit:
                issues = issues[: args.limit]
            index = build_index(session, repo.id)
            for issue in issues:
                a = analyze_issue(session, repo, issue, provider, settings, index=index)
                rows.append(
                    (
                        SimpleNamespace(number=issue.number, title=issue.title),
                        SimpleNamespace(
                            status=a.status,
                            error=a.error,
                            category=a.category,
                            severity=a.severity,
                            duplicates=list(a.duplicates),
                        ),
                    )
                )
        reset_engine()
        override_settings(None)

    n = len(rows)
    ok = [(i, a) for i, a in rows if a.status == "succeeded"]
    cat_hits = sum(1 for i, a in ok if a.category == expected[i.number]["expected_category"])
    sev_hits = sum(1 for i, a in ok if a.severity == expected[i.number]["expected_severity"])
    sev_near = sum(
        1
        for i, a in ok
        if abs(
            SEVERITIES.index(a.severity) - SEVERITIES.index(expected[i.number]["expected_severity"])
        )
        <= 1
    )
    pairs = [(num, row["duplicate_of"]) for num, row in expected.items() if row["duplicate_of"]]
    found = {i.number: [d["number"] for d in a.duplicates] for i, a in ok}
    dup_hits = sum(1 for num, other in pairs if other in found.get(num, []))
    confusion = Counter((expected[i.number]["expected_category"], a.category) for i, a in ok)
    model = provider.model or "rules"

    lines = [
        f"# Evaluation: {provider.label} ({model})",
        "",
        f"Date: {date.today().isoformat()} · Mode: {provider.mode} · Prompt/rules: "
        f"{'triage_v1' if provider.mode == 'ai' else 'heuristic_v1'}",
        "",
        CAVEAT.format(n=n),
        "",
        "| Metric | Result |",
        "|---|---|",
        f"| Analyses succeeded | {len(ok)}/{n} |",
        f"| Category agreement | {cat_hits}/{len(ok)} |",
        f"| Severity agreement (exact) | {sev_hits}/{len(ok)} |",
        f"| Severity within one level | {sev_near}/{len(ok)} |",
        f"| Authored duplicate pairs found as candidates | {dup_hits}/{len(pairs)} |",
        "",
        "## Category confusion (rows = expected, columns = predicted)",
        "",
        "| expected \\ predicted | " + " | ".join(CATEGORIES) + " |",
        "|---|" + "---|" * len(CATEGORIES),
    ]
    for exp in CATEGORIES:
        lines.append(
            f"| {exp} | " + " | ".join(str(confusion.get((exp, p), 0)) for p in CATEGORIES) + " |"
        )
    lines += ["", "## Disagreements", ""]
    for i, a in rows:
        e = expected[i.number]
        if a.status != "succeeded":
            lines.append(f"- #{i.number}: analysis failed ({a.error})")
        elif a.category != e["expected_category"] or a.severity != e["expected_severity"]:
            lines.append(
                f"- #{i.number} {i.title}: predicted {a.category}/{a.severity}, "
                f"expected {e['expected_category']}/{e['expected_severity']}"
            )
    out_dir = ROOT / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_model = model.replace("/", "_")
    out = out_dir / f"{date.today().isoformat()}-{provider.name}-{safe_model}.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:15]))
    print(f"\nWrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
