export type Category = "bug" | "feature_request" | "documentation" | "question" | "maintenance";
export type Severity = "critical" | "high" | "medium" | "low";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type Confidence = "low" | "medium" | "high";
export type Mode = "ai" | "heuristic";
export type RowStatus = "untriaged" | "analyzed" | "pending" | "applied" | "failed";
export type ProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "failed"
  | "superseded";

export interface Reason {
  code: string;
  message: string;
}

export interface WriteStatus {
  allowed: boolean;
  mode: "demo" | "read_only" | "write_enabled";
  reasons: Reason[];
}

export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  is_private: boolean;
  is_demo: boolean;
  label_names: string[];
  last_synced_at: string | null;
  created_at: string;
  issue_count: number;
  analyzed_count: number;
  write_status: WriteStatus;
}

export interface AnalysisSummary {
  id: number;
  status: "succeeded" | "failed";
  mode: Mode;
  provider_label: string;
  model: string | null;
  category: Category | null;
  severity: Severity | null;
  priority: Priority | null;
  confidence: Confidence | null;
  duplicate_count: number;
  likely_duplicate: boolean;
  injection_detected: boolean;
  error: string | null;
  created_at: string;
}

export interface IssueRow {
  id: number;
  number: number;
  title: string;
  labels: string[];
  author_login: string;
  comments_count: number;
  updated_at: string | null;
  html_url: string;
  injection_flagged: boolean;
  status: RowStatus;
  pending_proposals: number;
  latest_analysis: AnalysisSummary | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page?: number;
  page_size?: number;
}

export interface InjectionFlag {
  pattern_id: string;
  field: "title" | "body";
  span_start: number;
  span_end: number;
  excerpt: string;
}

export interface Issue {
  id: number;
  repository_id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  author_login: string;
  author_association: string;
  labels: string[];
  comments_count: number;
  html_url: string;
  created_at: string | null;
  updated_at: string | null;
  injection_flags: InjectionFlag[];
}

export interface Evidence {
  claim: string;
  quote: string;
  source: "title" | "body";
}

export interface DuplicateResult {
  number: number;
  title: string;
  similarity: number;
  verdict: "likely_duplicate" | "related" | "not_duplicate";
  rationale: string;
}

export interface Analysis {
  id: number;
  run_id: number | null;
  issue_id: number;
  status: "succeeded" | "failed";
  error: string | null;
  mode: Mode;
  provider: string;
  provider_label: string;
  model: string | null;
  prompt_version: string;
  category: Category | null;
  severity: Severity | null;
  priority: Priority | null;
  confidence: Confidence | null;
  summary: string | null;
  suggested_labels: { name: string; reason: string }[];
  duplicates: DuplicateResult[];
  next_steps: string[];
  draft_response: string | null;
  evidence: Evidence[];
  injection_detected: boolean;
  warnings: string[];
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  stale: boolean;
  created_at: string;
}

export interface Proposal {
  id: number;
  analysis_id: number;
  issue_id: number;
  repository_id: number;
  type: "add_labels" | "post_comment";
  payload: { labels?: string[]; body?: string };
  original_payload: { labels?: string[]; body?: string };
  edited: boolean;
  status: ProposalStatus;
  reject_reason: string | null;
  github_ref: string | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  applied_at: string | null;
}

export interface IssueDetail {
  issue: Issue;
  repository: { id: number; full_name: string; is_demo: boolean; html_url: string };
  latest_analysis: Analysis | null;
  analyses: {
    id: number;
    status: string;
    mode: Mode;
    model: string | null;
    provider_label: string;
    created_at: string;
  }[];
  proposals: Proposal[];
  duplicate_issues: { id: number; number: number; title: string; body: string; html_url: string }[];
}

export interface Run {
  id: number;
  repository_id: number;
  repository: string | null;
  provider: string;
  provider_label: string;
  model: string | null;
  mode: Mode;
  prompt_version: string;
  status: "running" | "completed" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  items?: {
    issue_id: number;
    number: number | null;
    title: string | null;
    status: string;
    category: Category | null;
    error: string | null;
  }[];
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor: string;
  event_type: string;
  repository_id: number | null;
  repository: string | null;
  issue_number: number | null;
  proposal_id: number | null;
  details: Record<string, unknown>;
}

export interface RateLimit {
  remaining: number | null;
  limit: number | null;
  reset_at: string | null;
}

export interface ConfigStatus {
  ai: {
    provider: string;
    provider_label: string;
    model: string | null;
    mode: Mode;
    configured: boolean;
  };
  github: {
    token_configured: boolean;
    authenticated_login: string | null;
    write_enabled: boolean;
    write_allowed_repos: string[];
    rate_limit: RateLimit | null;
  };
  limits: {
    max_sync_issues: number;
    ai_max_batch: number;
    dup_related_threshold: number;
    dup_likely_threshold: number;
  };
}

export interface ReportSummary {
  repository: string;
  range: { from: string | null; to: string | null };
  generated_at: string;
  totals: {
    issues_cached: number;
    issues_analyzed: number;
    analyses_ai: number;
    analyses_heuristic: number;
    analyses_failed: number;
  };
  by_category: Record<Category, number>;
  by_severity: Record<Severity, number>;
  by_priority: Record<Priority, number>;
  proposals: Record<"proposed" | "approved" | "rejected" | "applied" | "failed", number>;
  likely_duplicate_pairs: { a: number; b: number; similarity: number }[];
  needs_attention: {
    number: number;
    title: string;
    priority: Priority;
    severity: Severity;
    category: Category;
    html_url: string;
  }[];
  disclaimer: string;
}

export interface ApplyResult {
  status: string;
  dry_run: boolean;
  planned_request?: { method: string; url: string; body: unknown };
  github_ref?: string | null;
  proposal: Proposal;
}
