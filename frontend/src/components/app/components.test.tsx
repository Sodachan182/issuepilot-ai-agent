import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { describeWarning, parseDate, relativeTime } from "../../lib/format";
import { applyTheme } from "../../lib/theme";
import { TooltipProvider } from "../ui/primitives";
import { CategoryChip, ModeBadge, PriorityTag, SeverityIndicator } from "./badges";
import { MarkdownView } from "./MarkdownView";
import { EvidenceDisclosure } from "../../features/triage/EvidenceDisclosure";
import { ApiError } from "../../lib/api";
import { ErrorState } from "./states";

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("ModeBadge (T-FE-01)", () => {
  it("labels heuristic output as rule-based and never as AI", () => {
    wrap(<ModeBadge mode="heuristic" />);
    expect(screen.getByText("Heuristic (rule-based)")).toBeInTheDocument();
    expect(screen.queryByText(/AI/)).not.toBeInTheDocument();
  });
  it("shows the model id for AI output", () => {
    wrap(<ModeBadge mode="ai" model="gemini-x-flash" providerLabel="Gemini" />);
    expect(screen.getByText("AI · gemini-x-flash")).toBeInTheDocument();
  });
  it("includes the gateway name for OpenAI-compatible providers", () => {
    wrap(<ModeBadge mode="ai" model="m1" providerLabel="ShopAIKey" />);
    expect(screen.getByText("AI · ShopAIKey · m1")).toBeInTheDocument();
  });
});

describe("Triage attribute chips (T-FE-02)", () => {
  it("exposes accessible names", () => {
    render(
      <>
        <CategoryChip category="feature_request" />
        <SeverityIndicator severity="high" />
        <PriorityTag priority="P1" />
      </>,
    );
    expect(screen.getByLabelText("Category: Feature Request")).toBeInTheDocument();
    expect(screen.getByLabelText("Severity: high")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority: P1")).toBeInTheDocument();
  });
  it("fills bars according to severity", () => {
    const { container } = render(<SeverityIndicator severity="high" />);
    const opaque = [...container.querySelectorAll("rect")].filter((r) => r.getAttribute("opacity") === "1");
    expect(opaque).toHaveLength(3);
  });
});

describe("MarkdownView (T-FE-05)", () => {
  it("does not render raw HTML or scripts", () => {
    const { container } = render(
      <MarkdownView
        source={'Hello <script>alert(1)</script> <img src=x onerror="alert(2)"> [x](javascript:alert(3))'}
        showImages
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const link = container.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });
  it("hardens links and hides images until requested", async () => {
    const onShow = vi.fn();
    const { container } = render(
      <MarkdownView source={"[docs](https://example.com) ![chart](https://tracker.example/p.png)"} showImages={false} onShowImages={onShow} />,
    );
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAttribute("target", "_blank");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/image hidden/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show images" }));
    expect(onShow).toHaveBeenCalled();
  });
  it("highlights evidence quotes", () => {
    const { container } = render(
      <MarkdownView source="The export crashes for every name." highlights={[{ text: "export crashes", kind: "evidence", id: "active" }]} showImages={false} />,
    );
    expect(container.querySelector("mark[data-highlight='active']")?.textContent).toBe("export crashes");
  });
});

describe("EvidenceDisclosure (T-FE-04)", () => {
  it("is collapsed by default, toggles with keyboard and reports quote clicks", async () => {
    const onQuote = vi.fn();
    render(<EvidenceDisclosure evidence={[{ claim: "severity: high", quote: "it crashes", source: "body" }]} onQuoteClick={onQuote} />);
    const toggle = screen.getByRole("button", { name: /Why\?/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("it crashes")).not.toBeInTheDocument();
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByText("it crashes"));
    expect(onQuote).toHaveBeenCalledWith(expect.objectContaining({ quote: "it crashes" }));
  });
});

describe("ErrorState (T-FE-11)", () => {
  it("renders a rate-limit notice with the reset time", () => {
    render(<ErrorState error={new ApiError(429, "GITHUB_RATE_LIMITED", "x", { reset_at: "2026-11-23T14:05:00Z" })} />);
    expect(screen.getByText(/GitHub rate limit reached/)).toBeInTheDocument();
  });
  it("lists write-policy reasons", () => {
    render(
      <ErrorState
        error={new ApiError(409, "WRITE_BLOCKED", "Blocked", { reasons: [{ code: "WRITE_DISABLED", message: "Writes are disabled." }] })}
      />,
    );
    expect(screen.getByText("Writes are disabled.")).toBeInTheDocument();
    expect(screen.getByText("WRITE_BLOCKED")).toBeInTheDocument();
  });
});

describe("format helpers", () => {
  it("treats timestamps without zone as UTC", () => {
    expect(parseDate("2026-11-23T10:00:00")?.toISOString()).toBe("2026-11-23T10:00:00.000Z");
  });
  it("formats relative time", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(relativeTime("2026-11-23T11:00:00Z", now)).toBe("1h ago");
    expect(relativeTime("2026-11-20T12:00:00Z", now)).toBe("3d ago");
    expect(relativeTime(null, now)).toBe("—");
  });
  it("describes guard warnings in plain language", () => {
    expect(describeWarning("removed_unknown_labels:2")).toMatch(/2 suggested label/);
    expect(describeWarning("possible_prompt_injection")).toMatch(/prompt-injection/);
  });
});

describe("theme (T-FE-10)", () => {
  it("applies the dark class", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
  it("persists the choice via the theme toggle", async () => {
    const { ThemeToggle } = await import("./AppShell");
    wrap(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /Theme: system/ }));
    expect(localStorage.getItem("issuepilot.theme")).toBe("light");
  });
});
