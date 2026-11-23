import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Info, MessageSquare, Tag, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusTag } from "../../components/app/badges";
import { MarkdownView } from "../../components/app/MarkdownView";
import { ErrorState } from "../../components/app/states";
import { Button, Dialog, Input, Tooltip } from "../../components/ui/primitives";
import { api, ApiError } from "../../lib/api";
import { cn } from "../../lib/format";
import type { Proposal, Reason } from "../../lib/types";

export function proposalLabel(p: Proposal): string {
  if (p.type === "add_labels") {
    const n = p.payload.labels?.length ?? 0;
    return `Add ${n} label${n === 1 ? "" : "s"}`;
  }
  return "Post comment";
}

const OPEN = ["proposed", "approved", "failed"];

export function PolicyReasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-1">
      {reasons.map((r) => (
        <li key={r.code}>{r.message}</li>
      ))}
    </ul>
  );
}

export function ProposalBar({
  proposals,
  repoFullName,
  issueNumber,
  onChanged,
}: {
  proposals: Proposal[];
  repoFullName: string;
  issueNumber: number;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const visible = proposals.filter((p) => p.status !== "superseded");
  const open = visible.filter((p) => OPEN.includes(p.status));
  const approved = visible.filter((p) => p.status === "approved");

  const policies = useQueries({
    queries: open.map((p) => ({
      queryKey: ["policy", p.id, p.status],
      queryFn: () => api.policy(p.id),
    })),
  });

  const refresh = () => {
    onChanged();
    qc.invalidateQueries({ queryKey: ["policy"] });
    qc.invalidateQueries({ queryKey: ["issues"] });
    qc.invalidateQueries({ queryKey: ["history"] });
  };
  const approve = useMutation({
    mutationFn: (id: number) => api.approve(id),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });
  const reject = useMutation({
    mutationFn: (id: number) => api.reject(id),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  // Reasons why Apply is unavailable (policy for the first open proposal, minus approval).
  const policyReasons: Reason[] = [];
  for (const q of policies) {
    for (const r of q.data?.reasons ?? []) {
      if (r.code === "PROPOSAL_NOT_APPROVED") continue;
      if (!policyReasons.some((x) => x.code === r.code)) policyReasons.push(r);
    }
  }
  const demo = policyReasons.find((r) => r.code === "DEMO_REPO");
  const reasons: Reason[] = demo ? [demo] : [...policyReasons];
  if (!approved.length && !demo) {
    reasons.unshift({ code: "NONE_APPROVED", message: "Approve at least one proposal first." });
  }
  // Apply stays disabled until the backend has confirmed the policy for every open proposal.
  const policiesReady = policies.length > 0 && policies.every((q) => q.isSuccess);
  const approvedAllowed = approved.every((p) => {
    const idx = open.findIndex((o) => o.id === p.id);
    return idx >= 0 && policies[idx]?.data?.allowed === true;
  });
  const canApply = policiesReady && approvedAllowed && reasons.length === 0 && approved.length > 0;

  if (!visible.length) return null;

  return (
    <div className="border-t border-border bg-bg px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="hidden text-[12px] font-medium text-muted sm:inline">Proposals</span>
        <ul className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          {visible.map((p) => {
            const Icon = p.type === "add_labels" ? Tag : MessageSquare;
            const isOpen = OPEN.includes(p.status);
            return (
              <li key={p.id} className="flex items-center gap-2" data-testid={`proposal-${p.type}`}>
                <Icon size={14} strokeWidth={1.75} className="text-subtle" aria-hidden />
                <span className="text-[13px]">{proposalLabel(p)}</span>
                <StatusTag status={p.status} />
                {p.status === "applied" && p.github_ref ? (
                  <a href={p.github_ref} target="_blank" rel="noopener noreferrer" className="text-accent-text" aria-label="View on GitHub">
                    <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}
                {p.status === "failed" && p.error ? (
                  <Tooltip content={p.error}>
                    <Info size={13} className="text-danger" aria-label={p.error} tabIndex={0} />
                  </Tooltip>
                ) : null}
                {isOpen ? (
                  <span className="flex items-center gap-0.5">
                    {p.status !== "approved" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Approve: ${proposalLabel(p)}`}
                        onClick={() => approve.mutate(p.id)}
                        disabled={approve.isPending || (p.type === "add_labels" && !p.payload.labels?.length)}
                      >
                        <Check size={13} aria-hidden /> Approve
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Reject: ${proposalLabel(p)}`}
                      onClick={() => reject.mutate(p.id)}
                      disabled={reject.isPending}
                    >
                      <X size={13} aria-hidden /> Reject
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <Tooltip content={canApply ? undefined : <PolicyReasons reasons={reasons} />}>
          <Button
            variant="primary"
            aria-disabled={!canApply}
            aria-describedby={canApply ? undefined : "apply-reasons"}
            onClick={() => canApply && setApplyOpen(true)}
          >
            Apply to GitHub
          </Button>
        </Tooltip>
      </div>
      {!canApply && open.length ? (
        <p id="apply-reasons" className="mt-1.5 line-clamp-2 text-[12px] text-subtle sm:line-clamp-none">
          {reasons.map((r) => r.message).join(" ")} Nothing is written to GitHub until you approve and confirm.
        </p>
      ) : null}
      <ApplyDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        proposals={approved}
        repoFullName={repoFullName}
        issueNumber={issueNumber}
        onApplied={refresh}
      />
    </div>
  );
}

export function ApplyDialog({
  open,
  onOpenChange,
  proposals,
  repoFullName,
  issueNumber,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proposals: Proposal[];
  repoFullName: string;
  issueNumber: number;
  onApplied: () => void;
}) {
  const expected = `${repoFullName}#${issueNumber}`;
  const [confirm, setConfirm] = useState("");
  const [dryRun, setDryRun] = useState<unknown[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reset = (o: boolean) => {
    if (!o) {
      setConfirm("");
      setDryRun(null);
      setError(null);
    }
    onOpenChange(o);
  };

  const runDry = async () => {
    setBusy(true);
    setError(null);
    try {
      const results = [];
      for (const p of proposals) results.push((await api.apply(p.id, confirm, true)).planned_request);
      setDryRun(results);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setBusy(true);
    setError(null);
    let applied = 0;
    try {
      for (const p of proposals) {
        const r = await api.apply(p.id, confirm, false);
        applied += 1;
        toast.success(`${proposalLabel(p)}: applied`, {
          action: r.github_ref ? { label: "View", onClick: () => window.open(r.github_ref!, "_blank", "noopener") } : undefined,
        });
      }
      onApplied();
      reset(false);
    } catch (e) {
      setError(e);
      if (applied) onApplied();
    } finally {
      setBusy(false);
    }
  };

  const matches = confirm === expected;
  return (
    <Dialog
      open={open}
      onOpenChange={reset}
      wide
      title={`Apply changes to ${expected}`}
      description="Review the exact changes. IssuePilot re-checks permissions and the issue before writing."
      footer={
        <>
          <Button variant="ghost" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button onClick={runDry} disabled={busy || !matches}>
            Dry run
          </Button>
          <Button variant="primary" onClick={runApply} disabled={busy || !matches}>
            Apply {proposals.length} change{proposals.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <ul className="space-y-3">
        {proposals.map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-3">
            {p.type === "add_labels" ? (
              <p>
                Add labels:{" "}
                {(p.payload.labels ?? []).map((l) => (
                  <code key={l} className="mr-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">
                    {l}
                  </code>
                ))}
                <span className="block text-[12px] text-subtle">Labels already on the issue are skipped.</span>
              </p>
            ) : (
              <div>
                <p className="mb-2">Post comment:</p>
                <div className="rounded-md border border-border bg-surface px-3 py-2">
                  <MarkdownView source={p.payload.body ?? ""} showImages={false} />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <label htmlFor="apply-confirm" className="text-[13px]">
          Type <code className="font-mono font-medium">{expected}</code> to confirm
        </label>
        <Input
          id="apply-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={expected}
          autoComplete="off"
          spellCheck={false}
          className={cn("mt-1.5 font-mono text-[12px]", confirm && !matches && "border-danger")}
        />
      </div>
      {dryRun ? (
        <div className="mt-4">
          <p className="text-[12px] text-muted">
            Dry run: this is the exact request IssuePilot would send. Nothing was sent.
          </p>
          <pre className="mt-1.5 max-h-60 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-[11.5px]">
            {JSON.stringify(dryRun, null, 2)}
          </pre>
        </div>
      ) : null}
      {error ? (
        <ErrorState error={error instanceof ApiError ? error : new Error(String(error))} className="mt-4" />
      ) : null}
    </Dialog>
  );
}
