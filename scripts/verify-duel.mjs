import assert from "node:assert/strict";
import { devices } from "playwright";

export async function verifyDuel(browser, baseUrl, output) {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/duel.html?verify-duel`);
  await page.waitForFunction(() => !!window.__duel);
  for (const scene of ["bow", "broadside", "modules"]) {
    await page.evaluate((name) => window.__duel.scene(name), scene);
    await page.screenshot({
      path: `${output}/duel-${scene}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Run duel", exact: false }).click();
  await page.evaluate(() => window.advanceTime(120000));
  await page.locator("#results").waitFor({ state: "visible" });
  const control = await page.evaluate(() => window.__duel.runner.summary());
  assert.equal(control.status, "COMPLETE");
  assert.ok(control.ships.every((s) => s.shots > 0));
  await page.screenshot({ path: `${output}/duel-result.png`, fullPage: true });
  await page
    .getByRole("button", { name: "Restart same seed", exact: true })
    .click();
  await page.evaluate(() => window.advanceTime(120000));
  const repeated = await page.evaluate(() => window.__duel.runner.summary());
  assert.equal(repeated.winner, control.winner);
  assert.deepEqual(repeated.ships, control.ships);
  await page
    .getByRole("button", { name: "Run mirrored trial", exact: true })
    .click();
  await page.evaluate(() => window.advanceTime(120000));
  const mirrored = await page.evaluate(() => window.__duel.runner.summary());
  assert.equal(mirrored.winner, control.winner);
  assert.equal(mirrored.ships[0].startingSide, "B");
  assert.ok(
    await page
      .locator("#alpha .track-panel")
      .innerText()
      .then((t) => t.includes("Est. speed")),
  );
  assert.equal(await page.locator("#arena").evaluate((c) => c.width), 2200);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`${output}/duel-control.json`);
  await page.selectOption("#mode", "MOCK");
  await page.selectOption("#delay", "500");
  await page.getByRole("button", { name: "Run duel", exact: false }).click();
  await page.waitForFunction(() => !!window.__duel.runner.pending);
  await page.evaluate(() => window.__duel.refresh());
  await page.locator("#bravo .pending").waitFor();
  await page.screenshot({ path: `${output}/duel-pending.png`, fullPage: true });
  await page.waitForFunction(() => !!window.__duel.runner.latest.bravo);
  const applied = await page.evaluate(() => window.__duel.runner.latest.bravo);
  assert.ok(applied.stateAgeAtApplyMs >= 600);
  assert.equal(applied.injectedDelayMs, 500);
  await page.evaluate(() => window.__duel.refresh());
  await page.screenshot({ path: `${output}/duel-applied.png`, fullPage: true });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.__duel.runner.sim.status),
    "INVALID",
  );
  // Native keyboard activation and focus survive the frequently refreshed observer panels.
  await page.locator("#restart").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.evaluate(() => window.__duel.runner.sim.status),
    "RUNNING",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const oldSeed = await page.inputValue("#seed");
  await page.getByRole("button", { name: "New seed", exact: true }).click();
  assert.notEqual(await page.inputValue("#seed"), oldSeed);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Summary CSV", exact: true }).click();
  assert.ok((await csvPromise).suggestedFilename().endsWith(".csv"));
  await page.selectOption("#contender", "alpha");
  await page.selectOption("#scenario", "CROSSING");
  await page.locator("#restart").click();
  await page.waitForFunction(
    () => !!window.__duel.runner.latest.alpha?.answers,
  );
  assert.equal(
    await page.evaluate(() => window.__duel.runner.latest.alpha.controller),
    "MOCK_DELAYED_RULES",
  );
  assert.match(await page.locator("#legend-alpha").innerText(), /MOCK/);
  assert.equal(
    await page.evaluate(() => window.__duel.runner.summary().scenario),
    "CROSSING",
  );
  await page.locator("#stop").click();
  assert.deepEqual(errors, []);
  await page.close();
  // Exercise the LIVE browser path with an intercepted local proxy, never the provider.
  const live = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  live.on("pageerror", (e) => errors.push(e.message));
  await live.route("**/api/config", (route) =>
    route.fulfill({
      json: { liveEnabled: true, model: "MOCK_HTTP_FIXTURE", token: "test" },
    }),
  );
  await live.route("**/api/jev/decision", async (route) => {
    const { providerRequest } = await import("../server/jev.js");
    const { deterministicPolicy } = await import("../duel/policy.js");
    const { planKey } = await import("../duel/config.js");
    const snapshot = route.request().postDataJSON().snapshot;
    const action = deterministicPolicy(snapshot).action,
      questions = providerRequest(snapshot, "jev-1.13.0").questions;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      json: {
        model: "MOCK_HTTP_FIXTURE",
        usage: { input_tokens: 100, output_tokens: 20 },
        providerLatencyMs: 120,
        answers: Object.fromEntries(
          Object.entries(questions).map(([key, q]) => [
            key,
            {
              type: "choice",
              choice: planKey(action),
              confidence: 1,
              probabilities: Object.fromEntries(
                Object.keys(q.criteria).map((o) => [
                  o,
                  o === planKey(action) ? 1 : 0,
                ]),
              ),
            },
          ]),
        ),
      },
    });
  });
  await live.goto(`${baseUrl}/duel.html?verify-duel`);
  await live.waitForFunction(
    () => !document.querySelector("#mode option[value=JEV]").disabled,
  );
  await live.selectOption("#mode", "JEV");
  await live.selectOption("#delay", "500");
  await live.getByRole("button", { name: "Run duel", exact: false }).click();
  await live.waitForFunction(() => !!window.__duel.runner.pending);
  await live.evaluate(() => window.__duel.refresh());
  await live.screenshot({
    path: `${output}/duel-jev-pending.png`,
    fullPage: true,
  });
  await live.waitForFunction(() => !!window.__duel.runner.latest.bravo);
  await live.evaluate(() => window.__duel.refresh());
  await live.locator("#bravo summary").click();
  await live.screenshot({
    path: `${output}/duel-jev-applied.png`,
    fullPage: true,
  });
  await live.locator("#stop").click();
  await live.selectOption("#contender", "alpha");
  await live.locator("#restart").click();
  await live.waitForFunction(
    () => !!window.__duel.runner.latest.alpha?.answers,
  );
  assert.equal(
    await live.evaluate(() => window.__duel.runner.latest.alpha.controller),
    "JEV",
  );
  assert.match(await live.locator("#legend-alpha").innerText(), /JEV/);
  assert.equal(
    await live.evaluate(() => {
      try {
        window.advanceTime(1000);
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await live.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(
    await live.evaluate(() => window.__duel.runner.sim.status),
    "INVALID",
  );
  assert.deepEqual(errors, []);
  await live.close();
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await context.newPage();
  await mobile.goto(`${baseUrl}/duel.html?verify-duel`);
  await mobile.getByRole("button", { name: "Run duel", exact: false }).tap();
  await mobile.waitForFunction(() => window.__duel?.runner.sim.timeMs > 100);
  await mobile.getByRole("button", { name: "Stop", exact: true }).tap();
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.screenshot({
    path: `${output}/duel-mobile.png`,
    fullPage: true,
  });
  await context.close();
  console.log(
    "DUEL BROWSER: PASS (controls, mirrored replay, exports, pending/applied, keyboard, touch)",
  );
}
