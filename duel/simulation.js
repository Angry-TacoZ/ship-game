import {
  CONFIG as C,
  INITIAL_ACTION,
  clamp,
  angleDelta,
  approach,
  rng,
  validateAction,
} from "./config.js";
import {
  worldPoint,
  aspect,
  turretCanBear,
  aimSolution,
  hullIntersection,
  resolveImpact,
} from "./combat.js";

export class DuelShip {
  constructor(id, side, seed) {
    this.id = id;
    this.startingSide = side;
    this.x = side === "A" ? 420 : C.width - 420;
    this.y = C.height / 2;
    this.heading = side === "A" ? 0.15 : Math.PI + 0.15;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.hp = C.hp;
    this.zones = { BOW: C.hp / 4, MIDSHIPS: C.hp / 2, STERN: C.hp / 4 };
    this.modules = { engine: 0, steering: 0 };
    this.turrets = C.turretOffsets.map((_, i) => ({
      angle: this.heading + (i < 2 ? 0 : Math.PI),
      reload: 0,
      impaired: 0,
    }));
    this.action = { ...INITIAL_ACTION };
    this.holdHeading = this.heading;
    this.lastSalvoMs = null;
    this.random = rng(seed);
    this.stats = {
      damageDealt: 0,
      damageReceived: 0,
      shots: 0,
      hits: 0,
      AP: 0,
      HE: 0,
      RICOCHET: 0,
      NONPEN: 0,
      PENETRATION: 0,
      CITADEL: 0,
      zones: { BOW: 0, MIDSHIPS: 0, STERN: 0 },
      modulesCaused: 0,
    };
    this.blocked = [];
    this.boundaryBlocked = false;
  }
  commit(action) {
    if (
      action.maneuver === "HOLD_COURSE" &&
      this.action.maneuver !== "HOLD_COURSE"
    )
      this.holdHeading = this.heading;
    this.action = validateAction(action);
  }
  move(target) {
    const bearing = Math.atan2(target.y - this.y, target.x - this.x);
    const offsets = {
      CLOSE: 0,
      OPEN_RANGE: Math.PI,
      ANGLE_IN_PORT: Math.PI / 6,
      ANGLE_IN_STARBOARD: -Math.PI / 6,
      ANGLE_AWAY_PORT: (Math.PI * 5) / 6,
      ANGLE_AWAY_STARBOARD: (-Math.PI * 5) / 6,
      BROADSIDE_PORT: Math.PI / 2,
      BROADSIDE_STARBOARD: -Math.PI / 2,
    };
    const desired =
      this.action.maneuver === "HOLD_COURSE"
        ? this.holdHeading
        : bearing + offsets[this.action.maneuver];
    const error = angleDelta(this.heading, desired);
    this.heading += clamp(
      error,
      -C.turnRate * C.dt * (this.modules.steering > 0 ? C.steeringFactor : 1),
      C.turnRate * C.dt * (this.modules.steering > 0 ? C.steeringFactor : 1),
    );
    const engine = this.modules.engine > 0 ? C.engineFactor : 1;
    const desiredSpeed =
      C.maxSpeed *
      engine *
      Math.max(0.4, 1 - (Math.abs(error) / Math.PI) * 0.6);
    this.speed = approach(
      this.speed,
      desiredSpeed,
      (desiredSpeed > this.speed ? C.acceleration * engine : C.deceleration) *
        C.dt,
    );
    this.vx = Math.cos(this.heading) * this.speed;
    this.vy = Math.sin(this.heading) * this.speed;
    const nx = this.x + this.vx * C.dt,
      ny = this.y + this.vy * C.dt,
      margin = C.length / 2;
    this.boundaryBlocked =
      nx < margin ||
      nx > C.width - margin ||
      ny < margin ||
      ny > C.height - margin;
    // No sliding/teleporting: stop propulsion at the wall but retain turn authority.
    if (this.boundaryBlocked) {
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
    } else {
      this.x = nx;
      this.y = ny;
    }
    for (const key of Object.keys(this.modules))
      this.modules[key] = Math.max(0, this.modules[key] - C.dt * 1000);
  }
  weapons(target, timeMs) {
    const shells = [];
    this.blocked = [];
    this.turrets.forEach((turret, i) => {
      turret.reload = Math.max(0, turret.reload - C.dt * 1000);
      turret.impaired = Math.max(0, turret.impaired - C.dt * 1000);
      const aim = aimSolution(this, target, i, this.action.aimZone);
      // Traverse in the mount's continuous legal local arc, never through its blind sector.
      const center = this.heading + (i < 2 ? 0 : Math.PI);
      const desired = clamp(
        angleDelta(center, aim.angle),
        -C.turretArc,
        C.turretArc,
      );
      const current = clamp(
        angleDelta(center, turret.angle),
        -C.turretArc,
        C.turretArc,
      );
      turret.angle =
        center +
        approach(
          current,
          desired,
          turret.impaired > 0 ? 0 : C.traverseRate * C.dt,
        );
      const reasons = [];
      if (!turretCanBear(this, i, aim.angle)) reasons.push("ARC");
      if (Math.abs(angleDelta(turret.angle, aim.angle)) > C.alignment)
        reasons.push("TRAVERSE");
      if (turret.reload > 0) reasons.push("RELOAD");
      if (turret.impaired > 0) reasons.push("IMPAIRED");
      if (aim.range > C.maxRange) reasons.push("RANGE");
      if (this.action.fire === "FIRE" && reasons.length)
        this.blocked.push({ turret: i, reasons });
      if (this.action.fire !== "FIRE" || reasons.length) return;
      turret.reload = C.reloadMs;
      this.lastSalvoMs = timeMs;
      for (let b = 0; b < C.barrels; b++) {
        const angle = aim.angle + (this.random() - 0.5) * C.dispersion;
        shells.push({
          ...aim.origin,
          angle,
          shooter: this.id,
          type: this.action.shell,
          aimZone: this.action.aimZone,
          distance: 0,
        });
        this.stats.shots++;
        this.stats[this.action.shell]++;
      }
    });
    return shells;
  }
}

// This is the ONLY policy observation builder. No policy receives a DuelShip.
export function tacticalSnapshot(sim, id) {
  const self = sim.ships.find((s) => s.id === id),
    enemy = sim.ships.find((s) => s.id !== id);
  const bearing = Math.atan2(enemy.y - self.y, enemy.x - self.x),
    range = Math.hypot(enemy.x - self.x, enemy.y - self.y);
  const turrets = self.turrets.map((t, i) => {
    const aim = aimSolution(self, enemy, i, self.action.aimZone);
    const canBear = turretCanBear(self, i, aim.angle),
      error = Math.abs(angleDelta(t.angle, aim.angle));
    return {
      loaded: t.reload <= 0,
      reloadPct: 1 - t.reload / C.reloadMs,
      canBear,
      traverseError: error,
      impairedMs: t.impaired,
      readyToFire:
        canBear &&
        error <= C.alignment &&
        t.reload <= 0 &&
        t.impaired <= 0 &&
        range <= C.maxRange,
    };
  });
  const enemyAspect = aspect(bearing, enemy.heading);
  return {
    schemaVersion: 1,
    timeMs: sim.timeMs,
    self: {
      hp: self.hp,
      hpPct: self.hp / C.hp,
      zones: { ...self.zones },
      modules: { ...self.modules },
      heading: self.heading,
      position: { x: self.x, y: self.y },
      speed: self.speed,
      velocity: { x: self.vx, y: self.vy },
      intent: self.action.maneuver,
      shell: self.action.shell,
      aimZone: self.action.aimZone,
      range,
      relativeBearing: angleDelta(self.heading, bearing),
      aspect: aspect(bearing, self.heading),
      boundaryDistance:
        Math.min(self.x, self.y, C.width - self.x, C.height - self.y) -
        C.length / 2,
      centerBearing: angleDelta(
        self.heading,
        Math.atan2(C.height / 2 - self.y, C.width / 2 - self.x),
      ),
      turrets,
      loadedGunsBearing: turrets.filter(
        (t) => t.loaded && t.canBear && !t.impairedMs,
      ).length,
      firingOpportunity: turrets.some((t) => t.readyToFire),
    },
    opponent: {
      hp: enemy.hp,
      hpPct: enemy.hp / C.hp,
      heading: enemy.heading,
      speed: enemy.speed,
      position: { x: enemy.x, y: enemy.y },
      velocity: { x: enemy.vx, y: enemy.vy },
      range,
      relativeBearing: angleDelta(self.heading, bearing),
      aspect: enemyAspect,
      descriptor:
        enemyAspect < 30
          ? "BOW_OR_STERN_ON"
          : enemyAspect < 65
            ? "ANGLED"
            : "BROADSIDE",
      lastObservedSalvoMs: enemy.lastSalvoMs,
      estimatedReloadMs:
        enemy.lastSalvoMs === null
          ? null
          : Math.max(0, C.reloadMs - (sim.timeMs - enemy.lastSalvoMs)),
      visibleModules: {
        ...enemy.modules,
        forwardTurret: Math.max(
          enemy.turrets[0].impaired,
          enemy.turrets[1].impaired,
        ),
      },
    },
  };
}

export class DuelSimulation {
  constructor({
    seed = 42,
    swapped = false,
    timeLimitMs = C.timeLimitMs,
  } = {}) {
    this.seed = seed >>> 0;
    this.swapped = swapped;
    this.timeLimitMs = timeLimitMs;
    this.tick = 0;
    this.timeMs = 0;
    this.status = "RUNNING";
    this.invalidReason = null;
    this.winner = null;
    this.ships = [
      new DuelShip("alpha", swapped ? "B" : "A", this.seed ^ 0x1234),
      new DuelShip("bravo", swapped ? "A" : "B", this.seed ^ 0x5678),
    ];
    this.projectiles = [];
    this.impacts = [];
    this.frames = [];
  }
  invalidate(reason) {
    this.status = "INVALID";
    this.invalidReason = reason;
    this.winner = null;
  }
  step() {
    if (this.status !== "RUNNING") return;
    this.tick++;
    this.timeMs = (this.tick * 1000) / 60;
    // Read both pre-movement poses before either moves; fire both before damage.
    const poses = this.ships.map((s) => ({ x: s.x, y: s.y }));
    this.ships.forEach((s, i) => s.move(poses[1 - i]));
    this.ships.forEach((s, i) =>
      this.projectiles.push(...s.weapons(this.ships[1 - i], this.timeMs)),
    );
    const pending = [],
      remaining = [];
    for (const shell of this.projectiles) {
      const target = this.ships.find((s) => s.id !== shell.shooter),
        shooter = this.ships.find((s) => s.id === shell.shooter);
      const travel = Math.min(C.shellSpeed * C.dt, C.maxRange - shell.distance);
      const next = {
        x: shell.x + Math.cos(shell.angle) * travel,
        y: shell.y + Math.sin(shell.angle) * travel,
      };
      const hit = hullIntersection(shell, next, target);
      shell.distance += travel * (hit?.fraction ?? 1);
      if (hit) pending.push(resolveImpact(shell, target, hit, shooter.random));
      else if (shell.distance < C.maxRange)
        remaining.push({ ...shell, ...next });
    }
    this.projectiles = remaining;
    // Proportionally allocate overkill damage within a tick: no first-shell credit advantage.
    for (const target of this.ships) {
      const hits = pending.filter((h) => h.target === target.id),
        total = hits.reduce((n, h) => n + h.finalDamage, 0);
      const scale = total ? Math.min(1, target.hp / total) : 1;
      for (const event of hits) {
        event.finalDamage *= scale;
        event.timeMs = this.timeMs;
        const shooter = this.ships.find((s) => s.id === event.shooter);
        target.hp = Math.max(0, target.hp - event.finalDamage);
        target.zones[event.actualImpactZone] = Math.max(
          0,
          target.zones[event.actualImpactZone] - event.finalDamage,
        );
        target.stats.damageReceived += event.finalDamage;
        shooter.stats.damageDealt += event.finalDamage;
        shooter.stats.hits++;
        shooter.stats[event.outcome]++;
        shooter.stats.zones[event.actualImpactZone]++;
        if (event.moduleEffect) {
          shooter.stats.modulesCaused++;
          if (event.moduleEffect === "TURRET")
            target.turrets[event.side === "PORT" ? 0 : 1].impaired =
              C.moduleDurationMs;
          else
            target.modules[event.moduleEffect.toLowerCase()] =
              C.moduleDurationMs;
        }
        this.impacts.push(event);
      }
    }
    if (this.ships.some((s) => s.hp <= 1e-8)) {
      this.status = "COMPLETE";
      const alive = this.ships.filter((s) => s.hp > 1e-8);
      this.winner = alive.length === 1 ? alive[0].id : "DRAW";
    } else if (this.timeMs >= this.timeLimitMs) {
      this.status = "COMPLETE";
      this.winner = "DRAW";
    }
    if (this.tick % 6 === 0 || this.status !== "RUNNING")
      this.frames.push(this.frame());
  }
  frame() {
    return {
      timeMs: this.timeMs,
      ships: this.ships.map((s) => ({
        id: s.id,
        x: s.x,
        y: s.y,
        heading: s.heading,
        hp: s.hp,
        zones: { ...s.zones },
        modules: { ...s.modules },
        action: { ...s.action },
        turrets: s.turrets.map((t) => ({ ...t })),
      })),
      projectiles: this.projectiles.map((p) => ({
        x: p.x,
        y: p.y,
        angle: p.angle,
        type: p.type,
      })),
    };
  }
}
