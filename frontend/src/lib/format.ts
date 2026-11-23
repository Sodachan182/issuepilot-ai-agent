import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Category, Priority, Severity } from "./types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  documentation: "Documentation",
  question: "Question",
  maintenance: "Maintenance",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
export const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];
export const SEVERITY_BARS: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "—";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function absoluteTime(value: string | null | undefined): string {
  const d = parseDate(value);
  return d
    ? d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

export function clockTime(value: string | null | undefined): string {
  const d = parseDate(value);
  return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const WARNING_TEXT: Record<string, string> = {
  possible_prompt_injection: "The model reported a possible prompt-injection attempt",
  insufficient_information: "The issue lacks information for a confident triage",
  no_verified_evidence: "No quote could be verified; showing the title instead",
  truncated_input: "The issue body was truncated before analysis",
  critical_with_injection_review_manually: "Critical severity on a flagged issue: review manually",
  not_an_issue: "The model thinks this may not be an actionable issue",
  multiple_issues_in_one: "The issue seems to contain several separate problems",
};

export function describeWarning(w: string): string {
  const [key, count] = w.split(":");
  if (key === "removed_unknown_labels") return `${count} suggested label(s) not in this repository were removed`;
  if (key === "removed_unknown_duplicates") return `${count} duplicate reference(s) outside the candidates were removed`;
  if (key === "removed_unverified_evidence") return `${count} unverifiable evidence quote(s) were removed`;
  return WARNING_TEXT[key] ?? w.replace(/_/g, " ");
}

export const INJECTION_PATTERN_LABEL: Record<string, string> = {
  ignore_instructions: "Asks to ignore instructions",
  role_override: "Tries to change the assistant's role",
  system_spoof: "Imitates system or delimiter text",
  tool_command: "Tells the assistant to label, close or comment",
  prompt_exfil: "Asks to reveal prompts or keys",
  hidden_html_comment: "Instructions hidden in an HTML comment",
  invisible_chars: "Invisible or bidirectional characters",
  long_base64: "Long encoded payload",
};
