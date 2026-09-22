import { CONFIG as C, angleDelta } from "./config.js";

export const TURN_TRENDS = [
  "UNKNOWN",
  "STEADY",
  "SLIGHT_PORT",
  "SLIGHT_STARBOARD",
  "TURNING_PORT",
  "TURNING_STARBOARD",
  "HARD_PORT",
  "HARD_STARBOARD",
];
export const SPEED_TRENDS = [
  "UNKNOWN",
  "STEADY_SPEED",
  "ACCELERATING",
  "DECELERATING",
];
export const TRACK_QUALITIES = [...C.trackAgeBands.map((b) => b[1]), "LOST"];

// The sensor accepts a pose projection, NOT a DuelShip. Rotate the noise vector
// with the mirrored arena to preserve paired physical symmetry.
export function observePose(
  { x, y, heading },
  timestamp,
  random,
  mirrored = false,
) {
  const sign = mirrored ? -1 : 1;
  return {
    timestamp,
    x: x + sign * (2 * random() - 1) * C.positionNoise,
    y: y + sign * (2 * random() - 1) * C.positionNoise,
    heading: angleDelta(0, heading + (2 * random() - 1) * C.headingNoise),
  };
}
export function ageBand(age) {
  const band = C.trackAgeBands.find((b) => age <= b[0]);
  return band
    ? { quality: band[1], multiplier: band[2] }
    : { quality: "LOST", multiplier: 0 };
}
function uncertainty(age) {
  const anchors = C.uncertaintyAnchors;
  for (let i = 1; i < anchors.length; i++)
    if (age <= anchors[i][0]) {
      const [x0, y0] = anchors[i - 1],
        [x1, y1] = anchors[i];
      return y0 + ((y1 - y0) * (age - x0)) / (x1 - x0);
    }
  return anchors.at(-1)[1] + (age - anchors.at(-1)[0]) * 0.05;
}
function turnClass(rate) {
  const degrees = (Math.abs(rate) * 180) / Math.PI,
    [slight, turning, hard] = C.turnThresholdsDegrees;
  // Screen y grows downward: a positive heading change turns starboard.
  const side = rate < 0 ? "PORT" : "STARBOARD";
  return degrees < slight
    ? "STEADY"
    : `${degrees < turning ? "SLIGHT" : degrees < hard ? "TURNING" : "HARD"}_${side}`;
}

export class TargetTracker {
  constructor() {
    this.history = [];
    this.velocity = { x: null, y: null };
    this.heading = null;
    this.turnRate = 0;
    this.acceleration = 0;
    this.positionResidual = 0;
    this.headingResidual = 0;
    this.turnTrend = "UNKNOWN";
    this.speedTrend = "UNKNOWN";
    this.candidates = {};
  }
  persist(key, candidate) {
    const prev = this.candidates[key];
    const count = prev?.candidate === candidate ? prev.count + 1 : 1;
    this.candidates[key] = { candidate, count };
    if (count >= C.trendPersistence) this[key] = candidate;
  }
  add(sample) {
    if (
      !sample ||
      Object.keys(sample).sort().join() !== "heading,timestamp,x,y" ||
      !Object.values(sample).every(Number.isFinite) ||
      sample.timestamp < 0 ||
      (this.history.length && sample.timestamp <= this.history.at(-1).timestamp)
    )
      throw new Error("Invalid target observation");
    const prev = this.history.at(-1);
    if (prev) {
      const dt = (sample.timestamp - prev.timestamp) / 1000;
      const known = this.velocity.x !== null;
      const oldSpeed = known
        ? Math.hypot(this.velocity.x, this.velocity.y)
        : null;
      this.positionResidual = known
        ? Math.hypot(
            sample.x - prev.x - this.velocity.x * dt,
            sample.y - prev.y - this.velocity.y * dt,
          )
        : 0;
      this.headingResidual = Math.abs(
        angleDelta(this.heading + this.turnRate * dt, sample.heading),
      );
      for (const axis of ["x", "y"]) {
        const measured = (sample[axis] - prev[axis]) / dt;
        this.velocity[axis] = known
          ? this.velocity[axis] +
            C.velocityAlpha * (measured - this.velocity[axis])
          : measured;
      }
      const measuredTurn = angleDelta(prev.heading, sample.heading) / dt;
      this.turnRate += C.turnRateAlpha * (measuredTurn - this.turnRate);
      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      this.acceleration = oldSpeed === null ? 0 : (speed - oldSpeed) / dt;
      this.heading = angleDelta(
        0,
        this.heading +
          C.headingAlpha * angleDelta(this.heading, sample.heading),
      );
      this.persist("turnTrend", turnClass(this.turnRate));
      if (oldSpeed !== null)
        this.persist(
          "speedTrend",
          Math.abs(this.acceleration) < C.accelerationThreshold
            ? "STEADY_SPEED"
            : this.acceleration > 0
              ? "ACCELERATING"
              : "DECELERATING",
        );
    } else this.heading = angleDelta(0, sample.heading);
    this.history.push({ ...sample });
    if (this.history.length > C.trackHistory) this.history.shift();
  }
  estimate(now) {
    const last = this.history.at(-1),
      count = this.history.length;
    const age = last ? Math.max(0, now - last.timestamp) : now;
    const band = last ? ageBand(age) : { quality: "LOST", multiplier: 0 };
    const known = this.velocity.x !== null;
    const maturity = C.maturityConfidence[Math.min(count, 6)];
    const [r0, r1, r2] = C.positionResidualThresholds;
    const positionFactor =
      this.positionResidual < r0
        ? 1
        : this.positionResidual < r1
          ? 0.8
          : this.positionResidual < r2
            ? 0.5
            : 0.25;
    const headingResidualDeg = (this.headingResidual * 180) / Math.PI;
    const [h0, h1] = C.headingResidualThresholdsDegrees;
    const headingFactor =
      headingResidualDeg < h0 ? 1 : headingResidualDeg < h1 ? 0.8 : 0.5;
    const maneuverFactor =
      1 /
      (1 + Math.abs(this.acceleration) / 30 + Math.abs(this.turnRate) / 0.5);
    const base = maturity * band.multiplier;
    const confidence = {
      position: base * positionFactor,
      speed: known ? base * positionFactor * maneuverFactor : 0,
      heading: base * headingFactor,
      turn: known ? base * headingFactor * maneuverFactor : 0,
    };
    confidence.overall =
      (confidence.position +
        confidence.speed +
        confidence.heading +
        confidence.turn) /
      4;
    const horizon = Math.min(age, 1500) / 1000;
    return {
      kind: "TARGET_TRACK",
      position: {
        x: (last?.x ?? 0) + (this.velocity.x ?? 0) * horizon,
        y: (last?.y ?? 0) + (this.velocity.y ?? 0) * horizon,
      },
      estimatedVelocity: { ...this.velocity },
      estimatedSpeed: known
        ? Math.hypot(this.velocity.x, this.velocity.y)
        : null,
      estimatedHeading: this.heading,
      estimatedDirectionOfTravel: known
        ? Math.atan2(this.velocity.y, this.velocity.x)
        : null,
      estimatedTurnRate: known ? this.turnRate : null,
      turnTrend: this.turnTrend,
      speedTrend: this.speedTrend,
      sampleCount: count,
      maturity:
        count < 2
          ? "ACQUIRING"
          : count === 2
            ? "ROUGH"
            : count < 6
              ? "DEVELOPING"
              : "ESTABLISHED",
      trackAgeMs: age,
      quality: band.quality,
      positionUncertainty:
        uncertainty(age) *
          (1 + Math.abs(this.turnRate) + Math.abs(this.acceleration) / 30) +
        this.positionResidual * 0.25,
      confidence,
    };
  }
}
