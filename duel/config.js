// Every physical constant is shared by both contestants. Distances are world units;
// time is seconds in physics and milliseconds in decisions/telemetry.
export const CONFIG = Object.freeze({
  version: "ai-duel-v1",
  dt: 1 / 60,
  width: 1600,
  height: 1000,
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
  maxRange: 1050,
  dispersion: 0.018,
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
