import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function seedAndAnalyze(page: Page): Promise<number> {
  const seed = await page.request.post("/api/demo/seed");
  expect(seed.ok()).toBeTruthy();
  const { repository_id } = await seed.json();
  for (let i = 0; i < 3; i++) {
    const r = await page.request.post("/api/analyses", { data: { repository_id, scope: "untriaged" } });
    if (r.status() === 409) break;
    expect(r.status()).toBe(202);
    const { run_id } = await r.json();
    await expect
      .poll(async () => (await (await page.request.get(`/api/runs/${run_id}`)).json()).status, { timeout: 20_000 })
      .not.toBe("running");
  }
  return repository_id;
}

export async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes) ${v.nodes[0]?.target}`);
  expect(serious, `${label}\n${summary.join("\n")}`).toEqual([]);
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("issuepilot.theme", t), theme);
  await page.reload();
}
