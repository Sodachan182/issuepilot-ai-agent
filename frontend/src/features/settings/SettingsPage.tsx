import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ModeBadge } from "../../components/app/badges";
import { ErrorState, PageHeader } from "../../components/app/states";
import { Button, SegmentedControl, Skeleton } from "../../components/ui/primitives";
import { api } from "../../lib/api";
import { clockTime } from "../../lib/format";
import { useTheme, type ThemeChoice } from "../../lib/theme";

function Row({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-border py-3.5 first:border-t-0 sm:grid-cols-[240px_1fr]">
      <div>
        <p className="font-medium">{label}</p>
        {description ? <p className="text-[12px] text-subtle">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function YesNo({ value, yes = "Configured", no = "Not set" }: { value: boolean; yes?: string; no?: string }) {
  return value ? (
    <span className="inline-flex items-center gap-1 text-success">
      <Check size={14} aria-hidden /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted">
      <X size={14} aria-hidden /> {no}
    </span>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const [theme, setTheme] = useTheme();
  const test = useMutation({ mutationFn: api.testProvider });
  const resetDemo = useMutation({
    mutationFn: async () => {
      await api.deleteDemo();
      return api.seedDemo();
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Demo workspace reset");
    },
  });

  const c = config.data;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader title="Settings" description="Secrets live only in the backend .env file and are never shown here." />
      {config.isLoading ? <Skeleton className="h-64" /> : null}
      {config.isError ? <ErrorState error={config.error} onRetry={() => config.refetch()} /> : null}
      {c ? (
        <>
          <section aria-labelledby="ai-heading" className="rounded-lg border border-border px-4">
            <h2 id="ai-heading" className="pt-4 text-[14px] font-semibold">
              AI provider
            </h2>
            <div className="py-1">
              <Row label="Active provider" description="Change AI_PROVIDER in .env and restart the backend.">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px]">{c.ai.provider}</span>
                  <ModeBadge mode={c.ai.mode} model={c.ai.model} providerLabel={c.ai.provider_label} />
                </div>
              </Row>
              <Row label="Model">
                <span className="font-mono text-[12px]">{c.ai.model ?? "none (rule-based)"}</span>
              </Row>
              <Row label="API key">
                {c.ai.mode === "heuristic" ? <span className="text-muted">Not needed</span> : <YesNo value={c.ai.configured} />}
              </Row>
              <Row label="Connection" description="Sends a tiny test prompt to the provider.">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
                    {test.isPending ? "Testing…" : "Test connection"}
                  </Button>
                  {test.data ? (
                    <span className={test.data.ok ? "text-success" : "text-danger"}>
                      {test.data.message} · {test.data.latency_ms} ms
                    </span>
                  ) : null}
                </div>
              </Row>
            </div>
          </section>

          <section aria-labelledby="gh-heading" className="rounded-lg border border-border px-4">
            <h2 id="gh-heading" className="pt-4 text-[14px] font-semibold">
              GitHub
            </h2>
            <div className="py-1">
              <Row label="Token" description="Fine-grained PAT with Issues read (and write only if you enable writes).">
                <YesNo value={c.github.token_configured} />
              </Row>
              <Row label="Authenticated as">
                <span className="font-mono text-[12px]">{c.github.authenticated_login ?? "—"}</span>
              </Row>
              <Row label="Rate limit">
                {c.github.rate_limit?.limit ? (
                  <span className="tnum">
                    {c.github.rate_limit.remaining?.toLocaleString()} / {c.github.rate_limit.limit.toLocaleString()} · resets{" "}
                    {clockTime(c.github.rate_limit.reset_at)}
                  </span>
                ) : (
                  <span className="text-muted">Unknown until the first GitHub request</span>
                )}
              </Row>
              <Row label="Write mode" description="GITHUB_WRITE_ENABLED. Even when on, every change needs approval and typed confirmation.">
                <YesNo value={c.github.write_enabled} yes="Enabled" no="Disabled" />
              </Row>
              <Row label="Allow-listed repositories" description="WRITE_ALLOWED_REPOS (exact match only).">
                {c.github.write_allowed_repos.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.github.write_allowed_repos.map((r) => (
                      <span key={r} className="rounded border border-border px-1.5 font-mono text-[12px]">
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </Row>
            </div>
          </section>

          <section aria-labelledby="appearance-heading" className="rounded-lg border border-border px-4">
            <h2 id="appearance-heading" className="pt-4 text-[14px] font-semibold">
              Appearance
            </h2>
            <div className="py-1">
              <Row label="Theme">
                <SegmentedControl<ThemeChoice>
                  label="Theme"
                  value={theme}
                  onChange={setTheme}
                  items={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </Row>
            </div>
          </section>

          <section aria-labelledby="data-heading" className="rounded-lg border border-border px-4">
            <h2 id="data-heading" className="pt-4 text-[14px] font-semibold">
              Data
            </h2>
            <div className="py-1">
              <Row label="Demo workspace" description="Deletes and re-creates the synthetic demo repository locally.">
                <Button size="sm" onClick={() => resetDemo.mutate()} disabled={resetDemo.isPending}>
                  Reset demo workspace
                </Button>
              </Row>
              <Row label="Limits">
                <span className="text-muted">
                  Up to {c.limits.max_sync_issues} issues per sync · {c.limits.ai_max_batch} issues per batch · duplicate
                  thresholds {c.limits.dup_related_threshold} (related) / {c.limits.dup_likely_threshold} (likely), heuristic
                  and not validated
                </span>
              </Row>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
