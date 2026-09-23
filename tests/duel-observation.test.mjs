import test from "node:test";
import assert from "node:assert/strict";
import { DuelSimulation, tacticalSnapshot } from "../duel/simulation.js";
import { DuelRunner } from "../duel/runner.js";
import { providerRequest } from "../server/jev.js";

test("opponent module changes remain hidden until the next observation sample", () => {
  const sim = new DuelSimulation(),
    enemy = sim.ships[1];
  let snapshot = tacticalSnapshot(sim, "alpha");
  assert.deepEqual(snapshot.opponent.visibleModules, {
    engineImpaired: false,
    steeringImpaired: false,
    forwardTurretImpaired: false,
  });
  enemy.modules.engine = 2683;
  enemy.modules.steering = 1746;
  enemy.turrets[0].impaired = 3112;
  assert.deepEqual(tacticalSnapshot(sim, "alpha"), snapshot);
  sim.timeMs += 100;
  sim.observeOpponents();
  snapshot = tacticalSnapshot(sim, "alpha");
  assert.deepEqual(snapshot.opponent.visibleModules, {
    engineImpaired: true,
    steeringImpaired: true,
    forwardTurretImpaired: true,
  });
  assert.doesNotMatch(JSON.stringify(snapshot), /2683|1746|3112/);
  enemy.modules.engine = 0;
  assert.equal(tacticalSnapshot(sim, "alpha").opponent.visibleModules.engineImpaired, true);
  sim.timeMs += 100;
  sim.observeOpponents();
  assert.equal(tacticalSnapshot(sim, "alpha").opponent.visibleModules.engineImpaired, false);
});

test("a salvo fired between samples is timestamped only when observed", () => {
  const sim = new DuelSimulation(),
    enemy = sim.ships[1];
  sim.timeMs = 10_100;
  enemy.lastSalvoMs = 10_041;
  enemy.salvoSequence++;
  const hidden = tacticalSnapshot(sim, "alpha");
  assert.equal(hidden.opponent.enemyFire.status, "NO_OBSERVED_SALVO");
  assert.equal(hidden.opponent.enemyFire.lastSalvoObservedAgeMs, null);
  sim.observeOpponents();
  const visible = tacticalSnapshot(sim, "alpha");
  assert.deepEqual(visible.opponent.enemyFire, {
    status: "RELOADING",
    lastSalvoObservedAgeMs: 0,
  });
  assert.equal(sim.observationMetrics.salvoTimingDelayMs.at(-1), 59);
  assert.equal("lastSalvoMs" in visible.opponent, false);
  sim.timeMs += 5000;
  assert.equal(tacticalSnapshot(sim, "alpha").opponent.enemyFire.lastSalvoObservedAgeMs, 5000);
});

test("Jev payload has only sampled opponent state; truth remains export-only research", () => {
  const runner = new DuelRunner({ timeLimitMs: 12_000 });
  while (runner.sim.status === "RUNNING") runner.tick();
  const snapshot = tacticalSnapshot(runner.sim, "alpha"),
    request = providerRequest(snapshot, "jev-test"),
    exported = runner.export();
  assert.deepEqual(request.state.observation.opponent, snapshot.opponent);
  for (const key of ["modules", "lastSalvoMs", "turrets", "vx", "vy", "speed", "velocity", "heading", "position", "action"])
    assert.equal(Object.hasOwn(request.state.observation.opponent, key), false, key);
  assert.ok(exported.projectileResearch.length > 0);
  assert.ok(exported.projectileResearch.every((row) => row.label === "GROUND TRUTH - ANALYSIS ONLY"));
  assert.ok(exported.projectileResearch.every((row) => "actualTargetPositionAtLaunch" in row));
  const shot = exported.projectileResearch[0];
  for (const key of [
    "estimatedTargetPositionAtLaunch",
    "estimatedTargetVelocityAtLaunch",
    "estimatedTargetHeadingAtLaunch",
    "estimatedTargetAspectAtLaunch",
    "trackConfidenceAtLaunch",
    "trackUncertaintyAtLaunch",
    "trackAgeAtLaunchMs",
    "predictedInterceptPoint",
    "predictedFlightTimeSeconds",
    "decisionAgeAtLaunchMs",
    "actualTargetPositionAtClosestApproach",
    "closestApproachDistance",
  ])
    assert.ok(Object.hasOwn(shot, key), key);
  assert.equal("actualTargetPositionAtLaunch" in snapshot.opponent, false);
  assert.equal(JSON.stringify(snapshot).includes("projectileResearch"), false);
  assert.equal(JSON.stringify(request).includes("actualTargetPositionAtLaunch"), false);
});
