import { CONFIG as C, clamp, angleDelta } from "./config.js";

export function localPoint(ship, point) {
  const dx = point.x - ship.x,
    dy = point.y - ship.y;
  return {
    x: dx * Math.cos(ship.heading) + dy * Math.sin(ship.heading),
    y: -dx * Math.sin(ship.heading) + dy * Math.cos(ship.heading),
  };
}
export function worldPoint(ship, x, y = 0) {
  return {
    x: ship.x + x * Math.cos(ship.heading) - y * Math.sin(ship.heading),
    y: ship.y + x * Math.sin(ship.heading) + y * Math.cos(ship.heading),
  };
}
export function aspect(incomingAngle, heading) {
  return (
    (Math.acos(clamp(Math.abs(Math.cos(incomingAngle - heading)), 0, 1)) *
      180) /
    Math.PI
  );
}
export const classifyZone = (x) =>
  x > C.zoneCut ? "BOW" : x < -C.zoneCut ? "STERN" : "MIDSHIPS";

// Slab intersection in hull coordinates. Segment sweep avoids fast-shell tunnelling.
export function hullIntersection(start, end, ship) {
  const a = localPoint(ship, start),
    b = localPoint(ship, end);
  let enter = 0,
    exit = 1;
  for (const [axis, half] of [
    ["x", C.length / 2],
    ["y", C.beam / 2],
  ]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(a[axis]) > half) return null;
      continue;
    }
    let t0 = (-half - a[axis]) / delta,
      t1 = (half - a[axis]) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return null;
  }
  const local = { x: a.x + (b.x - a.x) * enter, y: a.y + (b.y - a.y) * enter };
  return {
    fraction: enter,
    local,
    point: worldPoint(ship, local.x, local.y),
    zone: classifyZone(local.x),
    side: Math.abs(local.y) < 1 ? "CENTER" : local.y < 0 ? "PORT" : "STARBOARD",
  };
}

export function turretCanBear(ship, index, worldAngle) {
  const center = index < 2 ? 0 : Math.PI;
  return Math.abs(angleDelta(ship.heading + center, worldAngle)) <= C.turretArc;
}
// Physical lateral half-width, converted to an angular offset at launch.
// Uniform bounded dispersion; no hit/miss roll and no outcome-dependent spread.
export function dispersionHalfWidth(range) {
  return (
    C.dispersionBaseHalfWidth +
    C.dispersionLinear * range +
    C.dispersionQuadratic * range * range
  );
}
export function aimSolution(ship, track, index, zone) {
  if (track?.kind !== "TARGET_TRACK" || "vx" in track || "speed" in track)
    throw new Error(
      "Gun director requires a TargetTrack, not a physical target",
    );
  const target = {
    ...track.position,
    heading: track.estimatedHeading ?? 0,
    vx: track.estimatedVelocity.x ?? 0,
    vy: track.estimatedVelocity.y ?? 0,
  };
  const origin = worldPoint(ship, C.turretOffsets[index]);
  const aim = worldPoint(
    target,
    zone === "BOW" ? C.zoneAim : zone === "STERN" ? -C.zoneAim : 0,
  );
  const dx = aim.x - origin.x,
    dy = aim.y - origin.y;
  const a = target.vx ** 2 + target.vy ** 2 - C.shellSpeed ** 2;
  const b = 2 * (dx * target.vx + dy * target.vy),
    c = dx ** 2 + dy ** 2;
  const disc = Math.max(0, b * b - 4 * a * c);
  const roots =
    Math.abs(a) < 1e-9
      ? [-c / b]
      : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)];
  const positive = roots.filter((t) => t >= 0 && Number.isFinite(t));
  const time = positive.length
    ? Math.min(...positive)
    : Math.sqrt(c) / C.shellSpeed;
  return {
    origin,
    usable: track.quality !== "LOST" && track.estimatedSpeed !== null,
    flightTimeSeconds: time,
    angle: Math.atan2(dy + target.vy * time, dx + target.vx * time),
    range: Math.sqrt(c),
  };
}

export function resolveImpact(
  shell,
  target,
  hit,
  random,
  moduleRandom = random,
) {
  const targetAspect = aspect(shell.angle, target.heading),
    incidence = 90 - targetAspect;
  let outcome = "PENETRATION",
    rawDamage = shell.type === "HE" ? C.heDamage : C.apDamage;
  if (shell.type === "AP") {
    const ricochet =
      incidence >= C.ricochetAuto ||
      (incidence > C.ricochetStart &&
        random() <
          (incidence - C.ricochetStart) / (C.ricochetAuto - C.ricochetStart));
    const armor =
      (hit.zone === "MIDSHIPS" ? C.belt : C.endArmor) /
      Math.max(0.15, Math.sin((targetAspect * Math.PI) / 180));
    const pen = C.penetration - shell.distance * C.rangePenLoss;
    if (ricochet) outcome = "RICOCHET";
    else if (pen < armor) outcome = "NONPEN";
    else if (hit.zone === "MIDSHIPS" && targetAspect >= C.citadelAspect) {
      outcome = "CITADEL";
      rawDamage *= C.citadelMultiplier;
    }
  }
  const damage = ["RICOCHET", "NONPEN"].includes(outcome) ? 0 : rawDamage;
  let moduleEffect = null;
  if (damage && moduleRandom() < C.moduleChance)
    moduleEffect =
      hit.zone === "BOW"
        ? "TURRET"
        : hit.zone === "MIDSHIPS"
          ? "ENGINE"
          : "STEERING";
  return {
    shooter: shell.shooter,
    target: target.id,
    shellType: shell.type,
    aimZone: shell.aimZone,
    actualImpactZone: hit.zone,
    side: hit.side,
    targetAspect,
    range: shell.distance,
    outcome,
    rawDamage,
    finalDamage: damage,
    moduleEffect,
    point: hit.point,
    launchedAtMs: shell.launchedAtMs ?? null,
    launchTrack: shell.launchTrack ?? null,
    analysisLabel: "GROUND TRUTH - ANALYSIS ONLY",
  };
}
