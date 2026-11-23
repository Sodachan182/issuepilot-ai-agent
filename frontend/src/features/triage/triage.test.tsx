import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../components/ui/primitives";
import type { Proposal } from "../../lib/types";
import { DraftReplyEditor } from "./DraftReplyEditor";
import { ApplyDialog, ProposalBar } from "./ProposalBar";

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 1,
    analysis_id: 1,
    issue_id: 1,
    repository_id: 1,
    type: "post_comment",
    payload: { body: "Thanks for the report." },
    original_payload: { body: "Thanks for the report." },
    edited: false,
    status: "proposed",
    reject_reason: null,
    github_ref: null,
    error: null,
    created_at: "2026-11-23T10:00:00Z",
    decided_at: null,
    applied_at: null,
    ...over,
  };
}

type Route = (url: string, init?: RequestInit) => unknown;

function mockFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = route(url, init);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("DraftReplyEditor (T-FE-06)", () => {
  it("edits, counts characters, saves and cancels", async () => {
    const onSave = vi.fn();
    const onEditing = vi.fn();
    const { rerender } = render(
      <DraftReplyEditor proposal={proposal()} draft="" editing={false} onEditingChange={onEditing} onSave={onSave} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onEditing).toHaveBeenCalledWith(true);
    rerender(<DraftReplyEditor proposal={proposal()} draft="" editing onEditingChange={onEditing} onSave={onSave} />);
    const box = screen.getByLabelText("Draft reply");
    await userEvent.clear(box);
    await userEvent.type(box, "Which version?");
    expect(screen.getByText("14 / 2,000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith("Which version?");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onEditing).toHaveBeenLastCalledWith(false);
  });
  it("shows the original suggestion for edited proposals", async () => {
    render(
      <DraftReplyEditor
        proposal={proposal({ edited: true, payload: { body: "New" }, original_payload: { body: "Original text" } })}
        draft=""
        editing={false}
        onEditingChange={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText("Edited")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View original suggestion" }));
    expect(screen.getByText("Original text")).toBeInTheDocument();
  });
});

describe("ProposalBar (T-FE-07)", () => {
  it("disables Apply with reasons when the policy denies writes", async () => {
    mockFetch(() => ({
      allowed: false,
      reasons: [{ code: "DEMO_REPO", message: "Demo repository: writes are not possible." }],
    }));
    renderWithClient(
      <ProposalBar proposals={[proposal({ status: "approved" })]} repoFullName="demo/acme-widgets" issueNumber={101} onChanged={() => {}} />,
    );
    const apply = screen.getByRole("button", { name: "Apply to GitHub" });
    expect(apply).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(screen.getByText(/Demo repository: writes are not possible/)).toBeInTheDocument());
    await userEvent.click(apply);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enables Apply when a proposal is approved and policy allows", async () => {
    mockFetch(() => ({ allowed: true, reasons: [] }));
    renderWithClient(
      <ProposalBar proposals={[proposal({ status: "approved" })]} repoFullName="me/lib" issueNumber={7} onChanged={() => {}} />,
    );
    const apply = screen.getByRole("button", { name: "Apply to GitHub" });
    await waitFor(() => expect(apply).toHaveAttribute("aria-disabled", "false"));
  });

  it("requires approval before applying", async () => {
    mockFetch(() => ({ allowed: false, reasons: [{ code: "PROPOSAL_NOT_APPROVED", message: "Approve first" }] }));
    renderWithClient(<ProposalBar proposals={[proposal()]} repoFullName="me/lib" issueNumber={7} onChanged={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Approve at least one proposal first/)).toBeInTheDocument());
  });
});

describe("ApplyDialog (T-FE-08)", () => {
  it("keeps confirm disabled until the exact repo#number is typed, supports dry run", async () => {
    const fetchMock = mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return {
        status: body.dry_run ? "approved" : "applied",
        dry_run: body.dry_run,
        planned_request: { method: "POST", url: "https://api.github.com/repos/me/lib/issues/7/comments", body: { body: "hi" } },
        github_ref: "https://github.com/me/lib/issues/7#c1",
        proposal: proposal({ status: "approved" }),
      };
    });
    const onApplied = vi.fn();
    renderWithClient(
      <ApplyDialog
        open
        onOpenChange={() => {}}
        proposals={[proposal({ status: "approved" })]}
        repoFullName="me/lib"
        issueNumber={7}
        onApplied={onApplied}
      />,
    );
    const applyBtn = screen.getByRole("button", { name: "Apply 1 change" });
    expect(applyBtn).toBeDisabled();
    const input = screen.getByLabelText(/to confirm/);
    await userEvent.type(input, "me/lib#70");
    expect(applyBtn).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "me/lib#7");
    expect(applyBtn).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Dry run" }));
    await waitFor(() => expect(screen.getByText(/Nothing was sent/)).toBeInTheDocument());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ confirm: "me/lib#7", dry_run: true });
    await userEvent.click(applyBtn);
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ confirm: "me/lib#7", dry_run: false });
  });
});
