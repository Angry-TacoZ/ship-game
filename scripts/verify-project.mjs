import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, devices } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.SHIP_GAME_VERIFY_PORT || 4173);
const baseUrl = `http://${host}:${port}`;
const outputDirectory = "output/playwright";

const server = createServer(async (_request, response) => {
  try {
    const pathname = new URL(_request.url, baseUrl).pathname;
    const files = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/index.html': ['index.html', 'text/html; charset=utf-8'],
      '/naval-art.js': ['naval-art.js', 'text/javascript; charset=utf-8'],
      '/assets/art/ocean.png': ['assets/art/ocean.png', 'image/png'],
      '/assets/art/island.png': ['assets/art/island.png', 'image/png'],
      '/assets/art/island-lowland.png': ['assets/art/island-lowland.png', 'image/png'],
      '/assets/art/island-spine.png': ['assets/art/island-spine.png', 'image/png'],
      '/assets/art/ship-deck.png': ['assets/art/ship-deck.png', 'image/png']
    };
    const file = files[pathname];
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    const bytes = await readFile(file[0]);
    response.writeHead(200, { 'content-type': file[1] });
    response.end(bytes);
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
      `${getPlayerShellSpeed(nation, 'main').toLocaleString('en-US')} / tick · ${PLAYER_PROJECTILE_SPECS.main.radius}`,
      `${(PLAYER_PROJECTILE_SPECS.main.spread * 180 / Math.PI).toLocaleString('en-US')}°`,
      `${ship.secondary.turrets}`,
      `${ship.secondary.damage} / ${(ship.secondary.reload / 1000).toFixed(1)}s`,
      `${ship.secondary.range}`,
      `${getPlayerShellSpeed(nation, 'secondary').toLocaleString('en-US')} / tick · ${PLAYER_PROJECTILE_SPECS.secondary.radius}`,
      `${(PLAYER_PROJECTILE_SPECS.secondary.spread * 180 / Math.PI).toLocaleString('en-US')}°`,
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

async function verifyNationShellSpeeds(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Click to Engage', { exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.getByRole('button', { name: /US NAVY/ }).click();
  await page.getByText('BATTLESHIP', { exact: true }).waitFor();
  const result = await page.evaluate(() => {
    gameState = 'PAUSED';
    enemies = [];
    islands = [];
    const step = 1000 / 60;
    return ['USA', 'UK', 'Germany', 'Japan'].map(nation => {
      const ship = new Player(nation);
      ship.angle = ship.turretAngle = 0;
      // Hull-speed refits must not change shell velocity.
      ship.speedMult = 2;
      return ['main', 'secondary'].map(battery => {
        projectiles = [];
        if (battery === 'main') ship.fireMain(0);
        else ship.fireSec(0, { x: 1000, y: 32 });
        const shell = projectiles[0];
        const origin = { x: shell.x, y: shell.y };
        const speeds = projectiles.map(p => Math.hypot(p.vx, p.vy));
        for (let frame = 0; frame < 60; frame++) shell.update(step);
        const distanceAfterSecond = Math.hypot(shell.x - origin.x, shell.y - origin.y);
        let frames = 60;
        while (Math.hypot(shell.x - origin.x, shell.y - origin.y) < 2000 && frames < 480) {
          shell.update(step);
          frames++;
        }
        const travelTime = frames * step;
        const rangeReachable = speeds[0] * (8000 / 16.6) >= ship.config[battery].range;
        return { nation, battery, speeds, count: projectiles.length, damage: shell.damage,
          size: shell.size, distanceAfterSecond, travelTime, rangeReachable,
          expectedCount: battery === 'main' ? ship.config.main.barrels : 1,
          expectedDamage: ship.config[battery].damage,
          expectedSize: PLAYER_PROJECTILE_SPECS[battery].radius };
      });
    }).flat();
  });
  const multipliers = { USA: 1, UK: 13 / 12, Germany: 7 / 6, Japan: 1.25 };
  for (const battery of ['main', 'secondary']) {
    const shots = result.filter(shot => shot.battery === battery);
    const baseSpeed = battery === 'main' ? 11 : 15;
    for (const [index, shot] of shots.entries()) {
      const expectedSpeed = baseSpeed * multipliers[shot.nation];
      if (shot.speeds.some(speed => Math.abs(speed - expectedSpeed) > 1e-9) ||
          Math.abs(shot.distanceAfterSecond - expectedSpeed * (1000 / 16.6)) > 1e-7 ||
          shot.count !== shot.expectedCount || shot.damage !== shot.expectedDamage ||
          shot.size !== shot.expectedSize || !shot.rangeReachable ||
          (index > 0 && shot.travelTime >= shots[index - 1].travelTime)) {
        throw new Error(`Nation shell velocity regression: ${JSON.stringify(shot)}`);
      }
    }
    const spread = shots[3].distanceAfterSecond / shots[0].distanceAfterSecond;
    if (Math.abs(spread - 1.25) > 1e-9) throw new Error(`${battery} shell spread was ${spread}`);
  }
  if (errors.length) throw new Error(`Ballistics browser errors: ${errors.join('; ')}`);
  console.log(`NATION SHELL SPEEDS: ${JSON.stringify(result)}`);
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

async function verifyRefits(browser, touch = false) {
  const context = await browser.newContext(touch ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Click to Engage', exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.getByRole('button', { name: /US NAVY/ }).click();
  const offers = await page.evaluate(() => {
    wave = 5;
    enemies[0].x = 10000;
    enemies = [enemies[0]];
    window.__testOffer = seed => {
      gameState = 'PLAYING';
      seed = Math.imul(seed, 2654435761) >>> 0;
      const random = Math.random;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      try { showLevelUp(); } finally { Math.random = random; }
      return [...document.querySelectorAll('#levelup-choices h3')].map(heading => heading.textContent);
    };
    window.__testAccuracyOffer = battery => {
      const title = `${battery === 'main' ? 'Main' : 'Secondary'} Battery Accuracy`;
      for (let seed = 1; seed <= 100; seed++) if (window.__testOffer(seed).includes(title)) return true;
      return false;
    };
    window.__testSpread = () => {
      const random = Math.random;
      const ship = player;
      ship.angle = ship.turretAngle = 0;
      const result = {};
      try {
        for (const battery of ['main', 'secondary']) {
          const angles = [];
          for (const sample of [0, 0.999999]) {
            Math.random = () => sample;
            projectiles = [];
            if (battery === 'main') ship.fireMain(0);
            else ship.fireSec(0, { x: ship.x + 1000, y: ship.y + 32 });
            angles.push(Math.atan2(projectiles[0].vy, projectiles[0].vx));
          }
          result[battery] = angles[1] - angles[0];
        }
      } finally { Math.random = random; }
      projectiles = [];
      return result;
    };
    const results = Array.from({ length: 100 }, (_, i) => window.__testOffer(i + 1));
    const heldOffer = results[results.length - 1];
    showLevelUp();
    return { results, held: JSON.stringify(heldOffer) === JSON.stringify([...document.querySelectorAll('#levelup-choices h3')].map(h => h.textContent)) };
  });
  const pool = ['Advanced Ballistics', 'Automated Hoists', 'Reinforced Bulkheads', 'Main Battery Accuracy', 'Secondary Battery Accuracy'];
  if (!offers.held || offers.results.some(offer => offer.length !== 3 || new Set(offer).size !== 3 || offer.some(title => !pool.includes(title))) ||
      new Set(offers.results.map(offer => [...offer].sort().join('|'))).size !== 10) {
    throw new Error(`Random refits failed: held=${offers.held}, combinations=${new Set(offers.results.map(offer => [...offer].sort().join('|'))).size}`);
  }
  if (!touch) {
    await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate(() => document.activeElement === document.querySelector('#levelup-choices button:last-child')))) throw new Error('Refit reverse focus wrap failed.');
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.activeElement === document.querySelector('#levelup-choices button')))) throw new Error('Refit focus wrap failed.');
  }
  const baseline = await page.evaluate(() => window.__testSpread());
  if (Math.abs(baseline.main - 0.04 * 0.999999) > 1e-9 || Math.abs(baseline.secondary / baseline.main - 0.5) > 1e-9) throw new Error('Starting spread cones are incorrect.');
  for (const battery of ['main', 'secondary']) {
    const before = await page.evaluate(() => window.__testSpread());
    for (let pick = 1; pick <= 2; pick++) {
      if (!(await page.evaluate(battery => window.__testAccuracyOffer(battery), battery))) throw new Error(`Could not offer ${battery} accuracy.`);
      const choice = page.getByRole('button', { name: new RegExp(`^${battery === 'main' ? 'Main' : 'Secondary'} Battery Accuracy`) });
      await page.screenshot({ path: `${outputDirectory}/${touch ? 'mobile' : 'desktop'}-accuracy-refits.png`, fullPage: true });
      if (touch) await choice.tap();
      else if (pick === 1) { await choice.focus(); await page.keyboard.press('Space'); }
      else await choice.click();
      const after = await page.evaluate(() => ({ spread: window.__testSpread(), wave, gameState, focus: document.activeElement.id }));
      const other = battery === 'main' ? 'secondary' : 'main';
      if (Math.abs(after.spread[battery] / before[battery] - 0.95 ** pick) > 1e-9 ||
          Math.abs(after.spread[other] - before[other]) > 1e-9 || after.wave !== 5 || after.gameState !== 'PLAYING' || after.focus !== 'gameCanvas') {
        throw new Error(`Accuracy stacking or battery isolation failed: ${JSON.stringify(after)}`);
      }
    }
  }
  const reset = await page.evaluate(() => { startGame(); gameState = 'PAUSED'; return [player.mainSpreadMult, player.secondarySpreadMult]; });
  if (reset.some(value => value !== 1)) throw new Error('Accuracy refits carried into a new run.');
  if (errors.length) throw new Error(`Refit browser errors: ${errors.join('; ')}`);
  await context.close();
}

async function verifyRefitWaveContinuation(browser) {
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Click to Engage', { exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.getByRole('button', { name: /US NAVY/ }).click();
  for (let currentWave = 1; currentWave <= 4; currentWave++) {
    const resumed = await page.evaluate(currentWave => {
      wave = currentWave;
      spawnWave(wave);
      gameState = 'PLAYING';
      enemies[0].health = 77;
      const survivors = enemies;
      const target = enemies[0];
      player.xp = player.xpToNext;
      player.update(TIME_STEP);
      const pausedForRefit = gameState === 'UPGRADING';
      const choice = document.querySelector('#levelup-choices button');
      choice.click();
      const refits = () => [player.damageMult, player.reloadMult, player.maxHealth, player.mainSpreadMult, player.secondarySpreadMult];
      const afterFirst = refits();
      choice.click();
      const result = { wave, pausedForRefit, resumed: gameState === 'PLAYING',
        survivorsPreserved: enemies === survivors && enemies.includes(target) && target.health === 77,
        duplicateIgnored: JSON.stringify(afterFirst) === JSON.stringify(refits()) };
      // Exercise the real delayed wave-clear reward after finishing the fight.
      enemies = [];
      handleWaveCleared();
      return result;
    }, currentWave);
    if (resumed.wave !== currentWave || !resumed.pausedForRefit || !resumed.resumed || !resumed.survivorsPreserved || !resumed.duplicateIgnored) {
      throw new Error(`XP refit skipped surviving targets: ${JSON.stringify(resumed)}`);
    }
    await page.getByRole('dialog', { name: 'Select Refit', exact: true }).waitFor();
    await page.locator('#levelup-choices button').first().click();
    const advanced = await page.evaluate(() => {
      gameState = 'PAUSED';
      return { wave, count: enemies.length, expected: WAVE_ROSTERS[wave].reduce((sum, entry) => sum + entry.count, 0) };
    });
    if (advanced.wave !== currentWave + 1 || advanced.count !== advanced.expected) throw new Error(`Cleared wave did not advance exactly once: ${JSON.stringify(advanced)}`);
  }
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

async function verifyPaintedArt(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?verify-island-detail`);
  await page.getByRole('button', { name: 'Click to Engage', exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.getByRole('button', { name: /US NAVY/ }).click();
  await page.getByText('BATTLESHIP', { exact: true }).waitFor();
  const artPreviews = await page.evaluate(() => {
    const render = (items, width, height, scale, offsetX, offsetY) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const context = c.getContext('2d'); NavalArt.ocean(context, 0, 0, width, height);
      context.translate(offsetX, offsetY); context.scale(scale, scale);
      for (const island of items) {
        const p = islandBufferWorldPosition(island), g = island.renderGeometry;
        context.drawImage(island.buffer, p.x, p.y, g.bufferWidth, g.bufferHeight);
      }
      return c.toDataURL().split(',')[1];
    };
    const gallery = Array.from({ length: NavalArt.variantCount }, (_, artVariant) => {
      const island = { x: artVariant * 1600, y: 0, radius: 560, seed1: 0, seed2: 2.2, artVariant };
      buildIslandBuffer(island); return island;
    });
    return { layout: render(islands, 1200, 1200, 0.053, 600, 600),
      gallery: render(gallery, 1440, 600, 0.3, 240, 300) };
  });
  await writeFile(`${outputDirectory}/island-layout.png`, Buffer.from(artPreviews.layout, 'base64'));
  await writeFile(`${outputDirectory}/island-families.png`, Buffer.from(artPreviews.gallery, 'base64'));
  const result = await page.evaluate(() => {
    const maxCacheSide = Math.max(...islands.map(i => Math.max(i.buffer.width, i.buffer.height)));
    const cacheBytes = islands.reduce((sum, i) => sum + i.buffer.width * i.buffer.height * 4, 0);
    const centersPreserved = islands.every(i => {
      const p = islandBufferWorldPosition(i);
      return Math.abs(p.x + i.bufferCenterX - i.x) < 1e-6 && Math.abs(p.y + i.bufferCenterY - i.y) < 1e-6;
    });
    const islandCount = islands.length;
    let minimumGap = Infinity, minimumSpawnClearance = Infinity;
    const layoutFailures = [];
    for (let seed = 0; seed < 101; seed++) {
      let state = seed;
      const random = seed === 100 ? () => 0.5 : () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
      const layout = createIslandLayout(random);
      const counts = Array.from({ length: NavalArt.variantCount }, (_, variant) => layout.filter(i => i.artVariant === variant).length);
      if (layout.length !== 15 || counts.some(count => count !== 5)) layoutFailures.push(seed);
      for (let i = 0; i < layout.length; i++) {
        minimumSpawnClearance = Math.min(minimumSpawnClearance, Math.hypot(layout[i].x, layout[i].y) - islandPlacementExtent(layout[i]));
        for (let j = 0; j < i; j++) minimumGap = Math.min(minimumGap,
          Math.hypot(layout[i].x - layout[j].x, layout[i].y - layout[j].y) - islandPlacementExtent(layout[i]) - islandPlacementExtent(layout[j]));
      }
    }
    const variantChecks = Array.from({ length: NavalArt.variantCount }, (_, variant) => {
      const detail = window.__verifyIslandDetail(variant);
      const signature = Array.from({ length: 128 }, (_, i) => outerIslandShorelineRadius(islands[0], i * Math.PI / 64).toFixed(2)).join(',');
      return { variant, signature, fits: detail.boundsFit && detail.theoreticalBoundsFit && detail.positivePadding && detail.worldCenterPreserved && detail.shorelineMatchesCollision,
        opaque: detail.opaqueCoastSamples, clear: detail.clearOffshoreSamples };
    });
    window.__verifyIslandDetail();
    const model = document.createElement('canvas').getContext('2d');
    const mounts = [];
    for (const nation of Object.keys(NATIONS)) {
      const ship = new Player(nation);
      ship.x = 400; ship.y = -300; ship.angle = 0.77;
      traceShipHull(model, nation, ship.radius);
      for (let i = 0; i < ship.config.secondary.turrets; i++) {
        const mount = getSecondaryMount(nation, ship.radius, i);
        const fits = [-2.75, 2.75].every(dx => [-2.75, 2.75].every(dy => model.isPointInPath(mount.x + dx, mount.y + dy)));
        projectiles = [];
        ship.fireSec(i, { x: 900, y: -100 });
        const expectedX = ship.x + Math.cos(ship.angle) * mount.x - Math.sin(ship.angle) * mount.y;
        const expectedY = ship.y + Math.sin(ship.angle) * mount.x + Math.cos(ship.angle) * mount.y;
        const shot = projectiles[0];
        const shotAligned = Math.hypot(shot.x - expectedX, shot.y - expectedY) < 1e-6;
        mounts.push({ nation, index: i, fits, shotAligned });
      }
    }
    projectiles = [];
    const testShip = { x: 0, y: 0, angle: 0, radius: 50, vx: 3, vy: 0 };
    for (let i = 0; i < 200; i++) { testShip.x += 6; NavalArt.recordWake(testShip, 16.67); }
    const movingWake = NavalArt.wakeCount(testShip);
    testShip.vx = 0;
    for (let i = 0; i < 300; i++) NavalArt.recordWake(testShip, 16.67);
    const stoppedWake = NavalArt.wakeCount(testShip);
    const terrain = islands[0].buffer.getContext('2d');
    const colors = new Set();
    const cx = Math.round(islands[0].bufferCenterX), cy = Math.round(islands[0].bufferCenterY);
    const sample = terrain.getImageData(cx - 80, cy - 80, 160, 160).data;
    for (let i = 0; i < sample.length; i += 64) colors.add(`${sample[i]},${sample[i + 1]},${sample[i + 2]}`);
    keys.ArrowUp = true;
    for (let i = 0; i < 210; i++) {
      player.update(TIME_STEP);
      particles = particles.filter(p => p.update(TIME_STEP));
    }
    keys.ArrowUp = false;
    islands[0].x = 80; islands[0].y = player.y; zoom = 0.5;
    return { ready: NavalArt.stats.ready, islandCount, maxCacheSide, cacheBytes, centersPreserved,
      movingWake, stoppedWake, terrainColors: colors.size, mounts, minimumGap, minimumSpawnClearance, layoutFailures,
      distinctSilhouettes: new Set(variantChecks.map(v => v.signature)).size,
      variantChecks: variantChecks.map(({ signature, ...check }) => check) };
  });
  if (!result.ready || result.islandCount !== 15 || result.maxCacheSide > 1536 ||
      result.cacheBytes > 15 * 1536 * 1536 * 4 || !result.centersPreserved ||
      result.movingWake < 1 || result.movingWake > 100 || result.stoppedWake !== 0 ||
      result.terrainColors < 100 || result.mounts.some(m => !m.fits || !m.shotAligned) ||
      result.minimumGap < 450 - 1e-6 || result.minimumSpawnClearance < 700 - 1e-6 || result.layoutFailures.length ||
      result.distinctSilhouettes !== 3 || result.variantChecks.some(v => !v.fits || v.opaque !== 128 || v.clear !== 128) || errors.length) {
    throw new Error(`Painted graphics verification failed: ${JSON.stringify({ result, errors })}`);
  }
  await page.waitForTimeout(100);
  const png = await page.locator('#gameCanvas').evaluate(c => c.toDataURL().split(',')[1]);
  await writeFile(`${outputDirectory}/painted-naval-art.png`, Buffer.from(png, 'base64'));
  console.log(`PAINTED GRAPHICS: ${JSON.stringify(result)}`);
  await page.close();

  const missing = await browser.newPage();
  await missing.route('**/assets/art/ship-deck.png', route => route.abort());
  await missing.goto(baseUrl);
  await missing.getByRole('button', { name: 'Click to Engage', exact: true }).click();
  await missing.getByText('Artwork unavailable. Reload to retry.', { exact: true }).waitFor();
  if (!(await missing.evaluate(() => NavalArt.stats.failed && gameState === 'SPLASH'))) {
    throw new Error('Missing art must prevent starting an incomplete game.');
  }
  await missing.close();
  for (const path of ['/package.json', '/RULES.md', '/assets/art/missing.png']) {
    if ((await browser.newPage().then(async page => { const response = await page.request.get(`${baseUrl}${path}`); await page.close(); return response.status(); })) !== 404) {
      throw new Error(`Verifier server must reject unlisted path ${path}.`);
    }
  }
}

async function verifyShellTracers(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Click to Engage', exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.getByRole('button', { name: /US NAVY/ }).click();
  const result = await page.evaluate(() => {
    gameState = 'PAUSED'; enemies = []; player.x = -10000; player.y = -10000;
    const surface = document.createElement('canvas'); surface.width = 400; surface.height = 400;
    const context = surface.getContext('2d');
    const cases = [];
    for (const [friendly, size, speed] of [[true,13,11], [true,5,15], [false,8,8]]) {
      for (const angle of [0, Math.PI/2, Math.PI, -Math.PI/4]) {
        const p = new Projectile(200,200,angle,friendly,speed,77,'#fff',size);
        const initialLength = NavalArt.shellTrailGeometry(p).length;
        for (let step = 0; step < 20; step++) p.update(16.6);
        const distance = Math.hypot(p.x-200,p.y-200), trail = NavalArt.shellTrailGeometry(p);
        // Draw around a fixed canvas center without changing traveled distance.
        context.clearRect(0,0,400,400); context.save(); context.translate(200-p.x,200-p.y); NavalArt.shell(context,p); context.restore();
        const alpha = offset => context.getImageData(Math.round(200+Math.cos(angle)*offset),Math.round(200+Math.sin(angle)*offset),1,1).data[3];
        cases.push({ friendly,size,angle, initialLength, bounded: trail.length <= distance && trail.length <= 170,
          aligned: Math.abs(trail.angle-angle) < 1e-9, visibleBehind: alpha(-trail.length*.4)>0,
          clearAhead: alpha(40)===0, movementPreserved: Math.abs(distance-speed*20)<1e-6,
          damagePreserved: p.damage===77 && Math.abs(p.life-(8000-20*16.6))<1e-8 });
      }
    }
    const target = { x: 110, y: 0, radius: 20, health: 100 };
    enemies = [target]; const friendly = new Projectile(100,0,0,true,11,25,'#fff',13); friendly.update(16.6);
    const friendlyHit = target.health === 75 && friendly.life === 0;
    enemies = []; player.x = 110; player.y = 0; player.health = 100;
    const hostile = new Projectile(100,0,0,false,8,17,'#f00',8); hostile.update(16.6);
    const hostileHit = player.health === 83 && hostile.life === 0;
    context.clearRect(0,0,400,400); NavalArt.shell(context,friendly); NavalArt.shell(context,hostile);
    const deadInvisible = context.getImageData(0,0,400,400).data.every(v => v === 0);
    player.x = -10000; player.y = -10000;
    const expired = new Projectile(0,0,0,true,11,25,'#fff',13); expired.update(8001);
    NavalArt.shell(context,expired);
    const expiredInvisible = expired.life < 0 && context.getImageData(0,0,400,400).data.every(v => v === 0);
    player.x = 0; player.y = 200; player.angle = -.5; player.turretAngle = -.5; player.health = player.maxHealth;
    islands = [islands[0]]; islands[0].x = 600; islands[0].y = -550; islands[0].radius = 500; buildIslandBuffer(islands[0]);
    projectiles = [];
    const add = (x,y,angle,isFriendly,speed,size,distance) => {
      const p = new Projectile(x,y,angle,isFriendly,speed,77,'#ef4444',size);
      p.x += Math.cos(angle)*distance; p.y += Math.sin(angle)*distance; projectiles.push(p);
    };
    for (let i=0;i<3;i++) add(45,180+i*14,-.5+i*.035,true,11,13,390+i*25);
    for (let i=0;i<2;i++) add(0,220+i*12,-.12,true,15,5,480+i*35);
    add(900,-100,Math.PI-.4,false,8,8,330); zoom = .7;
    window.__tracerDraw = Projectile.prototype.draw;
    return { cases, friendlyHit, hostileHit, deadInvisible, expiredInvisible, cacheCount: NavalArt.shellCacheCount() };
  });
  if (result.cases.some(c => c.initialLength !== 0 || !c.bounded || !c.aligned || !c.visibleBehind || !c.clearAhead || !c.movementPreserved || !c.damagePreserved) ||
      !result.friendlyHit || !result.hostileHit || !result.deadInvisible || !result.expiredInvisible || result.cacheCount !== 3 || errors.length) {
    throw new Error(`Shell tracer verification failed: ${JSON.stringify({ result, errors })}`);
  }
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outputDirectory}/shell-tracers.png` });
  await page.evaluate(() => { Projectile.prototype.draw = function() { ctx.fillStyle=this.color;ctx.beginPath();ctx.arc(this.x,this.y,this.size,0,Math.PI*2);ctx.fill(); }; });
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outputDirectory}/shell-tracers-before.png` });
  await page.evaluate(() => { Projectile.prototype.draw = window.__tracerDraw; });
  console.log(`SHELL TRACERS: ${JSON.stringify(result)}`);
  await page.close();
}

async function verifyIslandDetail(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) => { throw error; });
  await page.goto(`${baseUrl}/?verify-island-detail`, { waitUntil: "networkidle" });
  await page.getByText("Click to Engage", { exact: true }).click();
  await page.getByRole("button", { name: "Skirmish", exact: true }).click();
  await page.getByRole("button", { name: /US NAVY/ }).click();
  await page.getByText("BATTLESHIP", { exact: true }).waitFor();
  const result = await page.evaluate(() => window.__verifyIslandDetail?.());
  if (
    !result ||
    !result.paintedTerrain ||
    result.opaqueCoastSamples !== 128 ||
    result.clearOffshoreSamples !== 128 ||
    result.shorelineRadius <= 0 ||
    result.sampledMaximumShorelineRadius > result.maximumShorelineRadius ||
    !result.boundsFit ||
    !result.theoreticalBoundsFit ||
    !result.positivePadding ||
    !result.worldCenterPreserved ||
    !result.shorelineMatchesCollision ||
    Object.values(result.theoreticalPadding ?? {}).length !== 4 ||
    Object.values(result.theoreticalPadding ?? {}).some((padding) => padding < result.requestedPadding) ||
    result.minRenderX < 0 ||
    result.minRenderY < 0 ||
    result.maxRenderX > result.bufferWidth ||
    result.maxRenderY > result.bufferHeight
  ) {
    throw new Error(`Island detail verification failed: ${JSON.stringify(result)}`);
  }
  await page.waitForFunction(() => {
    const probeX = Math.round(innerWidth / 2 + (0 - player.x) * zoom);
    const probeY = Math.round(innerHeight / 2 + (0 - player.y) * zoom);
    const pixel = ctx.getImageData(probeX, probeY, 1, 1).data;
    return pixel[1] > pixel[2];
  });
  const visibleTerrainPixel = await page.evaluate(() => {
    const probeX = Math.round(innerWidth / 2 + (0 - player.x) * zoom);
    const probeY = Math.round(innerHeight / 2 + (0 - player.y) * zoom);
    return [...ctx.getImageData(probeX, probeY, 1, 1).data];
  });
  result.visibleTerrainPixel = visibleTerrainPixel;
  console.log(`ISLAND DETAIL BOUNDS: ${JSON.stringify(result)}`);
  await page.waitForTimeout(250);
  const canvasPngBase64 = await page.locator("#gameCanvas").evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await writeFile(`${outputDirectory}/island-detail.png`, Buffer.from(canvasPngBase64, "base64"));
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
    JSON.stringify(result.afterFirstClick.refits) === JSON.stringify(result.before.refits) ||
    JSON.stringify(result.afterSecondClick.refits) !== JSON.stringify(result.afterFirstClick.refits) ||
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
    await verifyNationShellSpeeds(browser);
    await verifyRefits(browser);
    await verifyRefits(browser, true);
    await verifyRefitWaveContinuation(browser);
    await verifyDesktop(browser);
    await verifyDefeat(browser);
    await verifyIslandCollision(browser);
    await verifyIslandDetail(browser);
    await verifyPaintedArt(browser);
    await verifyShellTracers(browser);
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
