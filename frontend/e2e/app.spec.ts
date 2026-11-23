import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, seedAndAnalyze, setTheme } from "./helpers";

test.describe.configure({ mode: "serial" });

let repoId: number;

test("E2E-01: first run shows the empty state, then loads the demo", async ({ page }) => {
  await page.goto("/repos");
  await expect(page.getByText("Connect a GitHub repository to start triaging.")).toBeVisible();
  await page.getByRole("button", { name: "Load demo workspace" }).first().click();
  await expect(page).toHaveURL(/\/repos\/\d+\/issues$/);
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(40);
  repoId = Number(page.url().match(/repos\/(\d+)/)![1]);
});

test("E2E-02: batch analysis completes and is labelled heuristic", async ({ page }) => {
  await page.goto(`/repos/${repoId}/issues`);
  await expect(page.getByText("Heuristic mode")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const button = page.getByRole("button", { name: /Analyze untriaged \(\d+\)/ });
    await expect(button).toHaveAttribute("aria-disabled", "false");
    await button.click();
    await expect(page.getByText(/Analyzed \d+ issues/)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Analyze untriaged (0)" })).toBeVisible();
  await expect(page.locator("tbody").getByText("Not analyzed")).toHaveCount(0);
  await expect(page.locator("tbody").getByLabel(/^Category: /)).toHaveCount(40);
  await expect(page.locator("main").getByText(/^AI ·/)).toHaveCount(0);
});

test("E2E-03: workspace shows provenance and verifiable evidence", async ({ page }) => {
  await page.goto(`/repos/${repoId}/issues/115`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("corrupts the file");
  await expect(page.getByText("Heuristic (rule-based)").first()).toBeVisible();
  await expect(page.getByLabel("Severity: critical")).toBeVisible();
  await page.getByRole("button", { name: /Why\?/ }).click();
  await page.getByTitle("Show in the original issue").first().click();
  await expect(page.locator("mark[data-highlight='active']")).toBeVisible();
});

test("E2E-04: injection sample is flagged and does not raise severity", async ({ page }) => {
  await page.goto(`/repos/${repoId}/issues?flag=injection`);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.goto(`/repos/${repoId}/issues/103`);
  await expect(page.getByText(/Possible prompt injection/)).toBeVisible();
  await expect(page.getByLabel("Category: Documentation")).toBeVisible();
  await expect(page.getByLabel("Severity: critical")).toHaveCount(0);
  await expect(page.getByLabel("Priority: P0")).toHaveCount(0);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.locator("mark.ip-injection").first()).toBeVisible();
});

test("E2E-05: duplicates list partner and compare sheet opens", async ({ page }) => {
  await page.goto(`/repos/${repoId}/issues/133`);
  await expect(page.getByText("#112", { exact: true })).toBeVisible();
  await expect(page.getByText("Likely duplicate")).toBeVisible();
  await page.getByRole("button", { name: "Compare" }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Regression in 2.4.0: Modal no longer closes on Escape")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("E2E-06/07: edit, approve, and apply stays blocked for demo data", async ({ page }) => {
  let applyCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/apply")) applyCalls += 1;
  });
  await page.goto(`/repos/${repoId}/issues/101`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const box = page.getByRole("textbox", { name: "Draft reply" });
  await box.fill("Thanks! Could you confirm whether 2.3.1 is also affected?");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Edited", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve: Post comment" }).click();
  await expect(page.getByTestId("proposal-post_comment").getByText("Approved")).toBeVisible();
  const apply = page.getByRole("button", { name: "Apply to GitHub" });
  await expect(apply).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Demo repository: writes are not possible/).first()).toBeVisible();
  await apply.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(applyCalls).toBe(0);

  await page.goto("/history");
  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page.locator("ol").getByText("proposal_edited").first()).toBeVisible();
  await expect(page.locator("ol").getByText("proposal_approved").first()).toBeVisible();
});

test("E2E-08: keyboard-only navigation", async ({ page }) => {
  await page.goto(`/repos/${repoId}/issues`);
  await page.locator("tbody tr").first().focus();
  await page.keyboard.press("j");
  await expect(page.locator("tbody tr").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/issues\/140/);
  await expect(page.getByRole("button", { name: "Next issue" })).toBeEnabled();
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/\/issues\/139/);
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await page.keyboard.press("h");
  await expect(page).toHaveURL(/\/history$/);
});

test("E2E-09: theme toggle persists across reloads", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("E2E-10: responsive layout has no horizontal scroll at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [`/repos/${repoId}/issues`, `/repos/${repoId}/issues/101`, "/reports", "/history", "/settings"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.goto(`/repos/${repoId}/issues/101`);
  await page.getByRole("tab", { name: "Issue" }).click();
  await expect(page.getByText("Steps to reproduce")).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});

test("E2E-11: reports render real counts and export with disclaimer", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByText("Issues analyzed")).toBeVisible();
  await expect(page.getByText("Counts reflect IssuePilot suggestions, not verified ground truth.")).toBeVisible();
  const md = await page.request.get(`/api/reports/export?repository_id=${repoId}&format=md`);
  expect(await md.text()).toContain("not verified ground truth");
});

test("E2E-12: backend outage shows a banner", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/repos");
  await expect(page.getByText("Can't reach the IssuePilot backend at 127.0.0.1:8000.").first()).toBeVisible({ timeout: 15_000 });
});

test("E2E-13: accessibility (axe) in light and dark themes", async ({ page }) => {
  const pages = ["/repos", `/repos/${repoId}/issues`, `/repos/${repoId}/issues/101`, "/history", "/reports", "/settings"];
  for (const theme of ["light", "dark"] as const) {
    await page.goto("/repos");
    await setTheme(page, theme);
    for (const url of pages) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await expectNoSeriousA11yViolations(page, `${theme} ${url}`);
    }
  }
});

test("API helper sanity", async ({ page }) => {
  // Re-seeding is idempotent and analysis endpoints stay consistent.
  const id = await seedAndAnalyze(page);
  expect(id).toBe(repoId);
});
