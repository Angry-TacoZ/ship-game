import test from "node:test";
import assert from "node:assert/strict";
import { DuelRunner } from "../duel/runner.js";
import {
  currentFiringReadiness,
  tacticalSnapshot,
} from "../duel/simulation.js";
import { aimSolution } from "../duel/combat.js";
import { deterministicPolicy } from "../duel/policy.js";
import { TargetTracker } from "../duel/tracking.js";
test("application constraints stay frozen when a successful shot subsequently enters reload", () => {
  const r = new DuelRunner(),
    a = r.sim.ships[0];
  a.x = 500;
  a.y = 500;
  a.heading = 0;
  const t = new TargetTracker();
  for (let i = 0; i < 6; i++)
    t.add({ timestamp: i * 100, x: 500, y: 900, heading: 0 });
  r.sim.opponentObservations.alpha.tracker = t;
  r.sim.trackers.alpha = t;
  r.sim.tick = 30;
  r.sim.timeMs = 500;
  r.nextOpportunityMs = 10000;
  const track = t.estimate(500);
  a.turrets.forEach(
    (turret, i) => (turret.angle = aimSolution(a, track, i, "MIDSHIPS").angle),
  );
  const event = r.event("alpha", tacticalSnapshot(r.sim, "alpha"));
  r.apply("alpha", event, {
    action: {
      maneuver: "HOLD_COURSE",
      fire: "FIRE",
      shell: "HE",
      aimZone: "MIDSHIPS",
    },
  });
  assert.deepEqual(event.constraintsAtApply, []);
  assert.equal(event.blockedAtApply, false);
  r.tick();
  r.tick();
  assert.equal(event.firedDuringDecisionWindow, true);
  assert.ok(event.firstFireTimeMs > 500);
  const used = r.firingOpportunities.filter(
    (opportunity) =>
      opportunity.ship === "alpha" && opportunity.lifecycle === "USED",
  );
  assert.ok(used.length > 0);
  assert.ok(
    used.every(
      (opportunity) =>
        opportunity.usedByDecisionId === event.decisionId &&
        opportunity.usedWithAction.fire === "FIRE",
    ),
  );
  assert.equal(event.blockedAtApply, false);
  assert.deepEqual(event.constraintsAtApply, []);
  assert.ok(
    event.constraintsEncounteredDuringAction.some((c) => c.reason === "RELOAD"),
  );
  assert.ok(event.firstConstraintTimeMs > event.firstFireTimeMs);
  assert.ok(event.trackAtRequest.confidence);
  assert.ok(event.trackAtApply.confidence);
  assert.ok(
    r
      .export()
      .trackResearch.every(
        (row) => row.label === "GROUND TRUTH - ANALYSIS ONLY",
      ),
  );
});

test("firing opportunities survive decision requests and record the committed action that uses them", () => {
  const r = new DuelRunner({
      mode: "MOCK",
      requestDecision: () => new Promise(() => {}),
      battleId: "opportunity-lifecycle",
    }),
    ship = r.sim.ships[0],
    snapshot = tacticalSnapshot(r.sim, ship.id),
    committed = r.event(ship.id, snapshot);
  r.apply(ship.id, committed, {
    action: {
      maneuver: "HOLD_COURSE",
      fire: "FIRE",
      shell: "HE",
      aimZone: "MIDSHIPS",
    },
  });
  const pending = r.event(ship.id, snapshot);
  r.startRequest(pending);
  const readyOne = Array.from({ length: 4 }, (_, turret) => ({
    readyToFire: turret === 0,
  }));

  r.sim.timeMs = 100;
  r.recordFiringOpportunities(ship, readyOne, []);
  const opened = r.openFiringOpportunities.alpha[0];
  r.sim.timeMs = 116.667;
  r.recordFiringOpportunities(ship, readyOne, []);
  assert.equal(r.firingOpportunities.length, 1);
  assert.equal(r.opportunities.alpha, 1);
  assert.equal(r.openFiringOpportunities.alpha[0], opened);
  assert.equal(opened.openedByDecisionId, committed.decisionId);

  r.sim.timeMs = 133.333;
  r.recordFiringOpportunities(
    ship,
    Array.from({ length: 4 }, () => ({ readyToFire: false })),
    [0],
  );
  assert.equal(opened.lifecycle, "USED");
  assert.equal(opened.usedByDecisionId, committed.decisionId);
  assert.notEqual(opened.usedByDecisionId, pending.decisionId);
  assert.equal(opened.usedWithAction.fire, "FIRE");
  assert.equal(r.usedOpportunities.alpha, 1);

  r.sim.timeMs = 150;
  r.recordFiringOpportunities(ship, readyOne, []);
  const expired = r.openFiringOpportunities.alpha[0];
  assert.notEqual(expired.id, opened.id);
  r.sim.timeMs = 166.667;
  r.recordFiringOpportunities(
    ship,
    Array.from({ length: 4 }, () => ({ readyToFire: false })),
    [],
  );
  assert.equal(expired.lifecycle, "EXPIRED");
  assert.equal(expired.expiredReason, "READINESS_CLOSED");
  assert.equal(r.expiredOpportunities.alpha, 1);
  r.sim.timeMs = 183.333;
  r.recordFiringOpportunities(ship, readyOne, []);
  const battleEnded = r.openFiringOpportunities.alpha[0];
  r.expireOpenFiringOpportunities("BATTLE_ENDED");
  assert.equal(battleEnded.lifecycle, "EXPIRED");
  assert.equal(battleEnded.expiredReason, "BATTLE_ENDED");
  assert.equal(r.expiredOpportunities.alpha, 2);
  assert.deepEqual(r.export().firingOpportunities, [opened, expired, battleEnded]);
  r.dispose();
});

test("tick-level firing readiness uses the same fire-control predicate as decisions", () => {
  const r = new DuelRunner(),
    snapshot = tacticalSnapshot(r.sim, "alpha");
  assert.deepEqual(
    currentFiringReadiness(r.sim, "alpha"),
    snapshot.self.turrets,
  );
});

test("a recent salvo observation does not make the deterministic policy assume the whole battery is reloading", () => {
  const snapshot = tacticalSnapshot(new DuelRunner().sim, "alpha");
  Object.assign(snapshot.self, {
    boundaryDistance: 500,
    range: 700,
    hpPct: 0.9,
    turrets: snapshot.self.turrets.map((turret, index) => ({
      ...turret,
      loaded: index < 2,
      impairedMs: 0,
    })),
  });
  snapshot.opponent.hpPct = 0.9;
  snapshot.opponent.track.aspectEstimate = 25;
  snapshot.opponent.enemyFire = {
    status: "RECENT_FIRE_OBSERVED",
    lastSalvoObservedAgeMs: 0,
  };
  const recent = deterministicPolicy(snapshot);
  snapshot.opponent.enemyFire = {
    status: "OLD_FIRE_OBSERVATION",
    lastSalvoObservedAgeMs: 7000,
  };
  const old = deterministicPolicy(snapshot);
  assert.equal(recent.ruleId, "REPOSITION_DEFENSIVE");
  assert.deepEqual(recent, old);
});
