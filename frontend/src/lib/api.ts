import type {
  Analysis,
  ApplyResult,
  AuditEvent,
  ConfigStatus,
  IssueDetail,
  IssueRow,
  Page,
  Proposal,
  Reason,
  ReportSummary,
  Repository,
  Run,
} from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get reasons(): Reason[] {
    return (this.details.reasons as Reason[] | undefined) ?? [];
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    });
  } catch {
    throw new ApiError(0, "BACKEND_UNREACHABLE", "Can't reach the IssuePilot backend at 127.0.0.1:8000.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: Record<string, unknown> } })
      ?.error;
    if (err) throw new ApiError(res.status, err.code, err.message, err.details ?? {});
    if (res.status >= 500 && !text) {
      throw new ApiError(0, "BACKEND_UNREACHABLE", "Can't reach the IssuePilot backend at 127.0.0.1:8000.");
    }
    throw new ApiError(res.status, "HTTP_ERROR", `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export interface IssueFilters {
  q?: string;
  category?: string;
  severity?: string;
  priority?: string;
  status?: string;
  flag?: string;
  sort?: string;
  direction?: string;
  page?: number;
  page_size?: number;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

export const api = {
  health: () => request<{ status: string; version: string }>("/health"),
  config: () => request<ConfigStatus>("/config/status"),
  testProvider: () =>
    request<{ ok: boolean; message: string; model: string | null; latency_ms: number }>(
      "/config/test-provider",
      { method: "POST" },
    ),
  repos: () => request<Repository[]>("/repos"),
  repo: (id: number) => request<Repository>(`/repos/${id}`),
  connectRepo: (input: string) => request<Repository>("/repos", json({ input })),
  deleteRepo: (id: number) => request<void>(`/repos/${id}`, { method: "DELETE" }),
  syncRepo: (id: number) =>
    request<{ synced: number; created: number; updated: number; skipped_pull_requests: number }>(
      `/repos/${id}/sync`,
      { method: "POST" },
    ),
  seedDemo: () => request<{ repository_id: number; issues: number }>("/demo/seed", { method: "POST" }),
  deleteDemo: () => request<void>("/demo", { method: "DELETE" }),
  issues: (repoId: number, f: IssueFilters) =>
    request<Page<IssueRow>>(`/repos/${repoId}/issues${qs({ ...f })}`),
  issueByNumber: (repoId: number, number: number) =>
    request<IssueDetail>(`/repos/${repoId}/issues/by-number/${number}`),
  analyzeIssue: (issueId: number) => request<Analysis>(`/issues/${issueId}/analyze`, { method: "POST" }),
  analyzeBatch: (repository_id: number, scope: "selected" | "untriaged", issue_ids?: number[]) =>
    request<{ run_id: number; total: number; capped: boolean; max_batch: number }>(
      "/analyses",
      json({ repository_id, scope, issue_ids }),
    ),
  run: (id: number) => request<Run>(`/runs/${id}`),
  editProposal: (id: number, body: { labels?: string[]; body?: string }) =>
    request<Proposal>(`/proposals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  approve: (id: number) => request<Proposal>(`/proposals/${id}/approve`, { method: "POST" }),
  reject: (id: number, reason?: string) => request<Proposal>(`/proposals/${id}/reject`, json({ reason })),
  policy: (id: number) => request<{ allowed: boolean; reasons: Reason[] }>(`/proposals/${id}/policy`),
  apply: (id: number, confirm: string, dry_run: boolean) =>
    request<ApplyResult>(`/proposals/${id}/apply`, json({ confirm, dry_run })),
  runs: (repository_id?: number) => request<Page<Run>>(`/history/runs${qs({ repository_id })}`),
  audit: (repository_id?: number, event_type?: string) =>
    request<Page<AuditEvent>>(`/history/audit${qs({ repository_id, event_type })}`),
  report: (repository_id: number, from?: string) =>
    request<ReportSummary>(`/reports/summary${qs({ repository_id, from })}`),
  exportUrl: (repository_id: number, format: "md" | "json", from?: string) =>
    `/api/reports/export${qs({ repository_id, format, from })}`,
};
