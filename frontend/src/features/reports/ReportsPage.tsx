import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CategoryChip, PriorityTag, SeverityIndicator } from "../../components/app/badges";
import { useCurrentRepoId } from "../../components/app/AppShell";
import { EmptyState, ErrorState, PageHeader } from "../../components/app/states";
import { Select, SegmentedControl, Skeleton } from "../../components/ui/primitives";
import { api } from "../../lib/api";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, SEVERITIES, capitalize } from "../../lib/format";

type Range = "7d" | "30d" | "all";

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: number; color: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-lg border border-border p-4" aria-label={title}>
      <h2 className="text-[13px] font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-[12px]">
            <span className="text-muted">{r.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(r.value / max) * 100}%`, background: r.color, opacity: 0.75 }}
              />
            </span>
            <span className="text-right font-medium tnum">{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const CAT_COLOR: Record<string, string> = {
  bug: "var(--cat-bug-fg)",
  feature_request: "var(--cat-feature-fg)",
  documentation: "var(--cat-docs-fg)",
  question: "var(--cat-question-fg)",
  maintenance: "var(--cat-maint-fg)",
};

export function ReportsPage() {
  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos });
  const [storedRepo, setStoredRepo] = useCurrentRepoId();
  const [range, setRange] = useState<Range>("all");
  const repoId = storedRepo ?? repos.data?.[0]?.id ?? null;
  const from = useMemo(() => {
    if (range === "all") return undefined;
    const days = range === "7d" ? 7 : 30;
    return new Date(Date.now() - days * 86400_000).toISOString();
  }, [range]);
  const report = useQuery({
    queryKey: ["report", repoId, from],
    queryFn: () => api.report(repoId!, from),
    enabled: repoId !== null,
  });

  if (repos.data && !repos.data.length) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <PageHeader title="Reports" />
        <EmptyState icon={BarChart3} title="Connect a repository to see reports." />
      </div>
    );
  }

  const s = report.data;
  const stats = s
    ? [
        ["Issues analyzed", s.totals.issues_analyzed],
        ["AI analyses", s.totals.analyses_ai],
        ["Heuristic analyses", s.totals.analyses_heuristic],
        ["Failed", s.totals.analyses_failed],
        ["Approved", s.proposals.approved],
        ["Rejected", s.proposals.rejected],
        ["Applied", s.proposals.applied],
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        title="Reports"
        description="Built from stored analyses; the latest successful analysis per issue is counted."
        actions={
          repoId ? (
            <div className="flex gap-2">
              <a
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-[13px] font-medium hover:border-border-strong"
                href={api.exportUrl(repoId, "md", from)}
                download
              >
                <Download size={14} aria-hidden /> Markdown
              </a>
              <a
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-[13px] font-medium hover:border-border-strong"
                href={api.exportUrl(repoId, "json", from)}
                download
              >
                <Download size={14} aria-hidden /> JSON
              </a>
            </div>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Repository"
          value={repoId ?? ""}
          onChange={(e) => setStoredRepo(Number(e.target.value))}
          className="font-mono text-[12px]"
        >
          {repos.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </Select>
        <SegmentedControl
          label="Date range"
          value={range}
          onChange={setRange}
          items={[
            { value: "7d", label: "7 days" },
            { value: "30d", label: "30 days" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {report.isLoading || !s ? (
        report.isError ? (
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        ) : (
          <Skeleton className="h-48" />
        )
      ) : (
        <>
          <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-lg border border-border px-4 py-3">
            {stats.map(([label, value]) => (
              <div key={label as string}>
                <dd className="text-[20px] leading-7 font-semibold tnum">{value}</dd>
                <dt className="text-[12px] text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          {s.totals.issues_analyzed === 0 ? (
            <EmptyState icon={BarChart3} title="No analyses in this range yet.">
              Analyze issues from the inbox to populate this report.
            </EmptyState>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Distribution
                  title="By category"
                  rows={CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c], value: s.by_category[c], color: CAT_COLOR[c] }))}
                />
                <Distribution
                  title="By severity"
                  rows={SEVERITIES.map((v) => ({ key: v, label: capitalize(v), value: s.by_severity[v], color: `var(--sev-${v})` }))}
                />
                <Distribution
                  title="By priority"
                  rows={PRIORITIES.map((p) => ({ key: p, label: p, value: s.by_priority[p], color: "var(--accent)" }))}
                />
              </div>
              <section className="rounded-lg border border-border">
                <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold">Needs attention (P0/P1)</h2>
                {s.needs_attention.length ? (
                  <ul className="divide-y divide-border">
                    {s.needs_attention.map((i) => (
                      <li key={i.number} className="flex flex-wrap items-center gap-3 px-4 py-2">
                        <Link to={`/repos/${repoId}/issues/${i.number}`} className="font-mono text-[12px] text-accent-text hover:underline">
                          #{i.number}
                        </Link>
                        <span className="min-w-0 flex-1 truncate">{i.title}</span>
                        <CategoryChip category={i.category} />
                        <SeverityIndicator severity={i.severity} />
                        <PriorityTag priority={i.priority} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-muted">No P0 or P1 issues.</p>
                )}
              </section>
              <section className="rounded-lg border border-border">
                <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold">Likely duplicate pairs</h2>
                {s.likely_duplicate_pairs.length ? (
                  <ul className="divide-y divide-border">
                    {s.likely_duplicate_pairs.map((p) => (
                      <li key={`${p.a}-${p.b}`} className="px-4 py-2 font-mono text-[12px]">
                        #{p.a} and #{p.b} <span className="font-sans text-subtle">· lexical similarity {p.similarity.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-muted">None above the likely-duplicate threshold.</p>
                )}
              </section>
            </>
          )}
          <p className="text-[12px] text-subtle">{s.disclaimer}</p>
        </>
      )}
    </div>
  );
}
