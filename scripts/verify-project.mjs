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

async function verifyShipCodex(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  if ((await page.title()) !== "Ship Happens") throw new Error("The browser title is not Ship Happens.");
  await page.keyboard.press("Tab");
  const engageFocused = await page.evaluate(() => document.activeElement.id === "engage-prompt");
  if (!engageFocused) throw new Error("The splash action is not reachable by keyboard.");
  await page.keyboard.press("Enter");
  await page.getByText("Ship Happens", { exact: true }).waitFor();
  const menuOrder = await page.locator("#main-menu button").allTextContents();
  if (JSON.stringify(menuOrder.map((label) => label.trim())) !== JSON.stringify(["Skirmish", "Options", "Codex", "Credits"])) {
    throw new Error(`Main menu order is incorrect: ${JSON.stringify(menuOrder)}`);
  }
  await page.getByRole("button", { name: "Codex", exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/ship-happens-main-menu.png`, fullPage: true });
  const openButton = page.getByRole("button", { name: "Codex", exact: true });
  await openButton.click();
  const dialog = page.getByRole("dialog", { name: "Ship Codex", exact: true });
  await dialog.waitFor();
  await page.waitForFunction(() => document.querySelectorAll("#codex-fleet [data-ship-model]").length === 4);

  const result = await page.evaluate(() => Object.entries(NATIONS).map(([nation, ship]) => {
    const card = document.querySelector(`[data-codex-nation="${nation}"]`);
    const model = card.querySelector("[data-ship-model]");
    const image = model.getContext("2d").getImageData(0, 0, model.width, model.height).data;
    let hash = 2166136261, visibleShipPixels = 0;
    const colors = new Set();
    for (let i = 0; i < image.length; i += 4) {
      colors.add(`${image[i]},${image[i + 1]},${image[i + 2]}`);
      if (image[i] >= 45 && image[i + 1] >= 45 && image[i + 2] >= 45) visibleShipPixels++;
      hash = Math.imul(hash ^ image[i], 16777619);
      hash = Math.imul(hash ^ image[i + 1], 16777619);
      hash = Math.imul(hash ^ image[i + 2], 16777619);
      hash = Math.imul(hash ^ image[i + 3], 16777619);
    }
    const text = card.innerText.replaceAll(",", "").toLocaleUpperCase("en-US");
    const required = [
      ship.country, ship.doctrine,
      `${ship.main.turrets} × ${ship.main.barrels} (${ship.main.turrets * ship.main.barrels} total)`,
      `${ship.main.damage} / ${ship.main.damage * ship.main.barrels} dmg`,
      `${(ship.main.reload / 1000).toFixed(1)}s / ${ship.main.range}`,
      `${PLAYER_PROJECTILE_SPECS.main.speed} / tick · ${PLAYER_PROJECTILE_SPECS.main.radius}`,
      `${ship.secondary.turrets}`,
      `${ship.secondary.damage} / ${(ship.secondary.reload / 1000).toFixed(1)}s`,
      `${ship.secondary.range}`,
      `${PLAYER_PROJECTILE_SPECS.secondary.speed} / tick · ${PLAYER_PROJECTILE_SPECS.secondary.radius}`,
      `${ship.hull.health} HP`,
      `${ship.hull.accel.toFixed(3)} / tick`, "1 / 0 of 150", "×1.00"
    ];
    return {
      nation,
      modelPixels: visibleShipPixels,
      colors: colors.size,
      modelSignature: hash,
      sections: card.querySelectorAll(".codex-stat-section").length,
      ariaLabel: model.getAttribute("aria-label"),
      missingFields: required.filter(value => !text.includes(value.toLocaleUpperCase("en-US")))
    };
  }));
  const expectedNations = ["USA", "Japan", "Germany", "UK"];
  const signatures = new Set(result.map((ship) => ship.modelSignature));
  if (
    JSON.stringify(result.map((ship) => ship.nation)) !== JSON.stringify(expectedNations) ||
    result.some((ship) => ship.modelPixels < 100 || ship.colors < 10 || ship.sections !== 3 || !ship.ariaLabel || ship.missingFields.length > 0) ||
    signatures.size !== expectedNations.length
  ) {
    throw new Error(`Ship codex content or model rendering failed: ${JSON.stringify(result)}`);
  }

  await page.keyboard.press("Tab");
  const scrollFocused = await page.evaluate(() => document.activeElement.id === "codex-scroll");
  if (!scrollFocused) throw new Error("Tab did not move focus into the codex roster.");
  await page.keyboard.press("Shift+Tab");
  const backFocused = await page.evaluate(() => document.activeElement.id === "codex-back");
  await page.keyboard.press("Shift+Tab");
  const focusWrapped = await page.evaluate(() => document.activeElement.id === "codex-scroll");
  if (!backFocused || !focusWrapped) throw new Error("Keyboard focus did not cycle within the codex dialog.");
  await page.keyboard.press("Escape");
  if (!(await dialog.isHidden()) || !(await page.evaluate(() => document.activeElement.id === "open-codex-btn"))) {
    throw new Error("Escape did not close the codex and restore focus to its menu button.");
  }
  await page.keyboard.press("Enter");
  await dialog.waitFor();
  await page.screenshot({ path: `${outputDirectory}/ship-codex.png`, fullPage: true });
  await page.getByRole("button", { name: "Back to Command", exact: true }).click();
  await page.getByRole("button", { name: "Credits", exact: true }).waitFor();
  if (errors.length) throw new Error(`Ship codex browser errors: ${errors.join("; ")}`);
  await page.close();
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
  if (units.some((unit) => !unit?.moved || !unit?.approachedCombatRange || !unit?.staysNearCombatRange || !unit?.orbitInsideWeaponRange || !unit?.canFireAtOrbit || !unit?.smoothAcceleration || !unit?.smoothTurning || !unit?.forwardMovementAligned || !unit?.playerLeadApplied || !unit?.playerReactionSmooth || !unit?.stationaryCrosses || !unit?.reactsToLateralPlayerMovement || !unit?.movesToInterceptWhenPlayerRetreats || !unit?.separatesWhenPlayerCloses || !unit?.cooldownHoldsCommittedPlan || !unit?.cooldownAllowsTransition || !unit?.urgentSeparateInterrupts || !unit?.hardTurnIsRateLimited || !unit?.hardTurnSlowsDown || !unit?.hardTurnRemainsForward)) {
    throw new Error(`Enemy orbit verification failed: ${JSON.stringify(result)}`);
  }
  await page.close();
}

async function verifySecondaryArcs(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-secondary-arcs`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => window.__verifySecondaryArcs?.());
  if (!result || Object.values(result).some((passed) => !passed)) {
    throw new Error(`Secondary arc verification failed: ${JSON.stringify(result)}`);
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

async function verifyWave5LevelUp(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-wave5-levelup`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => window.__verifyWave5LevelUp?.());
  if (
    !result ||
    result.before.wave !== 5 ||
    result.before.gameState !== "UPGRADING" ||
    !result.before.menuVisible ||
    result.afterFirstClick.wave !== 5 ||
    result.afterFirstClick.gameState !== "PLAYING" ||
    result.afterFirstClick.menuVisible ||
    result.afterFirstClick.damageMult !== 1.2 ||
    result.afterSecondClick.damageMult !== result.afterFirstClick.damageMult ||
    result.afterSecondClick.gameState !== "PLAYING" ||
    result.afterSecondClick.menuVisible
  ) {
    throw new Error(`Wave 5 level-up verification failed: ${JSON.stringify(result)}`);
  }
  await page.screenshot({ path: `${outputDirectory}/wave5-levelup-fixed.png`, fullPage: true });
  await page.close();
}

async function verifyTouch(browser) {
  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Click to Engage", exact: true }).tap();
  await page.getByText("Ship Happens", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Codex", exact: true }).waitFor();
  await page.screenshot({ path: `${outputDirectory}/mobile-ship-happens-menu.png`, fullPage: true });
  await page.getByRole("button", { name: "Codex", exact: true }).tap();
  await page.getByRole("dialog", { name: "Ship Codex", exact: true }).waitFor();
  const mobileScroll = await page.locator("#codex-scroll").evaluate((element) => {
    const touchAction = getComputedStyle(element).touchAction;
    element.scrollTop = element.scrollHeight;
    const lastCard = document.querySelector(".codex-ship-card:last-child").getBoundingClientRect();
    const visibleRegion = element.getBoundingClientRect();
    return {
      touchScrollEnabled: touchAction.includes("pan-y"),
      scrolledToEnd: element.scrollTop > 0,
      lastShipReachable: lastCard.bottom > visibleRegion.top && lastCard.top < visibleRegion.bottom
    };
  });
  if (!mobileScroll.touchScrollEnabled || !mobileScroll.scrolledToEnd || !mobileScroll.lastShipReachable) {
    throw new Error(`Mobile codex scrolling failed: ${JSON.stringify(mobileScroll)}`);
  }
  await page.locator("#codex-scroll").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: `${outputDirectory}/mobile-ship-codex.png`, fullPage: true });
  await page.getByRole("button", { name: "Back to Command", exact: true }).tap();
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
    await verifyShipCodex(browser);
    await verifyDesktop(browser);
    await verifyDefeat(browser);
    await verifyIslandCollision(browser);
    await verifyEnemyOrbit(browser);
    await verifySecondaryArcs(browser);
    await verifyAnimationLoop(browser);
    await verifyWaveProgression(browser);
    await verifyWave5LevelUp(browser);
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
