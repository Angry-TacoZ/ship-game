import { CONFIG as C, validateAction } from "./config.js";
import { DuelSimulation, tacticalSnapshot } from "./simulation.js";
import { deterministicPolicy } from "./policy.js";

const statistics = (values) => {
  if (!values.length)
    return { count: 0, mean: null, median: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return {
    count: n,
    mean: values.reduce((a, b) => a + b, 0) / n,
    median: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2,
    min: sorted[0],
    max: sorted[n - 1],
  };
};
export class DuelRunner {
  constructor({
    seed = 42,
    swapped = false,
    contenderShip = "bravo",
    scenario = "HEAD_ON",
    mode = "CONTROL",
    injectedDelayMs = 0,
    decisionIntervalMs = C.decisionIntervalMs,
    requestDecision = null,
    clock = () => performance.now(),
    wallClock = () => Date.now(),
    timeLimitMs = C.timeLimitMs,
    battleId = globalThis.crypto.randomUUID(),
  } = {}) {
    if (
      !["CONTROL", "MOCK", "JEV"].includes(mode) ||
      !["alpha", "bravo"].includes(contenderShip) ||
      !Number.isFinite(injectedDelayMs) ||
      injectedDelayMs < 0 ||
      injectedDelayMs > C.maxInjectedDelayMs ||
      !Number.isInteger(decisionIntervalMs) ||
      decisionIntervalMs < 100 ||
      decisionIntervalMs > 2000
    )
      throw new Error("Invalid runner settings");
    if (mode !== "CONTROL" && typeof requestDecision !== "function")
      throw new Error("Missing decision adapter");
    this.sim = new DuelSimulation({ seed, swapped, scenario, timeLimitMs });
    this.mode = mode;
    this.contenderShip = contenderShip;
    this.injectedDelayMs = injectedDelayMs;
    this.interval = decisionIntervalMs;
    this.requestDecision = requestDecision;
    this.clock = clock;
    this.wallClock = wallClock;
    this.battleId = battleId;
    this.events = [];
    this.pending = null;
    this.nextOpportunityMs = 0;
    this.missed = 0;
    this.failures = 0;
    this.requests = 0;
    this.latest = {};
    this.opportunities = { alpha: 0, bravo: 0 };
    this.usedOpportunities = { alpha: 0, bravo: 0 };
    this.firingTicks = { alpha: 0, bravo: 0 };
    this.opportunityWindows = {};
    this.disposed = false;
  }
  controller(id) {
    return id !== this.contenderShip || this.mode === "CONTROL"
      ? "DETERMINISTIC"
      : this.mode === "MOCK"
        ? "MOCK_DELAYED_RULES"
        : "JEV";
  }
  event(id, snapshot) {
    const e = {
      battleId: this.battleId,
      simulationTimestampMs: this.sim.timeMs,
      controller: this.controller(id),
      ship: id,
      startingSide: this.sim.ships.find((s) => s.id === id).startingSide,
      rngRole: this.sim.ships.find((s) => s.id === id).rngRole,
      streamIds: this.sim.ships.find((s) => s.id === id).streamIds,
      snapshot,
      requestedAtWallTime: this.wallClock(),
      requestedAtMonotonicMs: this.clock(),
      status: "REQUESTED",
      injectedDelayMs: 0,
    };
    this.events.push(e);
    return e;
  }
  apply(id, event, result) {
    const ship = this.sim.ships.find((s) => s.id === id),
      current = tacticalSnapshot(this.sim, id);
    const action = validateAction(result.action);
    ship.commit(action);
    const constraintsAtApply = ship.actionConstraints(current.opponent.track);
    Object.assign(event, result, {
      action,
      status: "APPLIED",
      appliedAtSimulationMs: this.sim.timeMs,
      appliedAtWallTime: this.wallClock(),
      totalDecisionDelayMs: this.clock() - event.requestedAtMonotonicMs,
      stateAgeAtApplyMs: this.sim.timeMs - event.snapshot.timeMs,
      stateChange: {
        rangeDelta: current.self.range - event.snapshot.self.range,
        aspectDelta:
          current.opponent.track.aspectEstimate -
          event.snapshot.opponent.track.aspectEstimate,
        hpDelta: current.self.hp - event.snapshot.self.hp,
        damageTaken: event.snapshot.self.hp - current.self.hp,
        firingOpportunityOpened:
          !event.snapshot.self.firingOpportunity &&
          current.self.firingOpportunity,
        firingOpportunityClosed:
          event.snapshot.self.firingOpportunity &&
          !current.self.firingOpportunity,
      },
      trackAtRequest: structuredClone(event.snapshot.opponent.track),
      trackAtApply: structuredClone(current.opponent.track),
      requestedTrackAgeAtApplyMs:
        this.sim.timeMs -
        event.snapshot.timeMs +
        event.snapshot.opponent.track.trackAgeMs,
      constraintsAtApply,
      blockedAtApply:
        action.fire === "FIRE" &&
        constraintsAtApply.length === ship.turrets.length,
      constraintsEncounteredDuringAction: [],
      firstConstraintTimeMs: constraintsAtApply.length ? this.sim.timeMs : null,
      firedDuringDecisionWindow: false,
      firstFireTimeMs: null,
      boundaryBlocked: false,
    });
    this.latest[id] = event;
  }
  fail(event, reason) {
    event.status = "FAILED";
    event.failureReason = reason;
    this.failures++;
    this.sim.invalidate(reason);
    this.pending?.abort.abort();
    this.pending = null;
  }
  startRequest(event) {
    this.requests++;
    const pending = { event, abort: new AbortController(), ready: null };
    this.pending = pending;
    Promise.resolve()
      .then(() =>
        this.requestDecision(event.snapshot, { signal: pending.abort.signal }),
      )
      .then((result) => {
        event.respondedAtWallTime = this.wallClock();
        event.respondedAtMonotonicMs = this.clock();
        try {
          validateAction(result.action);
          if (
            !Number.isFinite(result.providerLatencyMs) ||
            result.providerLatencyMs < 0
          )
            throw new Error();
        } catch {
          if (
            this.disposed ||
            this.sim.status !== "RUNNING" ||
            this.pending !== pending
          ) {
            event.status = "DISCARDED_MALFORMED_AFTER_COMPLETION";
            return;
          }
          this.fail(event, "Malformed decision response");
          return;
        }
        Object.assign(event, {
          providerLatencyMs: result.providerLatencyMs,
          model: result.model,
          usage: result.usage,
          answers: result.answers,
        });
        if (
          this.disposed ||
          this.sim.status !== "RUNNING" ||
          this.pending !== pending
        ) {
          event.status = "DISCARDED_AFTER_COMPLETION";
          return;
        }
        event.providerLatencyMs = result.providerLatencyMs;
        event.transportRoundTripMs =
          this.clock() - event.requestedAtMonotonicMs;
        event.injectedDelayMs = this.injectedDelayMs;
        pending.ready = result;
        pending.applyAfter = this.clock() + this.injectedDelayMs;
        event.status = "DELAYING";
      })
      .catch((error) => {
        if (
          this.disposed ||
          this.sim.status !== "RUNNING" ||
          this.pending !== pending
        ) {
          if (event.status === "REQUESTED")
            event.status = "DISCARDED_AFTER_COMPLETION";
          return;
        }
        const known =
          /^Provider HTTP \d{3}$/.test(error.message) ||
          /^Local proxy HTTP \d{3}$/.test(error.message) ||
          [
            "Provider timeout",
            "Provider request failed or response malformed",
            "Request limit reached or request already pending",
            "Live Jev is disabled. Configure the local server.",
          ].includes(error.message);
        this.fail(
          event,
          known ? error.message : "Jev request failed, aborted, or timed out",
        );
      });
  }
  tick() {
    if (this.disposed || this.sim.status !== "RUNNING") return;
    if (this.pending) {
      if (
        !this.pending.ready &&
        this.clock() - this.pending.event.requestedAtMonotonicMs >
          C.timeoutMs + 500
      ) {
        this.fail(this.pending.event, "Hard decision timeout");
        return;
      }
      if (this.pending.ready && this.clock() >= this.pending.applyAfter) {
        this.apply(
          this.pending.event.ship,
          this.pending.event,
          this.pending.ready,
        );
        this.pending = null;
      }
    }
    if (this.sim.timeMs + 1e-6 >= this.nextOpportunityMs) {
      this.nextOpportunityMs += this.interval;
      // Capture both observations before committing either decision.
      const snapshots = this.sim.ships.map((s) =>
        tacticalSnapshot(this.sim, s.id),
      );
      snapshots.forEach((snapshot, i) => {
        const id = this.sim.ships[i].id;
        if (snapshot.self.firingOpportunity) this.opportunities[id]++;
        this.opportunityWindows[id] = {
          observed: snapshot.self.firingOpportunity,
          used: false,
        };
        if (
          id === this.contenderShip &&
          this.mode !== "CONTROL" &&
          this.pending
        ) {
          this.missed++;
          return;
        }
        const event = this.event(id, snapshot);
        if (id === this.contenderShip && this.mode !== "CONTROL")
          this.startRequest(event);
        else {
          const before = this.clock(),
            result = deterministicPolicy(snapshot);
          event.respondedAtWallTime = this.wallClock();
          this.apply(id, event, {
            ...result,
            computationLatencyMs: this.clock() - before,
          });
        }
      });
    }
    this.sim.step();
    for (const ship of this.sim.ships) {
      const event = this.latest[ship.id];
      if (event) {
        if (ship.blocked.length) {
          event.firstConstraintTimeMs ??= this.sim.timeMs;
          for (const blocked of ship.blocked)
            for (const reason of blocked.reasons) {
              if (
                !event.constraintsEncounteredDuringAction.some(
                  (c) => c.turret === blocked.turret && c.reason === reason,
                )
              )
                event.constraintsEncounteredDuringAction.push({
                  turret: blocked.turret,
                  reason,
                  firstTimeMs: this.sim.timeMs,
                });
            }
        }
        if (ship.boundaryBlocked) {
          event.boundaryBlocked = true;
          event.firstConstraintTimeMs ??= this.sim.timeMs;
          if (
            !event.constraintsEncounteredDuringAction.some(
              (c) => c.reason === "BOUNDARY",
            )
          )
            event.constraintsEncounteredDuringAction.push({
              turret: null,
              reason: "BOUNDARY",
              firstTimeMs: this.sim.timeMs,
            });
        }
        if (ship.lastSalvoMs === this.sim.timeMs) {
          event.firedDuringDecisionWindow = true;
          event.firstFireTimeMs ??= this.sim.timeMs;
          this.firingTicks[ship.id]++;
          const window = this.opportunityWindows[ship.id];
          if (window?.observed && !window.used) {
            this.usedOpportunities[ship.id]++;
            window.used = true;
          }
        }
      }
    }
    if (this.sim.status !== "RUNNING" && this.pending) {
      this.pending.event.status = "DISCARDED_BATTLE_ENDED";
      this.pending.abort.abort();
      this.pending = null;
    }
  }
  dispose() {
    this.disposed = true;
    if (this.pending) {
      this.pending.event.status = "CANCELLED";
      this.pending.abort.abort();
      this.pending = null;
    }
  }
  summary() {
    const jev = this.events.filter((e) => e.controller !== "DETERMINISTIC"),
      applied = jev.filter((e) => e.status === "APPLIED");
    return {
      experimentVersion: C.version,
      battleId: this.battleId,
      seed: this.sim.seed,
      mode: this.mode,
      swapped: this.sim.swapped,
      contenderShip: this.contenderShip,
      scenario: this.sim.scenario,
      configuration: C,
      decisionIntervalMs: this.interval,
      injectedDelayMs: this.injectedDelayMs,
      status: this.sim.status,
      winner: this.sim.winner,
      invalidReason: this.sim.invalidReason,
      battleDurationMs: this.sim.timeMs,
      benchmarkEligible:
        this.mode === "JEV" &&
        this.sim.status === "COMPLETE" &&
        this.failures === 0 &&
        applied.length > 0 &&
        applied.every((e) => /^jev-/.test(e.model)),
      jevModels: [...new Set(jev.map((e) => e.model).filter(Boolean))],
      ships: this.sim.ships.map((s) => ({
        id: s.id,
        controller: this.controller(s.id),
        startingSide: s.startingSide,
        rngRole: s.rngRole,
        streamIds: s.streamIds,
        endingHp: s.hp,
        ...s.stats,
        totalDecisions: this.events.filter(
          (e) => e.ship === s.id && e.status === "APPLIED",
        ).length,
        observedFiringOpportunities: this.opportunities[s.id],
        usedFiringOpportunities: this.usedOpportunities[s.id],
        firingTicks: this.firingTicks[s.id],
        hitRate: s.stats.shots ? s.stats.hits / s.stats.shots : 0,
        damagePerShot: s.stats.shots ? s.stats.damageDealt / s.stats.shots : 0,
      })),
      missedJevDecisionOpportunities: this.missed,
      jevRequestFailures: this.failures,
      totalJevRequests: this.requests,
      providerLatencyMs: statistics(
        jev.map((e) => e.providerLatencyMs).filter(Number.isFinite),
      ),
      stateAgeAtApplyMs: statistics(applied.map((e) => e.stateAgeAtApplyMs)),
      totalDecisionDelayMs: statistics(
        applied.map((e) => e.totalDecisionDelayMs),
      ),
      deterministicLatencyMs: statistics(
        this.events.map((e) => e.computationLatencyMs).filter(Number.isFinite),
      ),
      usage: jev.reduce((out, e) => {
        for (const [k, v] of Object.entries(e.usage || {}))
          out[k] = (out[k] || 0) + v;
        return out;
      }, {}),
      cost: null,
      trackMetrics: Object.fromEntries(
        [
          "positionError",
          "velocityError",
          "speedError",
          "headingErrorDegrees",
          "confidence",
          "uncertainty",
        ].map((key) => [
          key,
          statistics(
            this.sim.trackResearch.map((r) => r[key]).filter(Number.isFinite),
          ),
        ]),
      ),
      costNote:
        "API contract returns token usage, not a monetary cost. No estimated cost substituted.",
    };
  }
  export() {
    return {
      summary: this.summary(),
      decisions: this.events,
      impacts: this.sim.impacts,
      frames: this.sim.frames,
      trackResearch: this.sim.trackResearch,
    };
  }
}
