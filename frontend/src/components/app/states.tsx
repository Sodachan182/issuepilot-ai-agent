import { AlertTriangle, Gauge, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../../lib/api";
import { clockTime, cn } from "../../lib/format";
import { Button } from "../ui/primitives";

export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-16 text-center", className)}>
      <div className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-3 text-[14px] font-medium">{title}</p>
      {children ? <div className="mt-1 max-w-md text-muted">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.code === "GITHUB_RATE_LIMITED") {
    return <RateLimitNotice resetAt={(e.details.reset_at as string) ?? null} className={className} />;
  }
  return (
    <div role="alert" className={cn("rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3", className)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{e?.message ?? (error as Error)?.message ?? "Something went wrong"}</p>
          {e && e.code !== "BACKEND_UNREACHABLE" ? (
            <p className="mt-0.5 font-mono text-[11px] text-muted">{e.code}</p>
          ) : null}
          {e?.reasons.length ? (
            <ul className="mt-1.5 list-disc pl-4 text-muted">
              {e.reasons.map((r) => (
                <li key={r.code}>{r.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function RateLimitNotice({ resetAt, className }: { resetAt: string | null; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3", className)}>
      <div className="flex items-start gap-2.5">
        <Gauge size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        <p>
          <span className="font-medium">GitHub rate limit reached.</span>{" "}
          {resetAt ? `Resets at ${clockTime(resetAt)}. ` : ""}Cached data is still available.
        </p>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] leading-7 font-semibold tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-0.5 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}
