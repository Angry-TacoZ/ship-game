import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { chromium, devices } from "playwright";

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const outputDirectory = "output/playwright";

const server = createServer(async (_request, response) => {
  try {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(await readFile("index.html"));
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
});

function startServer() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
}

async function verifyDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  await page.locator("#gameCanvas").click({ button: "right", position: { x: 850, y: 360 } });
  await page.getByText("AUTOPILOT ENGAGED", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Configuration", exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/desktop-gameplay.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Configuration", exact: true }).waitFor({ state: "hidden" });
  if (errors.length) throw new Error(`Desktop browser errors: ${errors.join("; ")}`);
  await page.close();
}

async function verifyDefeat(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-defeat`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const invoked = await page.evaluate(() => { window.__verifyDefeat?.(); return typeof window.__verifyDefeat === "function"; });
  if (!invoked) throw new Error("Defeat verification hook was not installed.");
  await page.getByRole("heading", { name: "Mission Lost", exact: true }).waitFor();
  await page.getByText("Hull integrity depleted.", { exact: false }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/defeat-menu.png`, fullPage: true });
  await page.close();
}

async function verifyIslandCollision(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-island-collision`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => window.__verifyIslandCollision?.());
  if (
    !result ||
    !result.playerStopped ||
    !result.angledClear ||
    !result.enemyClear ||
    !result.playerHullClearance ||
    result.germanRenderLength !== 105 ||
    result.germanCollisionClearance <= result.germanRenderLength
  ) {
    throw new Error(`Island collision failed: ${JSON.stringify(result)}`);
  }
  await page.close();
}

async function verifyEnemyOrbit(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-enemy-orbit`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => window.__verifyEnemyOrbit?.());
  const units = [result?.destroyer, result?.ptBoat];
  if (units.some((unit) => !unit?.moved || !unit?.approachedCombatRange || !unit?.staysNearCombatRange || !unit?.shiftedOrbit || !unit?.orbitInsideWeaponRange || !unit?.canFireAtOrbit)) {
    throw new Error(`Enemy orbit verification failed: ${JSON.stringify(result)}`);
  }
  await page.close();
}

async function verifyAnimationLoop(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-animation-loop`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const starts = await page.evaluate(() => window.__verifyAnimationLoop?.());
  if (starts !== 1) throw new Error(`Expected one animation loop, got ${starts}`);
  await page.close();
}

async function verifyWaveProgression(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-wave-progression`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => {
    const verify = window.__verifyWaveProgression;
    return {
      wave1: verify.roster(1),
      wave2: verify.roster(2),
      wave5: verify.roster(5),
      outOfRange: verify.roster(6),
      beforeVictory: verify.state()
    };
  });
  if (
    !result.wave1.spawned ||
    JSON.stringify(result.wave1.counts) !== JSON.stringify({ PT_BOAT: 5 }) ||
    JSON.stringify(result.wave2.counts) !== JSON.stringify({ PT_BOAT: 6, DESTROYER: 2 }) ||
    JSON.stringify(result.wave5.counts) !== JSON.stringify({ PT_BOAT: 12, DESTROYER: 8 }) ||
    result.outOfRange.spawned !== false ||
    Object.keys(result.outOfRange.counts).length !== 0
  ) {
    throw new Error(`Wave roster verification failed: ${JSON.stringify(result)}`);
  }
  const finalState = await page.evaluate(() => {
    window.__verifyWaveProgression.completeFinalWave();
    return window.__verifyWaveProgression.state();
  });
  if (finalState.wave !== 5 || finalState.gameState !== "WAVE_END" || !finalState.victoryVisible) {
    throw new Error(`Final wave verification failed: ${JSON.stringify(finalState)}`);
  }
  await page.close();
}

async function verifyTouch(browser) {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).tap();
  await page.getByRole("button", { name: "Skirmish", exact: true }).tap();
  await page.getByRole("button", { name: /US NAVY/ }).tap();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/mobile-gameplay.png`, fullPage: true });
  if (errors.length) throw new Error(`Mobile browser errors: ${errors.join("; ")}`);
  await context.close();
}

await mkdir(outputDirectory, { recursive: true });

try {
  await startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyDesktop(browser);
    await verifyDefeat(browser);
    await verifyIslandCollision(browser);
    await verifyEnemyOrbit(browser);
    await verifyAnimationLoop(browser);
    await verifyWaveProgression(browser);
    await verifyTouch(browser);
  } finally {
    await browser.close();
  }
  console.log("VERIFY RESULT: PASS");
} catch (error) {
  console.error(`VERIFY RESULT: FAIL - ${error.message}`);
  process.exitCode = 1;
} finally {
  server.close();
}
