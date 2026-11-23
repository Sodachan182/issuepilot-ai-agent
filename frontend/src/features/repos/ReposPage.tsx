import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, FolderGit2, Inbox, RefreshCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RepoModeBadge } from "../../components/app/badges";
import { useCurrentRepoId } from "../../components/app/AppShell";
import { EmptyState, ErrorState, PageHeader } from "../../components/app/states";
import { Button, Dialog, Input, Skeleton, Tooltip } from "../../components/ui/primitives";
import { api, ApiError } from "../../lib/api";
import { absoluteTime, relativeTime } from "../../lib/format";
import type { Repository } from "../../lib/types";

export function ReposPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [, setRepoId] = useCurrentRepoId();
  const [input, setInput] = useState("");
  const [toDelete, setToDelete] = useState<Repository | null>(null);
  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos });
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["repos"] });
    qc.invalidateQueries({ queryKey: ["config"] });
  };

  const connect = useMutation({
    mutationFn: async (value: string) => {
      const repo = await api.connectRepo(value);
      if (!repo.is_demo && repo.issue_count === 0) await api.syncRepo(repo.id);
      return repo;
    },
    onSuccess: (repo) => {
      invalidate();
      setInput("");
      setRepoId(repo.id);
      toast.success(`Connected ${repo.full_name}`);
      navigate(`/repos/${repo.id}/issues`);
    },
  });

  const demo = useMutation({
    mutationFn: api.seedDemo,
    onSuccess: (r) => {
      invalidate();
      setRepoId(r.repository_id);
      toast.success(`Demo workspace loaded with ${r.issues} synthetic issues`);
      navigate(`/repos/${r.repository_id}/issues`);
    },
  });

  const sync = useMutation({
    mutationFn: (id: number) => api.syncRepo(id),
    onSuccess: (r) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["issues"] });
      toast.success(`Synced ${r.synced} open issues (${r.skipped_pull_requests} pull requests skipped)`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteRepo(id),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      toast.success("Local data removed. Nothing was changed on GitHub.");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) connect.mutate(input.trim());
  };

  const gh = config.data?.github;
  const list = repos.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader title="Repositories" description="Connect a GitHub repository or explore the synthetic demo workspace." />

      <section aria-labelledby="connect-heading" className="rounded-lg border border-border">
        <div className="px-4 py-4">
          <h2 id="connect-heading" className="text-[14px] font-semibold">
            Connect a repository
          </h2>
          <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="repo-input" className="sr-only">
              Repository
            </label>
            <Input
              id="repo-input"
              placeholder="owner/repo or GitHub URL"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="font-mono text-[12px] sm:max-w-md"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="primary" disabled={!input.trim() || connect.isPending}>
              {connect.isPending ? "Connecting…" : "Connect"}
            </Button>
            <Button variant="ghost" onClick={() => demo.mutate()} disabled={demo.isPending}>
              <FlaskConical size={14} strokeWidth={1.75} aria-hidden />
              {demo.isPending ? "Loading…" : "Load demo workspace"}
            </Button>
          </form>
          <p className="mt-2 text-[12px] text-subtle">
            {gh?.token_configured
              ? `Authenticated${gh.authenticated_login ? ` as ${gh.authenticated_login}` : ""}. Reads are limited to ${gh.rate_limit?.limit?.toLocaleString() ?? "5,000"} requests/hour. Up to ${config.data?.limits.max_sync_issues ?? 100} open issues are synced per repository.`
              : `No GitHub token configured: public repositories only, 60 requests/hour. Up to ${config.data?.limits.max_sync_issues ?? 100} open issues are synced per repository.`}
          </p>
          {connect.isError ? <ErrorState error={connect.error} className="mt-3" /> : null}
          {demo.isError ? <ErrorState error={demo.error} className="mt-3" /> : null}
        </div>
      </section>

      <section aria-labelledby="repos-heading">
        <h2 id="repos-heading" className="sr-only">
          Connected repositories
        </h2>
        {repos.isLoading ? (
          <div className="space-y-2 rounded-lg border border-border p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : repos.isError ? (
          <ErrorState error={repos.error} onRetry={() => repos.refetch()} />
        ) : !list.length ? (
          <div className="rounded-lg border border-dashed border-border">
            <EmptyState
              icon={FolderGit2}
              title="Connect a GitHub repository to start triaging."
              actions={
                <>
                  <Button variant="primary" onClick={() => document.getElementById("repo-input")?.focus()}>
                    Connect repository
                  </Button>
                  <Button onClick={() => demo.mutate()}>
                    <FlaskConical size={14} strokeWidth={1.75} aria-hidden /> Load demo workspace
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-surface text-[12px] text-muted">
                <tr className="h-9">
                  <th scope="col" className="px-4 font-medium">Repository</th>
                  <th scope="col" className="px-3 font-medium">Mode</th>
                  <th scope="col" className="px-3 text-right font-medium">Issues</th>
                  <th scope="col" className="px-3 text-right font-medium">Analyzed</th>
                  <th scope="col" className="px-3 font-medium">Last synced</th>
                  <th scope="col" className="px-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="h-12 border-t border-border hover:bg-surface">
                    <td className="max-w-[360px] px-4">
                      <Link
                        to={`/repos/${r.id}/issues`}
                        onClick={() => setRepoId(r.id)}
                        className="font-mono text-[12px] font-medium hover:underline"
                      >
                        {r.full_name}
                      </Link>
                      {r.description ? <p className="truncate text-[12px] text-subtle">{r.description}</p> : null}
                    </td>
                    <td className="px-3">
                      <RepoModeBadge status={r.write_status} />
                    </td>
                    <td className="px-3 text-right tnum">{r.issue_count}</td>
                    <td className="px-3 text-right tnum">{r.analyzed_count}</td>
                    <td className="px-3 text-muted">
                      <Tooltip content={absoluteTime(r.last_synced_at)}>
                        <span tabIndex={0}>{relativeTime(r.last_synced_at)}</span>
                      </Tooltip>
                    </td>
                    <td className="px-3">
                      <div className="flex justify-end gap-1">
                        {r.is_demo ? null : (
                          <Tooltip content="Sync open issues from GitHub">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Sync ${r.full_name}`}
                              onClick={() => sync.mutate(r.id)}
                              disabled={sync.isPending}
                            >
                              <RefreshCw size={15} strokeWidth={1.75} className={sync.isPending && sync.variables === r.id ? "animate-spin" : ""} />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="Open inbox">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Open inbox for ${r.full_name}`}
                            onClick={() => {
                              setRepoId(r.id);
                              navigate(`/repos/${r.id}/issues`);
                            }}
                          >
                            <Inbox size={15} strokeWidth={1.75} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Remove local data (does not touch GitHub)">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove local data for ${r.full_name}`}
                            onClick={() => setToDelete(r)}
                          >
                            <Trash2 size={15} strokeWidth={1.75} />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sync.isError && sync.error instanceof ApiError ? <ErrorState error={sync.error} className="mt-3" /> : null}
      </section>

      <Dialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Remove local data"
        description={toDelete ? `Delete cached issues, analyses and history for ${toDelete.full_name}?` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="border border-danger/40"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
              disabled={remove.isPending}
            >
              Remove local data
            </Button>
          </>
        }
      >
        <p className="text-muted">This only affects IssuePilot's local database. Nothing is changed on GitHub.</p>
      </Dialog>
    </div>
  );
}
