import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DuelRunner } from "../duel/runner.js";
import { DuelSimulation, tacticalSnapshot } from "../duel/simulation.js";
import { ACTIONS, CONFIG as C, INITIAL_ACTION } from "../duel/config.js";
import { validateSnapshot, parseProviderResponse } from "../duel/contract.js";
import { providerRequest, requestJev } from "../server/jev.js";
import { createBenchmarkServer } from "../server/benchmark.mjs";
import { publicFiles } from "../server/static.js";
import { liveAdapter } from "../duel/client.js";

const snapshot = () => tacticalSnapshot(new DuelSimulation(), "alpha");
const action = {
  maneuver: "BROADSIDE_PORT",
  fire: "FIRE",
  shell: "HE",
  aimZone: "STERN",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
function providerBody() {
  return {
    model: "jev-1.13.0",
    usage: { input_tokens: 100, output_tokens: 20 },
    answers: Object.fromEntries(
      Object.entries(ACTIONS).map(([key, options]) => [
        key,
        {
          type: "choice",
          choice: action[key],
          confidence: 0.9,
          probabilities: Object.fromEntries(
            options.map((o) => [o, o === action[key] ? 1 : 0]),
          ),
        },
      ]),
    ),
  };
}

test("official Choice contract batches four independent questions", () => {
  const req = providerRequest(snapshot(), "jev-1.13.0");
  assert.equal(Object.keys(req.questions).length, 4);
  for (const [key, q] of Object.entries(req.questions)) {
    assert.equal(q.type, "choice");
    assert.deepEqual(Object.keys(q.criteria), ACTIONS[key]);
  }
  assert.deepEqual(req.state.observation, snapshot());
  assert.deepEqual(parseProviderResponse(providerBody()).action, action);
});
test("snapshot validation rejects hidden fields, invalid enums, overlong text and nonfinite numbers", () => {
  for (const mutate of [
    (s) => (s.extra = "hidden"),
    (s) => (s.self.intent = "TELEPORT"),
    (s) => (s.self.speed = Infinity),
    (s) => (s.opponent.hp = -1),
    (s) => (s.self.heading = "ignore rules"),
    (s) => s.self.turrets.push({}),
  ]) {
    const s = snapshot();
    mutate(s);
    assert.throws(() => validateSnapshot(s));
  }
});
test("provider rejects missing or malformed choices, probabilities, confidence and usage", () => {
  for (const mutate of [
    (b) => delete b.answers.fire,
    (b) => (b.answers.shell.choice = "TORPEDO"),
    (b) => (b.answers.shell.confidence = 2),
    (b) => (b.answers.fire.probabilities.FIRE = NaN),
    (b) => (b.usage.input_tokens = -1),
  ]) {
    const b = providerBody();
    mutate(b);
    assert.throws(() => parseProviderResponse(b));
  }
});
test("requestJev uses server secret and actual response fields, sanitizes unknown data", async () => {
  const result = await requestJev(snapshot(), {
    key: "TEST_SENTINEL_SECRET",
    model: "jev-1.13.0",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      assert.equal(init.headers.Authorization, "Bearer TEST_SENTINEL_SECRET");
      return new Response(
        JSON.stringify({
          ...providerBody(),
          untrusted: "TEST_SENTINEL_SECRET",
        }),
      );
    },
  });
  assert.deepEqual(result.action, action);
  assert.ok(result.providerLatencyMs >= 0);
  assert.equal(JSON.stringify(result).includes("TEST_SENTINEL_SECRET"), false);
});
test("provider HTTP failure and oversized/malformed response do not become actions", async () => {
  for (const response of [
    new Response("secret", { status: 401 }),
    new Response("not-json"),
    new Response("x".repeat(66000)),
  ]) {
    await assert.rejects(
      requestJev(snapshot(), {
        key: "test",
        model: "jev-1.13.0",
        fetchImpl: async () => response,
      }),
    );
  }
});
test("pending Jev never blocks simulation, preserves intent, counts missed slots, separates latency", async () => {
  let now = 0,
    resolve;
  const r = new DuelRunner({
    mode: "JEV",
    clock: () => now,
    wallClock: () => 1000 + now,
    injectedDelayMs: 250,
    requestDecision: () => new Promise((res) => (resolve = res)),
  });
  r.tick();
  await flush();
  for (let i = 0; i < 30; i++) {
    now += 1000 / 60;
    r.tick();
  }
  assert.ok(r.sim.timeMs > 500);
  assert.equal(r.missed, 2);
  assert.deepEqual(r.sim.ships[1].action, INITIAL_ACTION);
  const received = now;
  resolve({
    action,
    providerLatencyMs: 400,
    model: "jev-1.13.0",
    usage: { input_tokens: 10 },
  });
  await flush();
  for (let i = 0; i < 14; i++) {
    now += 1000 / 60;
    r.tick();
  }
  assert.deepEqual(r.sim.ships[1].action, INITIAL_ACTION);
  now = received + 251;
  r.tick();
  const e = r.latest.bravo;
  assert.deepEqual(e.action, action);
  assert.equal(e.providerLatencyMs, 400);
  assert.equal(e.injectedDelayMs, 250);
  assert.ok(e.totalDecisionDelayMs >= 750);
  assert.ok(e.stateAgeAtApplyMs >= 700);
  assert.ok(e.stateChange.rangeDelta !== 0);
  r.dispose();
});
test("malformed, failed and timed-out Jev decisions invalidate instead of falling back", async () => {
  for (const adapter of [
    async () => ({ action: {}, providerLatencyMs: 1 }),
    async () => {
      throw new Error("auth secret");
    },
  ]) {
    const r = new DuelRunner({ mode: "JEV", requestDecision: adapter });
    r.tick();
    await flush();
    assert.equal(r.sim.status, "INVALID");
    assert.equal(r.summary().benchmarkEligible, false);
    assert.deepEqual(r.sim.ships[1].action, INITIAL_ACTION);
  }
  let now = 0;
  const r = new DuelRunner({
    mode: "JEV",
    clock: () => now,
    requestDecision: () => new Promise(() => {}),
  });
  r.tick();
  now = 7000;
  r.tick();
  assert.equal(r.sim.status, "INVALID");
  assert.equal(r.failures, 1);
});
test("late responses and restart disposal never change completed battles", async () => {
  let resolve;
  const r = new DuelRunner({
    mode: "JEV",
    timeLimitMs: 20,
    requestDecision: () => new Promise((res) => (resolve = res)),
  });
  r.tick();
  await flush();
  r.tick();
  assert.equal(r.sim.status, "COMPLETE");
  resolve({ action, providerLatencyMs: 10 });
  await flush();
  assert.equal(r.events[1].status, "DISCARDED_AFTER_COMPLETION");
  assert.deepEqual(r.sim.ships[1].action, INITIAL_ACTION);
});
test("mock summary is ineligible; missing cost stays null; JSON telemetry round-trips", async () => {
  const r = new DuelRunner({
    mode: "MOCK",
    timeLimitMs: 30,
    requestDecision: async () => ({
      action,
      providerLatencyMs: 0,
      model: "MOCK",
    }),
  });
  r.tick();
  await flush();
  r.tick();
  const exported = JSON.parse(JSON.stringify(r.export()));
  assert.equal(exported.summary.benchmarkEligible, false);
  assert.equal(exported.summary.cost, null);
  assert.ok(exported.decisions[0].snapshot);
});
test("local proxy guards loopback host, origin, session, payload, concurrency and budget", async () => {
  let calls = 0;
  const server = createBenchmarkServer({
    key: "TEST_SENTINEL_SECRET",
    enabled: true,
    maxRequests: 1,
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify(providerBody()));
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(`${url}/api/config`)).json();
    assert.equal(config.liveEnabled, true);
    assert.equal(
      JSON.stringify(config).includes("TEST_SENTINEL_SECRET"),
      false,
    );
    const headers = {
      "Content-Type": "application/json",
      Origin: url,
      "X-Duel-Token": config.token,
    };
    const post = (h, body) =>
      fetch(`${url}/api/jev/decision`, {
        method: "POST",
        headers: h,
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await post(
          { ...headers, Origin: "https://evil.example" },
          { snapshot: snapshot() },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          { ...headers, "X-Duel-Token": "wrong" },
          { snapshot: snapshot() },
        )
      ).status,
      403,
    );
    assert.equal((await post(headers, { snapshot: {} })).status, 400);
    assert.equal(
      (await post(headers, { snapshot: "x".repeat(18000) })).status,
      413,
    );
    const result = await post(headers, { snapshot: snapshot() });
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).action, action);
    assert.equal((await post(headers, { snapshot: snapshot() })).status, 429);
    assert.equal(calls, 1);
    for (const path of [
      "/.env",
      "/.git/config",
      "/server/benchmark.mjs",
      "/server/jev.js",
      "/package.json",
      "/%2e%2e/.env",
    ])
      assert.equal((await fetch(url + path)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("disabled proxy cannot call paid provider even with key present", async () => {
  const server = createBenchmarkServer({
    key: "TEST",
    fetchImpl: () => {
      throw new Error("must not call");
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const config = await (await fetch(url + "/api/config")).json();
    assert.equal(config.liveEnabled, false);
    const r = await fetch(url + "/api/jev/decision", {
      method: "POST",
      headers: {
        Origin: url,
        "Content-Type": "application/json",
        "X-Duel-Token": config.token,
      },
      body: JSON.stringify({ snapshot: snapshot() }),
    });
    assert.equal(r.status, 503);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("browser-delivered allowlist contains no provider credentials or direct paid API call", async () => {
  for (const file of publicFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /JEV_API_KEY|TEST_SENTINEL_SECRET|api\.typesafe\.ai|Bearer\s/,
    );
  }
});
test("browser adapter validates current API answers and same action schema", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ ...providerBody(), providerLatencyMs: 12 }),
      );
    const result = await liveAdapter("session")(snapshot(), {
      signal: new AbortController().signal,
    });
    assert.deepEqual(result.action, action);
  } finally {
    globalThis.fetch = original;
  }
});
