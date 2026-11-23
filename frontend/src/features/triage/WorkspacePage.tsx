import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, RotateCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CategoryChip,
  ConfidenceText,
  LabelPill,
  ModeBadge,
  PriorityTag,
  SeverityIndicator,
} from "../../components/app/badges";
import { MarkdownView, type Highlight } from "../../components/app/MarkdownView";
import { EmptyState, ErrorState } from "../../components/app/states";
import { Button, Kbd, Sheet, Skeleton, Tabs } from "../../components/ui/primitives";
import { api, ApiError } from "../../lib/api";
import {
  INJECTION_PATTERN_LABEL,
  absoluteTime,
  cn,
  describeWarning,
  relativeTime,
} from "../../lib/format";
import { useHotkeys } from "../../lib/keyboard";
import { usePersistentState } from "../../lib/theme";
import type { Analysis, Evidence, IssueDetail, Proposal } from "../../lib/types";
import { DraftReplyEditor } from "./DraftReplyEditor";
import { EvidenceDisclosure } from "./EvidenceDisclosure";
import { ProposalBar } from "./ProposalBar";

function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return matches;
}

function InjectionNotice({
  detail,
  showSpans,
  onToggle,
}: {
  detail: IssueDetail;
  showSpans: boolean;
  onToggle: () => void;
}) {
  const flags = detail.issue.injection_flags;
  const modelFlag = detail.latest_analysis?.warnings.includes("possible_prompt_injection");
  if (!flags.length && !modelFlag) return null;
  const patterns = [...new Set(flags.map((f) => f.pattern_id))];
  return (
    <div role="note" className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5">
      <div className="flex items-start gap-2">
        <ShieldAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Possible prompt injection{flags.length ? ` (${flags.length})` : ""}
          </p>
          <p className="mt-0.5 text-muted">
            This issue contains text that looks like instructions to an AI. IssuePilot treats it as data. Review
            suggestions carefully.
          </p>
          {patterns.length ? (
            <ul className="mt-1.5 list-disc pl-4 text-[12px] text-muted">
              {patterns.map((p) => (
                <li key={p}>{INJECTION_PATTERN_LABEL[p] ?? p}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {flags.length ? (
          <Button size="sm" variant="ghost" onClick={onToggle} aria-pressed={showSpans}>
            {showSpans ? "Hide" : "Show"}
          </Button>
        ) : null}
      </div>
      {showSpans && flags.some((f) => f.pattern_id === "hidden_html_comment" || f.pattern_id === "invisible_chars") ? (
        <ul className="mt-2 space-y-1">
          {flags
            .filter((f) => f.pattern_id === "hidden_html_comment" || f.pattern_id === "invisible_chars")
            .map((f, i) => (
              <li key={i} className="rounded border border-warning/30 bg-bg px-2 py-1 font-mono text-[11.5px] break-all">
                {f.excerpt}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function IssuePane({
  detail,
  highlights,
  showInjection,
  setShowInjection,
}: {
  detail: IssueDetail;
  highlights: Highlight[];
  showInjection: boolean;
  setShowInjection: (v: boolean) => void;
}) {
  const [showImages, setShowImages] = useState(false);
  const issue = detail.issue;
  return (
    <div className="space-y-4 px-4 py-4 md:px-6">
      <h2 className="sr-only">Original issue</h2>
      {issue.labels.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-subtle">Existing labels:</span>
          {issue.labels.map((l) => (
            <LabelPill key={l} name={l} />
          ))}
        </div>
      ) : null}
      <InjectionNotice detail={detail} showSpans={showInjection} onToggle={() => setShowInjection(!showInjection)} />
      <MarkdownView source={issue.body} highlights={highlights} showImages={showImages} onShowImages={() => setShowImages(true)} />
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TriagePane({
  detail,
  analyzing,
  onAnalyze,
  onQuote,
  onCompare,
  editingDraft,
  setEditingDraft,
  onChanged,
}: {
  detail: IssueDetail;
  analyzing: boolean;
  onAnalyze: () => void;
  onQuote: (e: Evidence) => void;
  onCompare: (n: number) => void;
  editingDraft: boolean;
  setEditingDraft: (v: boolean) => void;
  onChanged: () => void;
}) {
  const a: Analysis | null = detail.latest_analysis;
  const labelProposal = detail.proposals.find((p) => p.type === "add_labels" && p.status !== "superseded");
  const commentProposal = detail.proposals.find((p) => p.type === "post_comment" && p.status !== "superseded");
  const qc = useQueryClient();

  const edit = useMutation({
    mutationFn: ({ p, body }: { p: Proposal; body: { labels?: string[]; body?: string } }) => api.editProposal(p.id, body),
    onSuccess: () => {
      onChanged();
      qc.invalidateQueries({ queryKey: ["policy"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (analyzing) {
    return (
      <div className="space-y-3 px-4 py-4 md:px-6" aria-busy="true" aria-live="polite">
        <p className="text-muted">Analyzing…</p>
        <Skeleton className="h-20" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (!a) {
    return (
      <EmptyState
        icon={RotateCw}
        title="This issue hasn't been analyzed yet."
        actions={
          <Button variant="primary" onClick={onAnalyze} aria-keyshortcuts="a">
            Analyze <Kbd>A</Kbd>
          </Button>
        }
      />
    );
  }
  if (a.status === "failed") {
    const [code, ...rest] = (a.error ?? "unknown: Analysis failed").split(": ");
    return (
      <div className="space-y-3 px-4 py-4 md:px-6">
        <ErrorState error={new ApiError(502, code.toUpperCase(), rest.join(": ") || "Analysis failed")} onRetry={onAnalyze} />
        <p className="text-[12px] text-subtle">
          No suggestion was stored. IssuePilot does not substitute rule-based output for a failed AI analysis. Set{" "}
          <code>AI_PROVIDER=heuristic</code> in .env to use the rule-based engine instead.
        </p>
      </div>
    );
  }

  const suggested = a.suggested_labels;
  const selectedLabels = new Set(labelProposal?.payload.labels ?? []);
  const labelsEditable = !!labelProposal && ["proposed", "approved", "failed"].includes(labelProposal.status);
  const toggleLabel = (name: string) => {
    if (!labelProposal || !labelsEditable) return;
    const next = new Set(selectedLabels);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    edit.mutate({ p: labelProposal, body: { labels: suggested.map((s) => s.name).filter((n) => next.has(n)) } });
  };
  const visibleWarnings = a.warnings.filter((w) => w !== "possible_prompt_injection");

  return (
    <div className="space-y-4 px-4 py-4 md:px-6">
      <h2 className="sr-only">Suggested triage</h2>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <ModeBadge mode={a.mode} model={a.model} providerLabel={a.provider_label} promptVersion={a.prompt_version} />
        <span>{a.mode === "ai" ? a.prompt_version : "keyword rules, no AI model used"}</span>
        <span aria-hidden>·</span>
        <span title={absoluteTime(a.created_at)}>{relativeTime(a.created_at)}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onAnalyze}>
          <RotateCw size={13} aria-hidden /> Re-analyze
        </Button>
      </div>
      {a.stale ? (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-[13px]">
          <AlertTriangle size={14} className="text-warning" aria-hidden />
          Issue changed since this analysis. Re-analyze before applying changes.
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {a.category ? <CategoryChip category={a.category} /> : null}
          {a.severity ? <SeverityIndicator severity={a.severity} /> : null}
          {a.priority ? <PriorityTag priority={a.priority} /> : null}
          {a.confidence ? (
            <span className="text-[12px]">
              <ConfidenceText confidence={a.confidence} />
            </span>
          ) : null}
        </div>
        {a.summary ? <p className="mt-2">{a.summary}</p> : null}
        <div className="mt-2">
          <EvidenceDisclosure evidence={a.evidence} onQuoteClick={onQuote} />
        </div>
      </div>

      <Section title="Labels">
        {suggested.length ? (
          <div className="flex flex-wrap gap-2">
            {suggested.map((s) => {
              const already = detail.issue.labels.some((l) => l.toLowerCase() === s.name.toLowerCase());
              const checked = already || selectedLabels.has(s.name);
              return (
                <label
                  key={s.name}
                  title={s.reason}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 font-mono text-[12px]",
                    checked ? "border-accent/50 bg-accent-subtle text-accent-text" : "border-border text-muted",
                    (already || !labelsEditable) && "cursor-default opacity-70",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--accent)]"
                    checked={checked}
                    disabled={already || !labelsEditable || edit.isPending}
                    onChange={() => toggleLabel(s.name)}
                  />
                  {s.name}
                  {already ? <span className="font-sans text-[11px] text-subtle">already on issue</span> : null}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-muted">No matching labels in this repository.</p>
        )}
      </Section>

      <Section title="Possible duplicates">
        {a.duplicates.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {a.duplicates.map((d) => (
              <li key={d.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-mono text-[12px] text-muted">#{d.number}</span>
                <span className="min-w-0 flex-1 basis-[calc(100%-56px)] truncate sm:basis-0" title={d.title}>
                  {d.title}
                </span>
                <span className="text-[12px] text-subtle tnum" title="Lexical similarity (TF-IDF cosine), not a probability">
                  lexical similarity {d.similarity.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "text-[12px] font-medium",
                    d.verdict === "likely_duplicate" ? "text-fg" : "text-muted",
                  )}
                >
                  {d.verdict === "likely_duplicate" ? "Likely duplicate" : d.verdict === "related" ? "Related" : "Not duplicate"}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onCompare(d.number)}>
                  Compare
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No similar issues found among cached issues.</p>
        )}
      </Section>

      <Section title="Next steps">
        <ol className="list-decimal space-y-1 pl-5">
          {a.next_steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Section>

      <div className="border-t border-border pt-4">
        <DraftReplyEditor
          proposal={commentProposal}
          draft={a.draft_response ?? ""}
          editing={editingDraft}
          onEditingChange={setEditingDraft}
          saving={edit.isPending}
          readOnly={!commentProposal || !["proposed", "approved", "failed"].includes(commentProposal.status)}
          onSave={(body) => {
            if (!commentProposal) return;
            edit.mutate(
              { p: commentProposal, body: { body } },
              { onSuccess: () => setEditingDraft(false) },
            );
          }}
        />
      </div>

      {visibleWarnings.length ? (
        <div className="border-t border-border pt-4">
          <h3 className="text-[13px] font-semibold">Warnings</h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted">
            {visibleWarnings.map((w) => (
              <li key={w}>{describeWarning(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {a.mode === "ai" ? (
        <p className="text-[11px] text-subtle tnum">
          {a.latency_ms.toLocaleString()} ms
          {a.input_tokens !== null ? ` · ${a.input_tokens.toLocaleString()} in / ${a.output_tokens?.toLocaleString()} out tokens` : ""}
        </p>
      ) : null}
    </div>
  );
}

function CompareSheet({
  open,
  onOpenChange,
  detail,
  number,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: IssueDetail;
  number: number | null;
}) {
  const other = detail.duplicate_issues.find((d) => d.number === number);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`Compare #${detail.issue.number} and #${number ?? ""}`}>
      <div className="grid gap-0 md:grid-cols-2">
        {[
          { number: detail.issue.number, title: detail.issue.title, body: detail.issue.body },
          other ? { number: other.number, title: other.title, body: other.body } : null,
        ].map((x, i) =>
          x ? (
            <div key={i} className={cn("p-5", i === 1 && "border-t border-border md:border-t-0 md:border-l")}>
              <p className="font-mono text-[12px] text-muted">#{x.number}</p>
              <h3 className="mt-1 text-[16px] font-semibold">{x.title}</h3>
              <div className="mt-3">
                <MarkdownView source={x.body} showImages={false} />
              </div>
            </div>
          ) : (
            <p key={i} className="p-5 text-muted">
              Issue #{number} is not in the local cache.
            </p>
          ),
        )}
      </div>
    </Sheet>
  );
}

export function WorkspacePage() {
  const { repoId: repoParam, number: numberParam } = useParams();
  const repoId = Number(repoParam);
  const number = Number(numberParam);
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const qc = useQueryClient();
  const wide = useMediaQuery("(min-width: 1280px)");
  const split = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<"issue" | "triage">("triage");
  const [ratio, setRatio] = usePersistentState("issuepilot.splitRatio", 0.5);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [showInjection, setShowInjection] = useState(false);
  const [compare, setCompare] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  const detailKey = ["issue", repoId, number];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => api.issueByNumber(repoId, number),
    placeholderData: keepPreviousData,
  });

  const listFilters = useMemo(
    () => ({
      q: search.get("q") ?? undefined,
      category: search.get("category") ?? undefined,
      severity: search.get("severity") ?? undefined,
      priority: search.get("priority") ?? undefined,
      status: search.get("status") ?? undefined,
      flag: search.get("flag") ?? undefined,
      sort: search.get("sort") ?? "number",
      direction: search.get("direction") ?? "desc",
      page_size: 100,
    }),
    [search],
  );
  const list = useQuery({ queryKey: ["issues", repoId, "nav", listFilters], queryFn: () => api.issues(repoId, listFilters) });
  const numbers = list.data?.items.map((i) => i.number) ?? [];
  const pos = numbers.indexOf(number);
  const prev = pos > 0 ? numbers[pos - 1] : null;
  const next = pos >= 0 && pos < numbers.length - 1 ? numbers[pos + 1] : null;
  const go = useCallback(
    (n: number | null) => n !== null && navigate(`/repos/${repoId}/issues/${n}?${search.toString()}`),
    [navigate, repoId, search],
  );

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: detailKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, repoId, number]);

  const analyze = useMutation({
    mutationFn: () => api.analyzeIssue(detail.data!.issue.id),
    onSuccess: (a) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      if (a.status === "failed") toast.error(`Analysis failed: ${a.error}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  useEffect(() => {
    setActiveQuote(null);
    setEditingDraft(false);
    setShowInjection(false);
  }, [number]);

  const onQuote = (e: Evidence) => {
    if (!split) setTab("issue");
    setActiveQuote(e.quote);
    window.setTimeout(() => {
      const el = leftRef.current?.querySelector("mark[data-highlight='active']") ?? null;
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      else leftRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 60);
    window.setTimeout(() => setActiveQuote((q) => (q === e.quote ? null : q)), 2400);
  };

  useHotkeys({
    j: () => go(next),
    k: () => go(prev),
    a: () => detail.data && !analyze.isPending && analyze.mutate(),
    e: () => detail.data?.latest_analysis?.status === "succeeded" && setEditingDraft(true),
  });

  const onDividerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const r = (ev.clientX - rect.left) / rect.width;
      const min = 360 / rect.width;
      setRatio(Math.min(1 - min, Math.max(min, r)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-6" aria-busy="true">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="grid gap-6 pt-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="p-6">
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }

  const d = detail.data;
  const issue = d.issue;
  const highlights: Highlight[] = [];
  if (showInjection) {
    for (const f of issue.injection_flags) {
      if (f.field === "body" && f.pattern_id !== "hidden_html_comment" && f.pattern_id !== "invisible_chars")
        highlights.push({ text: f.excerpt.replace(/\.\.\.$/, ""), kind: "injection" });
    }
  }
  if (activeQuote) highlights.push({ text: activeQuote, kind: "evidence", id: "active" });

  const issuePane = (
    <IssuePane detail={d} highlights={highlights} showInjection={showInjection} setShowInjection={setShowInjection} />
  );
  const triagePane = (
    <TriagePane
      detail={d}
      analyzing={analyze.isPending}
      onAnalyze={() => analyze.mutate()}
      onQuote={onQuote}
      onCompare={setCompare}
      editingDraft={editingDraft}
      setEditingDraft={setEditingDraft}
      onChanged={refresh}
    />
  );
  const titleHighlighted = activeQuote && issue.title.includes(activeQuote);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Link to={`/repos/${repoId}/issues?${search.toString()}`} className="inline-flex items-center gap-1 hover:text-fg">
            <ArrowLeft size={13} aria-hidden /> Inbox
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={prev === null} onClick={() => go(prev)} aria-label="Previous issue" aria-keyshortcuts="k">
              <ChevronLeft size={14} aria-hidden /> Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={next === null} onClick={() => go(next)} aria-label="Next issue" aria-keyshortcuts="j">
              Next <ChevronRight size={14} aria-hidden />
            </Button>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-start gap-x-3 gap-y-1">
          <h1 className="min-w-0 flex-1 text-[20px] leading-7 font-semibold tracking-[-0.01em] lg:text-[22px]">
            <span className="mr-2 font-mono font-normal text-subtle">#{issue.number}</span>
            <span className={cn(titleHighlighted && "rounded bg-[var(--mark)]")}>{issue.title}</span>
          </h1>
          {d.repository.is_demo ? null : (
            <a
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 text-[12px] text-muted hover:text-fg"
            >
              Open on GitHub <ExternalLink size={12} aria-hidden />
            </a>
          )}
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {issue.state} · opened by <span className="font-medium text-fg">{issue.author_login || "unknown"}</span> ·{" "}
          {issue.author_association} · <span title={absoluteTime(issue.created_at)}>{relativeTime(issue.created_at)}</span> ·{" "}
          {issue.comments_count} comment{issue.comments_count === 1 ? "" : "s"}
        </p>
      </header>

      {split ? (
        <div
          ref={containerRef}
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: wide ? `${ratio}fr 6px ${1 - ratio}fr` : "55fr 1px 45fr",
          }}
        >
          <div ref={leftRef} className="min-h-0 overflow-y-auto">
            {issuePane}
          </div>
          {wide ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuemin={30}
              aria-valuemax={70}
              tabIndex={0}
              onPointerDown={onDividerDown}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setRatio(Math.max(0.3, ratio - 0.03));
                if (e.key === "ArrowRight") setRatio(Math.min(0.7, ratio + 0.03));
              }}
              className="group flex cursor-col-resize justify-center"
            >
              <div className="h-full w-px bg-border group-hover:bg-accent group-focus-visible:bg-accent" />
            </div>
          ) : (
            <div className="bg-border" />
          )}
          <div className="min-h-0 overflow-y-auto bg-surface/40">{triagePane}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs
            label="Workspace panels"
            value={tab}
            onChange={setTab}
            items={[
              { value: "issue", label: "Issue" },
              { value: "triage", label: "Triage" },
            ]}
            className="px-3"
          />
          <div ref={leftRef} className="min-h-0 flex-1 overflow-y-auto">
            {tab === "issue" ? issuePane : triagePane}
          </div>
        </div>
      )}

      <ProposalBar
        proposals={d.proposals}
        repoFullName={d.repository.full_name}
        issueNumber={issue.number}
        onChanged={refresh}
      />
      <CompareSheet open={compare !== null} onOpenChange={(o) => !o && setCompare(null)} detail={d} number={compare} />
    </div>
  );
}
