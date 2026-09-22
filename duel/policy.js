import { CONFIG as C, angleDelta, validateAction } from "./config.js";

// Pure, readable tactical rules. The snapshot is the entire information boundary.
export function deterministicPolicy(snapshot) {
  const { self: s, opponent: e } = snapshot;
  const side = s.relativeBearing < 0 ? "PORT" : "STARBOARD";
  let maneuver, ruleId;
  const loaded = s.turrets.filter((t) => t.loaded && !t.impairedMs).length;
  const safeReload = e.estimatedReloadMs !== null && e.estimatedReloadMs > 2800;
  if (s.boundaryDistance < 130) {
    const bearing = s.heading + s.relativeBearing,
      center = s.heading + s.centerBearing;
    const choices = {
      CLOSE: 0,
      OPEN_RANGE: Math.PI,
      ANGLE_IN_PORT: Math.PI / 6,
      ANGLE_IN_STARBOARD: -Math.PI / 6,
      ANGLE_AWAY_PORT: (5 * Math.PI) / 6,
      ANGLE_AWAY_STARBOARD: (-5 * Math.PI) / 6,
      BROADSIDE_PORT: Math.PI / 2,
      BROADSIDE_STARBOARD: -Math.PI / 2,
    };
    maneuver = Object.keys(choices).sort(
      (a, b) =>
        Math.abs(angleDelta(center, bearing + choices[a])) -
        Math.abs(angleDelta(center, bearing + choices[b])),
    )[0];
    ruleId = "CLEAR_BOUNDARY";
  } else if (s.range > C.maxRange * 0.83) {
    maneuver = "CLOSE";
    ruleId = "APPROACH_RANGE";
  } else if (s.range < 300) {
    maneuver = `ANGLE_AWAY_${side}`;
    ruleId = "SEPARATE";
  } else if (s.hpPct < 0.3 && s.hpPct < e.hpPct) {
    maneuver = `ANGLE_AWAY_${side}`;
    ruleId = "KITE_DAMAGED";
  } else if (loaded >= 2 && (safeReload || e.aspect >= 60 || loaded === 4)) {
    maneuver = `BROADSIDE_${side}`;
    ruleId = "CROSS_FIRE_WINDOW";
  } else {
    maneuver = `ANGLE_IN_${side}`;
    ruleId = "REPOSITION_DEFENSIVE";
  }
  const shell = e.aspect >= 50 && s.range < 900 ? "AP" : "HE";
  const aimZone =
    shell === "AP"
      ? "MIDSHIPS"
      : e.visibleModules.steering <= 0 && e.speed > 25
        ? "STERN"
        : "BOW";
  return {
    action: validateAction({
      maneuver,
      fire: s.firingOpportunity ? "FIRE" : "HOLD_FIRE",
      shell,
      aimZone,
    }),
    ruleId,
  };
}
