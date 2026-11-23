import { useQuery } from "@tanstack/react-query";
import { ChevronRight, History } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ModeBadge, StatusTag } from "../../components/app/badges";
import { EmptyState, ErrorState, PageHeader } from "../../components/app/states";
import { Select, Skeleton, Tabs } from "../../components/ui/primitives";
import { api } from "../../lib/api";
import { CATEGORY_LABEL, absoluteTime, cn, formatDuration, relativeTime } from "../../lib/format";
import type { AuditEvent, Run } from "../../lib/types";

const EVENT_TYPES = [
  "repo_connected",
  "sync",
  "demo_seeded",
  "analysis_run_started",
  "analysis_completed",
  "analysis_failed",
  "proposal_edited",
  "proposal_approved",
  "proposal_rejected",
  "write_dry_run",
  "apply_blocked",
  "apply_succeeded",
  "apply_failed",
];

function eventTone(type: string): string {
  if (type === "apply_succeeded") return "text-success";
  if (type === "apply_failed" || type === "analysis_failed") return "text-danger";
  if (type === "apply_blocked") return "text-warning";
  if (type.startsWith("proposal_") || type === "write_dry_run") return "text-accent-text";
  return "text-muted";
}

function summarize(e: AuditEvent): string {
  const d = e.details as Record<string, unknown>;
  switch (e.event_type) {
    case "apply_blocked":
      return `Blocked: ${((d.reasons as string[]) ?? []).join(", ")}`;
    case "apply_succeeded":
      return `${d.type === "add_labels" ? "Labels added" : "Comment posted"}${d.github_ref ? ` · ${d.github_ref}` : ""}`;
    case "apply_failed":
      return String(d.error ?? "");
    case "write_dry_run":
      return `Dry run for ${d.type}`;
    case "analysis_completed":
      return `${d.mode === "ai" ? `AI · ${d.model}` : "Heuristic (rule-based)"}`;
    case "analysis_failed":
      return `Provider error: ${d.code}`;
    case "analysis_run_started":
      return `${d.total} issue(s) · ${d.provider}`;
    case "sync":
      return `${d.synced} synced · ${d.created} new · ${d.skipped_pull_requests} PRs skipped`;
    case "proposal_rejected":
      return d.reason ? `Reason: ${d.reason}` : String(d.type ?? "");
    case "demo_seeded":
      return `${d.issues} synthetic issues`;
    default:
      return String(d.type ?? d.full_name ?? "");
  }
}

function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({ queryKey: ["run", run.id], queryFn: () => api.run(run.id), enabled: open });
  return (
    <Fragment>
      <tr className="h-10 border-t border-border hover:bg-surface">
        <td className="pl-3">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Show issues in run ${run.id}`}
            onClick={() => setOpen((o) => !o)}
            className="flex size-6 items-center justify-center rounded hover:bg-surface-2"
          >
            <ChevronRight size={14} className={cn("transition-transform", open && "rotate-90")} aria-hidden />
          </button>
        </td>
        <td className="px-2 whitespace-nowrap text-muted" title={absoluteTime(run.started_at)}>
          {relativeTime(run.started_at)}
        </td>
        <td className="px-2 font-mono text-[12px]">{run.repository}</td>
        <td className="px-2">
          <ModeBadge mode={run.mode} model={run.model} providerLabel={run.provider_label} />
        </td>
        <td className="px-2 tnum">
          <span className="text-success">{run.succeeded} ✓</span>
          {run.failed ? <span className="ml-2 text-danger">{run.failed} ✗</span> : null}
          <span className="ml-2 text-subtle">of {run.total}</span>
        </td>
        <td className="px-2 text-muted tnum">{formatDuration(run.duration_ms)}</td>
        <td className="px-2 pr-3">
          <StatusTag status={run.status} />
        </td>
      </tr>
      {open ? (
        <tr className="border-t border-border bg-surface/60">
          <td colSpan={7} className="px-10 py-2">
            {detail.isLoading ? (
              <Skeleton className="h-5" />
            ) : (
              <ul className="space-y-1">
                {detail.data?.items?.map((it) => (
                  <li key={it.issue_id} className="flex items-center gap-3 text-[12px]">
                    <Link to={`/repos/${run.repository_id}/issues/${it.number}`} className="font-mono text-accent-text hover:underline">
                      #{it.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    <span className="text-muted">{it.category ? CATEGORY_LABEL[it.category] : ""}</span>
                    <StatusTag status={it.status === "succeeded" ? "completed" : it.status} />
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function HistoryPage() {
  const [tab, setTab] = useState<"runs" | "audit">("runs");
  const [eventType, setEventType] = useState("");
  const runs = useQuery({ queryKey: ["history", "runs"], queryFn: () => api.runs(), refetchInterval: 5000 });
  const audit = useQuery({
    queryKey: ["history", "audit", eventType],
    queryFn: () => api.audit(undefined, eventType || undefined),
    enabled: tab === "audit",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-6">
      <PageHeader title="History" description="Every analysis run and every decision, including blocked write attempts." />
      <Tabs
        label="History views"
        value={tab}
        onChange={setTab}
        items={[
          { value: "runs", label: "Analysis runs" },
          { value: "audit", label: "Audit log" },
        ]}
      />
      {tab === "runs" ? (
        runs.isLoading ? (
          <Skeleton className="h-40" />
        ) : runs.isError ? (
          <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
        ) : !runs.data?.items.length ? (
          <EmptyState icon={History} title="No analysis runs yet." >
            Batch analyses started from the inbox appear here.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-surface text-[12px] text-muted">
                <tr className="h-9">
                  <th scope="col" className="w-10 pl-3">
                    <span className="sr-only">Expand</span>
                  </th>
                  <th scope="col" className="px-2 font-medium">Started</th>
                  <th scope="col" className="px-2 font-medium">Repository</th>
                  <th scope="col" className="px-2 font-medium">Provider · model</th>
                  <th scope="col" className="px-2 font-medium">Issues</th>
                  <th scope="col" className="px-2 font-medium">Duration</th>
                  <th scope="col" className="px-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <Select aria-label="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          {audit.isLoading ? (
            <Skeleton className="h-40" />
          ) : audit.isError ? (
            <ErrorState error={audit.error} onRetry={() => audit.refetch()} />
          ) : !audit.data?.items.length ? (
            <EmptyState icon={History} title="No audit events." />
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {audit.data.items.map((e) => (
                <li key={e.id} className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-[12px] sm:grid-cols-[140px_170px_160px_1fr]">
                  <span className="text-subtle tnum" title={absoluteTime(e.ts)}>
                    {absoluteTime(e.ts)}
                  </span>
                  <span className={cn("font-mono font-medium", eventTone(e.event_type))}>{e.event_type}</span>
                  <span className="truncate font-mono text-muted">
                    {e.repository ?? ""}
                    {e.issue_number ? `#${e.issue_number}` : ""}
                  </span>
                  <span className="min-w-0 break-words text-muted">{summarize(e)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
