import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG as C, rng, validateAction } from "../duel/config.js";
import {
  aspect,
  worldPoint,
  hullIntersection,
  classifyZone,
  turretCanBear,
  resolveImpact,
} from "../duel/combat.js";
import {
  DuelShip,
  DuelSimulation,
  tacticalSnapshot,
} from "../duel/simulation.js";
import { deterministicPolicy } from "../duel/policy.js";
import { stationaryTrack } from "./track-fixture.mjs";

const fire = {
  maneuver: "HOLD_COURSE",
  fire: "FIRE",
  shell: "AP",
  aimZone: "MIDSHIPS",
};
const ship = () => {
  const s = new DuelShip("alpha", "A", 10);
  s.x = 500;
  s.y = 500;
  s.heading = 0;
  return s;
};
test("forward propulsion and shared implementation", () => {
  const sim = new DuelSimulation();
  assert.ok(sim.ships.every((s) => s.constructor === DuelShip));
  sim.ships[0].commit({ ...fire, maneuver: "BROADSIDE_PORT" });
  for (let i = 0; i < 500; i++) {
    const s = sim.ships[0],
      x = s.x,
      y = s.y;
    sim.step();
    assert.ok(
      Math.abs(
        (s.x - x) * Math.sin(s.heading) - (s.y - y) * Math.cos(s.heading),
      ) < 1e-8,
    );
  }
});
test("bow/stern expose two turrets; broadside exposes all four; illegal arcs do not fire", () => {
  const s = ship(),
    count = (a) => s.turrets.filter((_, i) => turretCanBear(s, i, a)).length;
  assert.equal(count(0), 2);
  assert.equal(count(Math.PI), 2);
  assert.equal(count(Math.PI / 2), 4);
  s.commit(fire);
  const e = ship();
  e.x = 900;
  s.turrets.forEach((t) => {
    t.angle = 0;
  });
  assert.equal(s.weapons(stationaryTrack(e), 0).length, 4);
  assert.ok(s.blocked.some((b) => b.turret === 2 && b.reasons.includes("ARC")));
});
test("AP aspect, HE, range penetration, zones and citadel consequences", () => {
  const s = ship(),
    hit = { zone: "MIDSHIPS", side: "PORT", point: { x: 0, y: 0 } };
  const shell = {
    type: "AP",
    angle: 0,
    shooter: "bravo",
    aimZone: "MIDSHIPS",
    distance: 500,
  };
  assert.equal(aspect(0, 0), 0);
  assert.equal(aspect(0, Math.PI / 2), 90);
  assert.equal(resolveImpact(shell, s, hit, () => 1).outcome, "RICOCHET");
  assert.equal(
    resolveImpact({ ...shell, type: "HE" }, s, hit, () => 1).outcome,
    "PENETRATION",
  );
  s.heading = Math.PI / 2;
  assert.equal(resolveImpact(shell, s, hit, () => 1).outcome, "CITADEL");
  assert.equal(
    resolveImpact(shell, s, { ...hit, zone: "BOW" }, () => 1).outcome,
    "PENETRATION",
  );
  s.heading = (50 * Math.PI) / 180;
  assert.equal(
    resolveImpact({ ...shell, distance: 1000 }, s, hit, () => 1).outcome,
    "NONPEN",
  );
  assert.deepEqual(
    [classifyZone(50), classifyZone(0), classifyZone(-50)],
    ["BOW", "MIDSHIPS", "STERN"],
  );
});
test("oriented swept hull catches tunnelling and excludes circle false positives", () => {
  const s = ship();
  s.heading = Math.PI / 2;
  assert.equal(
    hullIntersection({ x: 300, y: 540 }, { x: 700, y: 540 }, s).zone,
    "BOW",
  );
  assert.equal(
    hullIntersection({ x: 540, y: 450 }, { x: 540, y: 550 }, s),
    null,
  );
  assert.equal(
    hullIntersection(worldPoint(s, -100), worldPoint(s, 100), s).zone,
    "STERN",
  );
});
test("temporary engine, steering and turret impairments affect common mechanics", () => {
  const a = ship(),
    b = ship(),
    target = { x: 1000, y: 500 };
  a.modules.engine = 4000;
  a.move(target);
  b.move(target);
  assert.ok(a.speed < b.speed);
  a.commit({ ...fire, maneuver: "BROADSIDE_PORT" });
  b.commit({ ...fire, maneuver: "BROADSIDE_PORT" });
  a.modules.steering = 4000;
  a.move(target);
  b.move(target);
  assert.ok(a.heading < b.heading);
  const c = ship(),
    e = ship();
  e.x = 900;
  c.commit(fire);
  c.turrets.forEach((t) => {
    t.angle = 0;
    t.impaired = 4000;
  });
  assert.equal(c.weapons(stationaryTrack(e), 0).length, 0);
});
test("seeded RNG repeats", () => {
  const a = rng(7),
    b = rng(7);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

function control(seed, swapped = false, reverseOrder = false) {
  const sim = new DuelSimulation({ seed, swapped });
  if (reverseOrder) sim.ships.reverse();
  while (sim.status === "RUNNING") {
    if (sim.tick % 15 === 0) {
      const decisions = sim.ships.map((s) =>
        deterministicPolicy(tacticalSnapshot(sim, s.id)),
      );
      decisions.forEach((d, i) =>
        sim.ships[i].commit(validateAction(d.action)),
      );
    }
    sim.step();
  }
  return {
    winner: sim.winner,
    time: sim.timeMs,
    ships: sim.ships
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({ hp: s.hp, stats: s.stats })),
    impacts: sim.impacts.length,
  };
}
test("same seed exactly reproduces full deterministic duel", () =>
  assert.deepEqual(control(42), control(42)));
test("mirrored and reversed-update controls preserve outcomes across fixed seeds", () => {
  for (const seed of [1, 7, 42, 2026, 9001]) {
    const a = control(seed),
      b = control(seed, true),
      reversed = control(seed, false, true);
    assert.deepEqual(reversed, a);
    assert.equal(a.winner, b.winner);
    assert.equal(a.time, b.time);
    for (let i = 0; i < 2; i++)
      assert.ok(Math.abs(a.ships[i].hp - b.ships[i].hp) < 1e-6);
    assert.ok(a.impacts > 0, "control must engage");
  }
});
test("tactical rules use canonical observation and produce bounded actions", () => {
  const snapshot = tacticalSnapshot(new DuelSimulation(), "alpha");
  const d = deterministicPolicy(structuredClone(snapshot));
  assert.ok(d.ruleId);
  validateAction(d.action);
  assert.equal(snapshot.opponent.enemyFire.status, "NO_OBSERVED_SALVO");
  assert.equal(snapshot.opponent.turrets, undefined);
  assert.throws(() => validateAction({ ...fire, velocity: 2 }));
});
