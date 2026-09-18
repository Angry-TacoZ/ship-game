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
  if (!result || !result.playerStopped || !result.angledClear || !result.enemyClear) {
    throw new Error(`Island collision failed: ${JSON.stringify(result)}`);
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
