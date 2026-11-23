import { Cpu, FlaskConical, Lock, PenLine } from "lucide-react";
import { CATEGORY_LABEL, SEVERITY_BARS, capitalize, cn } from "../../lib/format";
import type { Category, Confidence, Mode, Priority, Severity, WriteStatus } from "../../lib/types";
import { Tooltip } from "../ui/primitives";


export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      aria-label={`Category: ${CATEGORY_LABEL[category]}`}
      className={cn(
        `chip-${category} inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[12px] font-medium whitespace-nowrap`,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function SeverityIndicator({ severity, compact }: { severity: Severity; compact?: boolean }) {
  const bars = SEVERITY_BARS[severity];
  return (
    <span
      aria-label={`Severity: ${severity}`}
      className={`sev-${severity} inline-flex items-center gap-1.5 whitespace-nowrap`}
    >
      <svg aria-hidden width="14" height="12" viewBox="0 0 14 12">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 3.5}
            y={9 - i * 3}
            width="2.5"
            height={3 + i * 3}
            rx="0.75"
            fill="currentColor"
            opacity={i < bars ? 1 : 0.22}
          />
        ))}
      </svg>
      <span className={cn("text-[12px] font-medium", compact ? "text-fg" : "text-fg")}>
        {compact ? capitalize(severity).slice(0, 4) : capitalize(severity)}
      </span>
    </span>
  );
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const strong = priority === "P0" || priority === "P1";
  return (
    <span
      aria-label={`Priority: ${priority}`}
      className={cn(
        "inline-flex h-5 items-center rounded border px-1.5 font-mono text-[11px] font-medium",
        strong ? "border-border-strong text-fg" : "border-border text-muted",
      )}
    >
      {priority}
    </span>
  );
}

export function ConfidenceText({ confidence }: { confidence: Confidence }) {
  return (
    <span className="text-muted">
      Confidence: <span className="font-medium text-fg">{capitalize(confidence)}</span>
    </span>
  );
}

export function ModeBadge({
  mode,
  model,
  providerLabel,
  promptVersion,
  short,
}: {
  mode: Mode;
  model?: string | null;
  providerLabel?: string;
  promptVersion?: string;
  short?: boolean;
}) {
  if (mode === "heuristic") {
    return (
      <Tooltip content="Rule-based keyword analysis. No AI model was used. Configure GEMINI_API_KEY for AI analysis.">
        <span
          tabIndex={0}
          className="inline-flex h-5 items-center gap-1 rounded border border-warning/40 px-1.5 text-[11px] font-medium whitespace-nowrap text-warning"
        >
          <Cpu aria-hidden size={12} strokeWidth={1.75} />
          {short ? "Rules" : "Heuristic (rule-based)"}
        </span>
      </Tooltip>
    );
  }
  const label = providerLabel && providerLabel !== "Gemini" ? `${providerLabel} · ${model ?? ""}` : model ?? "";
  return (
    <Tooltip
      content={`Analyzed by ${providerLabel ?? "AI"} · ${model ?? "unknown model"}${
        promptVersion ? ` using prompt ${promptVersion}` : ""
      }. Suggestions require your review.`}
    >
      <span
        tabIndex={0}
        className="inline-flex h-5 max-w-[220px] items-center gap-1 truncate rounded border border-accent/40 px-1.5 text-[11px] font-medium whitespace-nowrap text-accent-text"
      >
        {short ? "AI" : `AI · ${label}`}
      </span>
    </Tooltip>
  );
}

export function RepoModeBadge({ status }: { status: WriteStatus }) {
  if (status.mode === "demo") {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 text-[11px] font-medium whitespace-nowrap text-muted">
        <FlaskConical aria-hidden size={12} strokeWidth={1.75} />
        Demo data
      </span>
    );
  }
  if (status.mode === "write_enabled") {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded border border-accent/50 px-1.5 text-[11px] font-medium whitespace-nowrap text-accent-text">
        <PenLine aria-hidden size={12} strokeWidth={1.75} />
        Write-enabled
      </span>
    );
  }
  return (
    <Tooltip content={status.reasons.map((r) => r.message).join(" ")}>
      <span
        tabIndex={0}
        className="inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 text-[11px] font-medium whitespace-nowrap text-muted"
      >
        <Lock aria-hidden size={12} strokeWidth={1.75} />
        Read-only
      </span>
    </Tooltip>
  );
}

export function StatusTag({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    untriaged: { label: "Not analyzed", cls: "text-subtle" },
    analyzed: { label: "Analyzed", cls: "text-muted" },
    pending: { label: "Pending review", cls: "text-accent-text" },
    applied: { label: "Applied", cls: "text-success" },
    failed: { label: "Failed", cls: "text-danger" },
    proposed: { label: "Pending", cls: "text-muted" },
    approved: { label: "Approved", cls: "text-accent-text" },
    rejected: { label: "Rejected", cls: "text-subtle" },
    superseded: { label: "Superseded", cls: "text-subtle" },
    running: { label: "Running", cls: "text-accent-text" },
    completed: { label: "Completed", cls: "text-success" },
    partial: { label: "Partial", cls: "text-warning" },
  };
  const s = map[status] ?? { label: status, cls: "text-muted" };
  return <span className={cn("text-[12px] font-medium whitespace-nowrap", s.cls)}>{s.label}</span>;
}

export function LabelPill({ name }: { name: string }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full border border-border px-1.5 font-mono text-[11px] whitespace-nowrap text-muted">
      {name}
    </span>
  );
}
