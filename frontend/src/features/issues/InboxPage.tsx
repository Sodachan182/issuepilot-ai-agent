import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Inbox, RefreshCw, Search, ShieldAlert, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CategoryChip,
  LabelPill,
  ModeBadge,
  PriorityTag,
  RepoModeBadge,
  SeverityIndicator,
  StatusTag,
} from "../../components/app/badges";
import { useCurrentRepoId } from "../../components/app/AppShell";
import { EmptyState, ErrorState, PageHeader, ProgressBar } from "../../components/app/states";
import { Button, Input, Select, Sheet, Skeleton, Tooltip } from "../../components/ui/primitives";
import { api, ApiError, type IssueFilters } from "../../lib/api";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, SEVERITIES, absoluteTime, capitalize, cn, relativeTime } from "../../lib/format";
import { useHotkeys } from "../../lib/keyboard";
import type { IssueRow } from "../../lib/types";
import { useRun } from "./useRun";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["q", "category", "severity", "priority", "status", "flag"] as const;

function FilterControls({
  params,
  set,
}: {
  params: URLSearchParams;
  set: (key: string, value: string) => void;
}) {
  return (
    <>
      <Select aria-label="Category" value={params.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
        <option value="">All categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </Select>
      <Select aria-label="Severity" value={params.get("severity") ?? ""} onChange={(e) => set("severity", e.target.value)}>
        <option value="">All severities</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {capitalize(s)}
          </option>
        ))}
      </Select>
      <Select aria-label="Priority" value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Select aria-label="Status" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">Any status</option>
        <option value="untriaged">Not analyzed</option>
        <option value="analyzed">Analyzed</option>
        <option value="pending">Pending review</option>
        <option value="applied">Applied</option>
        <option value="failed">Failed</option>
      </Select>
      <Select aria-label="Flags" value={params.get("flag") ?? ""} onChange={(e) => set("flag", e.target.value)}>
        <option value="">No flag filter</option>
        <option value="duplicate">Possible duplicate</option>
        <option value="injection">Injection flagged</option>
      </Select>
    </>
  );
}

function SortHeader({
  label,
  field,
  params,
  onSort,
  className,
}: {
  label: string;
  field: string;
  params: URLSearchParams;
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = (params.get("sort") ?? "number") === field;
  const dir = params.get("direction") ?? "desc";
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-2 font-medium", className)}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-fg">
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />
        ) : null}
      </button>
    </th>
  );
}

function IssueMeta({ row }: { row: IssueRow }) {
  const a = row.latest_analysis;
  const ok = a && a.status === "succeeded" ? a : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ok?.category ? <CategoryChip category={ok.category} /> : null}
      {ok?.severity ? <SeverityIndicator severity={ok.severity} /> : null}
      {ok?.priority ? <PriorityTag priority={ok.priority} /> : null}
      {ok && ok.duplicate_count ? (
        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <Copy size={12} aria-hidden /> {ok.duplicate_count}
        </span>
      ) : null}
      {row.injection_flagged ? <ShieldAlert size={14} className="text-warning" aria-label="Injection flagged" /> : null}
      <StatusTag status={row.status} />
    </div>
  );
}

export function InboxPage() {
  const { repoId: repoIdParam } = useParams();
  const repoId = Number(repoIdParam);
  const [, setStoredRepo] = useCurrentRepoId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusIdx, setFocusIdx] = useState(0);
  const [runId, setRunId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  useEffect(() => setStoredRepo(repoId), [repoId, setStoredRepo]);

  const filters: IssueFilters = useMemo(
    () => ({
      q: params.get("q") ?? undefined,
      category: params.get("category") ?? undefined,
      severity: params.get("severity") ?? undefined,
      priority: params.get("priority") ?? undefined,
      status: params.get("status") ?? undefined,
      flag: params.get("flag") ?? undefined,
      sort: params.get("sort") ?? "number",
      direction: params.get("direction") ?? "desc",
      page: Number(params.get("page") ?? 1),
      page_size: PAGE_SIZE,
    }),
    [params],
  );

  const repo = useQuery({ queryKey: ["repo", repoId], queryFn: () => api.repo(repoId) });
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const issues = useQuery({
    queryKey: ["issues", repoId, filters],
    queryFn: () => api.issues(repoId, filters),
    placeholderData: keepPreviousData,
  });
  const untriaged = useQuery({
    queryKey: ["issues", repoId, "untriaged-count"],
    queryFn: () => api.issues(repoId, { status: "untriaged", page_size: 1 }),
  });
  const failedCount = useQuery({
    queryKey: ["issues", repoId, "failed-count"],
    queryFn: () => api.issues(repoId, { status: "failed", page_size: 1 }),
  });

  const run = useRun(runId, (r) => {
    if (r.failed) toast.error(`${r.failed} of ${r.total} analyses failed`);
    else toast.success(`Analyzed ${r.succeeded} issues`);
    qc.invalidateQueries({ queryKey: ["history"] });
  });

  const analyze = useMutation({
    mutationFn: (args: { scope: "selected" | "untriaged"; ids?: number[] }) =>
      api.analyzeBatch(repoId, args.scope, args.ids),
    onSuccess: (r) => {
      setRunId(r.run_id);
      setSelected(new Set());
      if (r.capped) toast.message(`Batch limited to ${r.max_batch} issues per run`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sync = useMutation({
    mutationFn: () => api.syncRepo(repoId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["repos"] });
      qc.invalidateQueries({ queryKey: ["config"] });
      toast.success(`Synced ${r.synced} open issues`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = issues.data?.items ?? [];
  const total = issues.data?.total ?? 0;
  const page = filters.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const running = run.data?.status === "running" || analyze.isPending;
  const providerReady = config.data?.ai.configured ?? true;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };
  const onSort = (field: string) => {
    const next = new URLSearchParams(params);
    const current = params.get("sort") ?? "number";
    const dir = params.get("direction") ?? "desc";
    next.set("sort", field);
    next.set("direction", current === field && dir === "desc" ? "asc" : "desc");
    setParams(next, { replace: true });
  };
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));
  const clearFilters = () => {
    setSearch("");
    setParams(new URLSearchParams(), { replace: true });
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get("q") ?? "") !== search) setParam("q", search);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openIssue = (row: IssueRow) => navigate(`/repos/${repoId}/issues/${row.number}?${params.toString()}`);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(() => {
    if (focusIdx >= rows.length) setFocusIdx(Math.max(0, rows.length - 1));
  }, [rows.length, focusIdx]);

  const focusRow = (idx: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, idx));
    setFocusIdx(clamped);
    rowRefs.current[clamped]?.focus();
  };

  useHotkeys(
    {
      j: () => focusRow(focusIdx + 1),
      k: () => focusRow(focusIdx - 1),
      x: () => rows[focusIdx] && toggle(rows[focusIdx].id),
      a: () => {
        if (!providerReady || running) return;
        if (selected.size) analyze.mutate({ scope: "selected", ids: [...selected] });
        else analyze.mutate({ scope: "untriaged" });
      },
    },
    rows.length > 0,
  );

  const untriagedCount = untriaged.data?.total ?? 0;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const r = repo.data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 md:px-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Issues
            {r ? <span className="font-mono text-[13px] font-normal text-muted">{r.full_name}</span> : null}
            {r ? <RepoModeBadge status={r.write_status} /> : null}
          </span>
        }
        description={r?.is_demo ? "Synthetic demo data. Nothing here exists on GitHub." : undefined}
        actions={
          <>
            {r && !r.is_demo ? (
              <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw size={14} strokeWidth={1.75} className={sync.isPending ? "animate-spin" : ""} aria-hidden />
                Sync
              </Button>
            ) : null}
            <Tooltip content={!providerReady ? "The AI provider is not configured. See Settings." : undefined}>
              <Button
                variant="primary"
                aria-disabled={!providerReady || running || untriagedCount === 0}
                onClick={() => {
                  if (!providerReady || running || untriagedCount === 0) return;
                  analyze.mutate({ scope: "untriaged" });
                }}
              >
                Analyze untriaged ({untriagedCount})
              </Button>
            </Tooltip>
          </>
        }
      />

      {config.data && !config.data.ai.configured ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3">
          {config.data.ai.provider_label} is selected but not configured. Add its API key and model to <code>.env</code>, or
          set <code>AI_PROVIDER=heuristic</code> for rule-based analysis.
        </div>
      ) : null}

      {run.data && (run.data.status === "running" || run.data.failed > 0) ? (
        <div className="space-y-2 rounded-lg border border-border px-4 py-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span>
              {run.data.status === "running" ? "Analyzing" : "Analyzed"} {run.data.succeeded + run.data.failed} of{" "}
              {run.data.total}
              <span className="text-muted">
                {" · "}
                {run.data.mode === "ai" ? `${run.data.provider_label} · ${run.data.model}` : "Heuristic (rule-based)"}
              </span>
            </span>
            {run.data.failed ? <span className="text-danger">{run.data.failed} failed</span> : null}
          </div>
          <ProgressBar value={run.data.succeeded + run.data.failed} max={run.data.total} label="Analysis progress" />
          {run.data.status !== "running" && run.data.failed ? (
            <Button size="sm" variant="ghost" onClick={() => setParam("status", "failed")}>
              View failures
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            aria-label="Search issues"
            placeholder="Search issues or #number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <FilterControls params={params} set={setParam} />
        </div>
        <Button className="md:hidden" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={14} aria-hidden /> Filters
        </Button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X size={14} aria-hidden /> Clear
          </Button>
        ) : null}
        {failedCount.data?.total && !params.get("status") ? (
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setParam("status", "failed")}>
            {failedCount.data.total} failed
          </Button>
        ) : null}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" className="w-[300px]">
        <div className="flex flex-col gap-3 p-4 [&_select]:w-full">
          <FilterControls params={params} set={setParam} />
        </div>
      </Sheet>

      {issues.isError ? (
        <ErrorState error={issues.error} onRetry={() => issues.refetch()} />
      ) : issues.isLoading ? (
        <div className="space-y-2 rounded-lg border border-border p-3" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="rounded-lg border border-dashed border-border">
          {hasFilters ? (
            <EmptyState icon={Search} title="No issues match these filters." actions={<Button onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={Inbox}
              title={`No open issues found in ${r?.full_name ?? "this repository"}.`}
              actions={r && !r.is_demo ? <Button onClick={() => sync.mutate()}>Sync</Button> : undefined}
            />
          )}
        </div>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[860px] text-left">
              <thead className="sticky top-0 bg-surface text-[12px] text-muted">
                <tr className="h-9">
                  <th scope="col" className="w-9 pl-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allOnPageSelected}
                      onChange={() =>
                        setSelected(allOnPageSelected ? new Set() : new Set(rows.map((x) => x.id)))
                      }
                      className="size-3.5 accent-[var(--accent)]"
                    />
                  </th>
                  <SortHeader label="#" field="number" params={params} onSort={onSort} className="w-16" />
                  <th scope="col" className="px-2 font-medium">Title</th>
                  <th scope="col" className="px-2 font-medium">Category</th>
                  <SortHeader label="Severity" field="severity" params={params} onSort={onSort} />
                  <SortHeader label="Pri" field="priority" params={params} onSort={onSort} />
                  <th scope="col" className="px-2 font-medium">
                    <span className="sr-only">Flags</span>
                  </th>
                  <th scope="col" className="px-2 font-medium">Mode</th>
                  <SortHeader label="Updated" field="updated" params={params} onSort={onSort} />
                  <th scope="col" className="px-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const a = row.latest_analysis;
                  const ok = a && a.status === "succeeded" ? a : null;
                  return (
                    <tr
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      tabIndex={idx === focusIdx ? 0 : -1}
                      aria-selected={selected.has(row.id)}
                      onFocus={() => setFocusIdx(idx)}
                      onClick={() => openIssue(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openIssue(row);
                      }}
                      className={cn(
                        "h-9 cursor-pointer border-t border-border hover:bg-surface focus:bg-surface",
                        selected.has(row.id) && "bg-accent-subtle/60",
                      )}
                    >
                      <td className="pl-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select issue #${row.number}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggle(row.id)}
                          className="size-3.5 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-2 font-mono text-[12px] text-muted tnum">{row.number}</td>
                      <td className="max-w-[420px] px-2 py-1.5">
                        <Tooltip content={row.title.length > 60 ? row.title : undefined}>
                          <span className="block truncate font-medium">{row.title}</span>
                        </Tooltip>
                        {row.labels.length ? (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {row.labels.slice(0, 3).map((l) => (
                              <LabelPill key={l} name={l} />
                            ))}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2">{ok?.category ? <CategoryChip category={ok.category} /> : <span className="text-subtle">—</span>}</td>
                      <td className="px-2">{ok?.severity ? <SeverityIndicator severity={ok.severity} /> : <span className="text-subtle">—</span>}</td>
                      <td className="px-2">{ok?.priority ? <PriorityTag priority={ok.priority} /> : <span className="text-subtle">—</span>}</td>
                      <td className="px-2">
                        <span className="flex items-center gap-2">
                          {ok && ok.duplicate_count ? (
                            <Tooltip content={`${ok.duplicate_count} possible duplicate(s)${ok.likely_duplicate ? ", at least one likely" : ""}`}>
                              <span tabIndex={-1} className={cn("inline-flex items-center gap-1 text-[12px]", ok.likely_duplicate ? "text-fg" : "text-muted")}>
                                <Copy size={12} strokeWidth={1.75} aria-hidden />
                                {ok.duplicate_count}
                              </span>
                            </Tooltip>
                          ) : null}
                          {row.injection_flagged ? (
                            <Tooltip content="Contains text that looks like instructions to an AI">
                              <ShieldAlert size={14} strokeWidth={1.75} className="text-warning" aria-label="Injection flagged" />
                            </Tooltip>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2">{a ? <ModeBadge mode={a.mode} model={a.model} providerLabel={a.provider_label} short /> : null}</td>
                      <td className="px-2 whitespace-nowrap text-muted">
                        <Tooltip content={absoluteTime(row.updated_at)}>
                          <span>{relativeTime(row.updated_at)}</span>
                        </Tooltip>
                      </td>
                      <td className="px-2 pr-3">
                        {a?.status === "failed" ? (
                          <Tooltip content={a.error}>
                            <span>
                              <StatusTag status="failed" />
                            </span>
                          </Tooltip>
                        ) : row.status === "pending" ? (
                          <span className="text-[12px] font-medium text-accent-text">{row.pending_proposals} pending</span>
                        ) : (
                          <StatusTag status={row.status} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked list */}
          <ul className="divide-y divide-border rounded-lg border border-border md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`Select issue #${row.number}`}
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <button type="button" onClick={() => openIssue(row)} className="min-w-0 flex-1 text-left">
                  <span className="font-mono text-[12px] text-muted">#{row.number}</span>{" "}
                  <span className="font-medium">{row.title}</span>
                  <span className="mt-1 block">
                    <IssueMeta row={row} />
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="tnum">
              {total} issue{total === 1 ? "" : "s"}
              {pages > 1 ? ` · page ${page} of ${pages}` : ""}
            </span>
            {pages > 1 ? (
              <div className="flex gap-1">
                <Button size="sm" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))}>
                  Previous
                </Button>
                <Button size="sm" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))}>
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {selected.size ? (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-lg border border-border bg-bg px-4 py-2 shadow-overlay">
          <span className="tnum">{selected.size} selected</span>
          <Button
            variant="primary"
            size="sm"
            aria-disabled={!providerReady || running}
            onClick={() => {
              if (!providerReady || running) return;
              analyze.mutate({ scope: "selected", ids: [...selected] });
            }}
          >
            Analyze selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      {analyze.error instanceof ApiError && analyze.error.code !== "NOTHING_TO_ANALYZE" ? (
        <ErrorState error={analyze.error} />
      ) : null}
    </div>
  );
}
