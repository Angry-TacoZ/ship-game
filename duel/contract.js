import { ACTIONS, PLANS, CONFIG as C, validateAction } from "./config.js";
import { DuelSimulation, tacticalSnapshot } from "./simulation.js";
import { TURN_TRENDS, SPEED_TRENDS, TRACK_QUALITIES } from "./tracking.js";

const template = tacticalSnapshot(new DuelSimulation(), "alpha");
template.opponent.track.estimatedHeading = null;
// Exact recursive schema: reject extra fields, text payloads, NaNs and unbounded numbers.
function check(value, expected) {
  if (expected === null) {
    if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 1e6))
      throw new Error("Invalid observation");
    return;
  }
  if (typeof expected === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > 1e6)
      throw new Error("Invalid observation");
    return;
  }
  if (typeof expected === "boolean") {
    if (typeof value !== "boolean") throw new Error("Invalid observation");
    return;
  }
  if (typeof expected === "string") {
    if (typeof value !== "string" || value.length > 40)
      throw new Error("Invalid observation");
    return;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) !== Array.isArray(expected) ||
    Object.keys(value).length !== Object.keys(expected).length
  )
    throw new Error("Invalid observation");
  for (const key of Object.keys(expected)) {
    if (!Object.hasOwn(value, key)) throw new Error("Invalid observation");
    check(value[key], expected[key]);
  }
}
export function validateSnapshot(value) {
  check(value, template);
  if (
    value.schemaVersion !== 3 ||
    value.timeMs < 0 ||
    value.timeMs > C.timeLimitMs ||
    !ACTIONS.maneuver.includes(value.self.intent) ||
    !ACTIONS.shell.includes(value.self.shell) ||
    !ACTIONS.aimZone.includes(value.self.aimZone) ||
    !["BOW_OR_STERN_ON", "ANGLED", "BROADSIDE"].includes(
      value.opponent.descriptor,
    )
  )
    throw new Error("Invalid observation");
  for (const unit of [value.self, value.opponent]) {
    if (
      unit.hp < 0 ||
      unit.hp > C.hp ||
      unit.hpPct < 0 ||
      unit.hpPct > 1 ||
      unit.range < 0 ||
      unit.range > Math.hypot(C.width, C.height) + 200
    )
      throw new Error("Invalid observation");
  }
  const track = value.opponent.track;
  if (
    track.kind !== "TARGET_TRACK" ||
    !TURN_TRENDS.includes(track.turnTrend) ||
    !SPEED_TRENDS.includes(track.speedTrend) ||
    !TRACK_QUALITIES.includes(track.quality) ||
    !["ACQUIRING", "ROUGH", "DEVELOPING", "ESTABLISHED"].includes(
      track.maturity,
    ) ||
    !Number.isInteger(track.sampleCount) ||
    track.sampleCount < 0 ||
    track.sampleCount > C.trackHistory ||
    track.trackAgeMs < 0 ||
    track.positionUncertainty < 0 ||
    track.aspectEstimate < 0 ||
    track.aspectEstimate > 90 ||
    (track.estimatedSpeed !== null &&
      (track.estimatedSpeed < 0 || track.estimatedSpeed > 200)) ||
    Object.values(track.confidence).some((c) => c < 0 || c > 1) ||
    value.self.speed < 0 ||
    value.self.speed > C.maxSpeed + 1 ||
    value.self.aspect < 0 ||
    value.self.aspect > 90
  )
    throw new Error("Invalid observation");
  for (const angle of [
    track.estimatedHeading,
    track.estimatedDirectionOfTravel,
  ])
    if (angle !== null && Math.abs(angle) > Math.PI + 1e-8)
      throw new Error("Invalid observation");
  for (const velocity of Object.values(track.estimatedVelocity))
    if (velocity !== null && Math.abs(velocity) > 200)
      throw new Error("Invalid observation");
  const unknown = track.estimatedSpeed === null;
  if (
    unknown !== (track.estimatedVelocity.x === null) ||
    unknown !== (track.estimatedVelocity.y === null) ||
    (track.sampleCount < 2 && !unknown) ||
    (track.quality === "LOST" && track.confidence.overall !== 0)
  )
    throw new Error("Invalid observation");
  if (
    !["NO_OBSERVED_SALVO", "RELOADING", "LIKELY_READY"].includes(
      value.opponent.enemyFire.status,
    ) ||
    (value.opponent.enemyFire.lastSalvoObservedAgeMs !== null &&
      value.opponent.enemyFire.lastSalvoObservedAgeMs < 0) ||
    Object.values(value.opponent.visibleModules).some(
      (impaired) => typeof impaired !== "boolean",
    )
  )
    throw new Error("Invalid observation");
  for (const t of value.self.turrets)
    if (
      t.reloadPct < 0 ||
      t.reloadPct > 1 ||
      t.impairedMs < 0 ||
      t.impairedMs > C.moduleDurationMs
    )
      throw new Error("Invalid observation");
  return structuredClone(value);
}

export function parseProviderResponse(body) {
  if (
    !body ||
    typeof body.model !== "string" ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(body.model)
  )
    throw new Error("Malformed provider response");
  const answers = {};
  if (!body.answers || Object.keys(body.answers).length !== 1)
    throw new Error("Malformed provider response");
  for (const [key, options] of Object.entries({ plan: Object.keys(PLANS) })) {
    const a = body.answers?.[key];
    if (
      a?.type !== "choice" ||
      !options.includes(a.choice) ||
      !Number.isFinite(a.confidence) ||
      a.confidence < 0 ||
      a.confidence > 1 ||
      !a.probabilities ||
      Object.keys(a.probabilities).length !== options.length ||
      !options.every(
        (o) =>
          Number.isFinite(a.probabilities[o]) &&
          a.probabilities[o] >= 0 &&
          a.probabilities[o] <= 1,
      ) ||
      Math.abs(Object.values(a.probabilities).reduce((n, p) => n + p, 0) - 1) >
        0.02
    )
      throw new Error("Malformed provider response");
    answers[key] = {
      type: "choice",
      choice: a.choice,
      confidence: a.confidence,
      probabilities: Object.fromEntries(
        options.map((o) => [o, a.probabilities[o]]),
      ),
    };
  }
  const usage = {};
  for (const key of ["input_tokens", "output_tokens"])
    if (body.usage?.[key] !== undefined) {
      if (!Number.isSafeInteger(body.usage[key]) || body.usage[key] < 0)
        throw new Error("Malformed provider usage");
      usage[key] = body.usage[key];
    }
  return {
    action: validateAction(PLANS[answers.plan.choice]),
    answers,
    model: body.model,
    usage,
  };
}
