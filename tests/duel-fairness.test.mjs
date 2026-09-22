import test from "node:test";
import assert from "node:assert/strict";
import { DuelSimulation, tacticalSnapshot } from "../duel/simulation.js";
import { DuelShip } from "../duel/simulation.js";
import { CONFIG as C } from "../duel/config.js";
import { resolveImpact, turretCanBear, aimSolution } from "../duel/combat.js";
import { deterministicPolicy } from "../duel/policy.js";

test("simultaneous lethal shells produce draw regardless of ship order", () => {
  for (const reverse of [false, true]) {
    const sim = new DuelSimulation();
    const [a, b] = sim.ships;
    a.x = 500;
    a.y = 500;
    b.x = 900;
    b.y = 500;
    a.hp = 100;
    b.hp = 100;
    a.heading = Math.PI / 2;
    b.heading = Math.PI / 2;
    sim.projectiles = [
      {
        x: 880,
        y: 500,
        angle: 0,
        shooter: "alpha",
        type: "HE",
        aimZone: "MIDSHIPS",
        distance: 10,
      },
      {
        x: 520,
        y: 500,
        angle: Math.PI,
        shooter: "bravo",
        type: "HE",
        aimZone: "MIDSHIPS",
        distance: 10,
      },
    ];
    if (reverse) sim.ships.reverse();
    sim.step();
    assert.equal(sim.winner, "DRAW");
    assert.equal(sim.status, "COMPLETE");
  }
});
test("transition ricochet is seeded draw, not face-normal bow penetration", () => {
  const target = new DuelShip("target", "A", 2);
  target.heading = (37.5 * Math.PI) / 180;
  const hit = { zone: "MIDSHIPS", side: "PORT", point: { x: 0, y: 0 } },
    shell = { type: "AP", angle: 0, distance: 0 };
  assert.equal(resolveImpact(shell, target, hit, () => 0).outcome, "RICOCHET");
  assert.notEqual(
    resolveImpact(shell, target, hit, () => 1).outcome,
    "RICOCHET",
  );
});
test("reload and finite traverse physically gate shots, not heading damage multipliers", () => {
  const s = new DuelShip("alpha", "A", 1),
    e = new DuelShip("bravo", "B", 2);
  s.heading = 0;
  e.x = s.x;
  e.y = s.y + 500;
  e.vx = 0;
  e.vy = 0;
  s.commit({
    maneuver: "HOLD_COURSE",
    fire: "FIRE",
    shell: "HE",
    aimZone: "MIDSHIPS",
  });
  s.turrets.forEach((t) => {
    t.angle = 0;
  });
  assert.equal(s.weapons(e, 0).length, 0);
  s.turrets.forEach((t, i) => {
    t.angle = aimSolution(s, e, i, "MIDSHIPS").angle;
  });
  assert.equal(s.weapons(e, 1).length, 8);
  assert.equal(s.weapons(e, 2).length, 0);
  assert.ok(
    s.turrets.every((t) => turretCanBear(s, s.turrets.indexOf(t), t.angle)),
  );
});
test("module hit effects use configured zone consequences and recover", () => {
  const target = new DuelShip("bravo", "B", 1),
    shell = { type: "HE", angle: 0, distance: 10 };
  for (const [zone, effect] of [
    ["BOW", "TURRET"],
    ["MIDSHIPS", "ENGINE"],
    ["STERN", "STEERING"],
  ])
    assert.equal(
      resolveImpact(
        shell,
        target,
        { zone, side: "PORT", point: { x: 0, y: 0 } },
        () => 0,
      ).moduleEffect,
      effect,
    );
  target.modules.engine = 1;
  target.modules.steering = 1;
  target.turrets[0].impaired = 1;
  target.move({ x: 0, y: 0 });
  target.weapons(new DuelShip("alpha", "A", 2), 0);
  assert.equal(target.modules.engine, 0);
  assert.equal(target.modules.steering, 0);
  assert.equal(target.turrets[0].impaired, 0);
});
test("transparent baseline chooses AP broadside, HE angled, separation, approach and defensive reload", () => {
  const s = tacticalSnapshot(new DuelSimulation(), "alpha");
  s.self.range = 1500;
  assert.equal(deterministicPolicy(s).ruleId, "APPROACH_RANGE");
  s.self.range = 200;
  assert.equal(deterministicPolicy(s).ruleId, "SEPARATE");
  s.self.range = 500;
  s.opponent.aspect = 90;
  assert.equal(deterministicPolicy(s).action.shell, "AP");
  s.opponent.aspect = 0;
  assert.equal(deterministicPolicy(s).action.shell, "HE");
  s.self.turrets.forEach((t) => (t.loaded = false));
  assert.equal(deterministicPolicy(s).ruleId, "REPOSITION_DEFENSIVE");
});
test("time limit is explicit draw without hidden HP tiebreak", () => {
  const sim = new DuelSimulation({ timeLimitMs: C.dt * 1000 });
  sim.ships[0].hp = 1;
  sim.step();
  assert.equal(sim.winner, "DRAW");
});
