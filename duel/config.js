// Every physical constant is shared by both contestants. Distances are world units;
// time is seconds in physics and milliseconds in decisions/telemetry.
export const CONFIG = Object.freeze({
  version: "ai-duel-v2",
  dt: 1 / 60,
  width: 2200,
  height: 1400,
  startingSeparation: 1100,
  scenarios: Object.freeze({
    HEAD_ON: Object.freeze([0.15, Math.PI + 0.15]),
    PARALLEL: Object.freeze([Math.PI / 2, Math.PI / 2]),
    CROSSING: Object.freeze([0.15, Math.PI / 2]),
  }),
  decisionIntervalMs: 250,
  timeLimitMs: 120000,
  hp: 10000,
  length: 120,
  beam: 36,
  zoneCut: 30,
  zoneAim: 43,
  maxSpeed: 46,
  acceleration: 12,
  deceleration: 20,
  turnRate: 0.24,
  reloadMs: 6500,
  traverseRate: 0.65,
  alignment: 0.035,
  turretArc: (125 * Math.PI) / 180,
  turretOffsets: Object.freeze([43, 24, -24, -43]),
  barrels: 2,
  shellSpeed: 380,
  maxRange: 1500,
  dispersionBaseHalfWidth: 2,
  dispersionLinear: 0.006,
  dispersionQuadratic: 0.000008,
  apDamage: 310,
  heDamage: 180,
  citadelMultiplier: 3,
  penetration: 420,
  rangePenLoss: 0.2,
  belt: 200,
  endArmor: 110,
  ricochetStart: 45,
  ricochetAuto: 60,
  citadelAspect: 65,
  moduleChance: 0.25,
  moduleDurationMs: 4500,
  engineFactor: 0.45,
  steeringFactor: 0.4,
  timeoutMs: 6000,
  maxInjectedDelayMs: 2000,
  observationIntervalMs: 100,
  trackHistory: 8,
  positionNoise: 1.5,
  headingNoise: Math.PI / 180,
  velocityAlpha: 0.35,
  headingAlpha: 0.4,
  turnRateAlpha: 0.3,
  trendPersistence: 3,
  accelerationThreshold: 4,
  turnThresholdsDegrees: Object.freeze([2, 5, 10]),
  maturityConfidence: Object.freeze([0, 0.2, 0.35, 0.5, 0.65, 0.8, 1]),
  positionResidualThresholds: Object.freeze([3, 8, 15]),
  headingResidualThresholdsDegrees: Object.freeze([2, 5]),
  trackAgeBands: Object.freeze(
    [
      [150, "FRESH", 1],
      [300, "GOOD", 0.9],
      [500, "AGING", 0.75],
      [750, "STALE", 0.55],
      [1000, "VERY_STALE", 0.35],
      [1500, "POOR", 0.2],
    ].map(Object.freeze),
  ),
  uncertaintyAnchors: Object.freeze(
    [
      [0, 2],
      [500, 8],
      [1000, 20],
      [1500, 38],
    ].map(Object.freeze),
  ),
});
export const ACTIONS = Object.freeze({
  maneuver: Object.freeze([
    "CLOSE",
    "OPEN_RANGE",
    "ANGLE_IN_PORT",
    "ANGLE_IN_STARBOARD",
    "ANGLE_AWAY_PORT",
    "ANGLE_AWAY_STARBOARD",
    "BROADSIDE_PORT",
    "BROADSIDE_STARBOARD",
    "HOLD_COURSE",
  ]),
  fire: Object.freeze(["HOLD_FIRE", "FIRE"]),
  shell: Object.freeze(["AP", "HE"]),
  aimZone: Object.freeze(["BOW", "MIDSHIPS", "STERN"]),
});
export const INITIAL_ACTION = Object.freeze({
  maneuver: "HOLD_COURSE",
  fire: "HOLD_FIRE",
  shell: "AP",
  aimZone: "MIDSHIPS",
});
// One coherent bounded Choice, retaining every existing action (including
// pre-aiming a selected zone/ammunition while holding fire): 9*2*2*3 = 108.
export const PLANS = Object.freeze(
  Object.fromEntries(
    ACTIONS.maneuver.flatMap((maneuver) =>
      ACTIONS.fire.flatMap((fire) =>
        ACTIONS.shell.flatMap((shell) =>
          ACTIONS.aimZone.map((aimZone) => [
            `${maneuver}__${fire}__${shell}__${aimZone}`,
            Object.freeze({ maneuver, fire, shell, aimZone }),
          ]),
        ),
      ),
    ),
  ),
);
export const planKey = (action) =>
  `${action.maneuver}__${action.fire}__${action.shell}__${action.aimZone}`;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const angleDelta = (from, to) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const approach = (v, target, step) => v + clamp(target - v, -step, step);
export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Stable named streams: R0=alpha, R1=bravo. Controllers cross these roles
// independently of the physical-side rotation in each four-condition seed.
export function streamSeed(seed, role, purpose) {
  let hash = seed >>> 0;
  for (const c of `${role}:${purpose}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
export function validateAction(value) {
  if (
    !value ||
    Object.keys(value).length !== 4 ||
    !Object.entries(ACTIONS).every(([key, options]) =>
      options.includes(value[key]),
    )
  )
    throw new Error("Invalid tactical action");
  return { ...value };
}
