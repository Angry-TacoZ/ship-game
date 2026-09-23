import { CONFIG as C } from "./config.js";
import { observePose, TargetTracker } from "./tracking.js";

// This is the single bridge from opponent simulation truth to policy-visible data.
export class OpponentObservationState {
  constructor() {
    this.tracker = new TargetTracker();
    this.sample = null;
    this._salvoSequence = 0;
  }

  capture({ pose, hp, modules, salvoSequence }, timeMs, random, mirrored) {
    this.tracker.add(observePose(pose, timeMs, random, mirrored));
    const previousSalvoAt = this.sample?.lastSalvoObservedAtMs;
    const salvoObserved = salvoSequence > this._salvoSequence;
    this._salvoSequence = salvoSequence;
    this.sample = {
      observedAtMs: timeMs,
      hp,
      visibleModules: { ...modules },
      lastSalvoObservedAtMs: salvoObserved ? timeMs : previousSalvoAt,
    };
    return { salvoObserved };
  }

  estimate(timeMs) {
    const sample = this.sample;
    const age =
      sample?.lastSalvoObservedAtMs == null
        ? null
        : Math.max(0, timeMs - sample.lastSalvoObservedAtMs);
    return {
      track: this.tracker.estimate(timeMs),
      hp: sample?.hp ?? C.hp,
      hpPct: (sample?.hp ?? C.hp) / C.hp,
      visibleModules: sample?.visibleModules ?? {
        engineImpaired: false,
        steeringImpaired: false,
        forwardTurretImpaired: false,
      },
      enemyFire: {
        status:
          age == null
            ? "NO_OBSERVED_SALVO"
            : age < C.reloadMs
              ? "RELOADING"
              : "LIKELY_READY",
        lastSalvoObservedAgeMs: age,
      },
      observedAtMs: sample?.observedAtMs ?? 0,
    };
  }
}
