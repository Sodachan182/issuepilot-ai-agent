import { expect, test } from "@playwright/test";
import path from "node:path";
import { seedAndAnalyze, setTheme } from "./helpers";

// Generates README screenshots from the running app (demo data only).
// Run: npx playwright test --grep @screenshots
const out = (name: string) => path.resolve(import.meta.dirname, "..", "..", "docs", "screenshots", `${name}.png`);

test.describe.configure({ mode: "serial" });

test("README screenshots @screenshots", async ({ page }) => {
  const repoId = await seedAndAnalyze(page);
  await page.goto("/repos");
  await setTheme(page, "light");

  await page.goto(`/repos/${repoId}/issues`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.screenshot({ path: out("inbox") });

  await page.goto(`/repos/${repoId}/issues/101`);
  await expect(page.getByText("Possible duplicates")).toBeVisible();
  await page.screenshot({ path: out("workspace") });

  await page.getByRole("button", { name: /Why\?/ }).click();
  await page.getByTitle("Show in the original issue").first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out("evidence") });

  await page.goto(`/repos/${repoId}/issues/103`);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Approve: Post comment" }).click();
  await expect(page.getByTestId("proposal-post_comment").getByText("Approved")).toBeVisible();
  await page.getByRole("button", { name: "Apply to GitHub" }).hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: out("injection-apply-blocked") });

  await page.goto("/reports");
  await expect(page.getByText("By category")).toBeVisible();
  await page.screenshot({ path: out("reports") });

  await setTheme(page, "dark");
  await page.goto(`/repos/${repoId}/issues/139`);
  await expect(page.getByText(/Possible prompt injection/)).toBeVisible();
  await page.screenshot({ path: out("workspace-dark") });
  await page.goto(`/repos/${repoId}/issues`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.screenshot({ path: out("inbox-dark") });

  await setTheme(page, "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/repos/${repoId}/issues/115`);
  await expect(page.getByLabel("Severity: critical")).toBeVisible();
  await page.screenshot({ path: out("mobile-workspace") });
});
