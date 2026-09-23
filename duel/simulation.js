import {
  CONFIG as C,
  INITIAL_ACTION,
  clamp,
  angleDelta,
  approach,
  rng,
  streamSeed,
  validateAction,
} from "./config.js";
import {
  worldPoint,
  aspect,
  turretCanBear,
  aimSolution,
  hullIntersection,
  resolveImpact,
  dispersionHalfWidth,
} from "./combat.js";
import { OpponentObservationState } from "./observation.js";

export class DuelShip {
  constructor(id, side, seed) {
    this.id = id;
    this.startingSide = side;
    this.x = C.width / 2 + ((side === "A" ? -1 : 1) * C.startingSeparation) / 2;
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
    this.salvoSequence = 0;
    this.rngRole = id === "alpha" ? "R0" : "R1";
    this.streamIds = Object.fromEntries(
      ["dispersion", "armor", "modules", "observation"].map((p) => [
        p,
        `${this.rngRole}:${p}:${streamSeed(seed, this.rngRole, p)}`,
      ]),
    );
    this.streams = Object.fromEntries(
      ["dispersion", "armor", "modules", "observation"].map((p) => [
        p,
        rng(streamSeed(seed, this.rngRole, p)),
      ]),
    );
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
  commit(action, { decisionAtMs = 0, appliedAtMs = decisionAtMs } = {}) {
    if (
      action.maneuver === "HOLD_COURSE" &&
      this.action.maneuver !== "HOLD_COURSE"
    )
      this.holdHeading = this.heading;
    this.action = validateAction(action);
    this.actionDecisionAtMs = decisionAtMs;
    this.actionAppliedAtMs = appliedAtMs;
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
  weapons(target, timeMs, nextProjectileId = () => null) {
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
      const reasons = this.turretConstraints(i, aim);
      if (this.action.fire === "FIRE" && reasons.length)
        this.blocked.push({ turret: i, reasons });
      if (this.action.fire !== "FIRE" || reasons.length) return;
      turret.reload = C.reloadMs;
      this.lastSalvoMs = timeMs;
      this.salvoSequence++;
      for (let b = 0; b < C.barrels; b++) {
        const lateral =
          (2 * this.streams.dispersion() - 1) * dispersionHalfWidth(aim.range);
        const angle = aim.angle + Math.atan2(lateral, Math.max(1, aim.range));
        shells.push({
          projectileId: nextProjectileId(),
          ...aim.origin,
          angle,
          shooter: this.id,
          type: this.action.shell,
          aimZone: this.action.aimZone,
          distance: 0,
          launchedAtMs: timeMs,
          idealAimAngle: aim.angle,
          launchTrack: {
            estimatedTargetPosition: { ...aim.estimatedTargetPosition },
            estimatedTargetVelocity: { ...target.estimatedVelocity },
            estimatedHeading: target.estimatedHeading,
            estimatedAspect: aspect(
              Math.atan2(
                target.position.y - aim.origin.y,
                target.position.x - aim.origin.x,
              ),
              target.estimatedHeading,
            ),
            ageMs: target.trackAgeMs,
            confidence: target.confidence.overall,
            uncertainty: target.positionUncertainty,
            predictedInterceptPoint: { ...aim.predictedInterceptPoint },
            predictedFlightTimeSeconds: aim.flightTimeSeconds,
            decisionAgeMs: Math.max(0, timeMs - (this.actionDecisionAtMs ?? timeMs)),
          },
        });
        this.stats.shots++;
        this.stats[this.action.shell]++;
      }
    });
    return shells;
  }
  turretConstraints(index, aim) {
    const turret = this.turrets[index],
      reasons = [];
    if (!aim.usable) reasons.push("TRACK");
    if (!turretCanBear(this, index, aim.angle)) reasons.push("ARC");
    if (Math.abs(angleDelta(turret.angle, aim.angle)) > C.alignment)
      reasons.push("TRAVERSE");
    if (turret.reload > 0) reasons.push("RELOAD");
    if (turret.impaired > 0) reasons.push("IMPAIRED");
    if (aim.range > C.maxRange) reasons.push("RANGE");
    return reasons;
  }
  actionConstraints(track) {
    if (this.action.fire !== "FIRE") return [];
    return this.turrets
      .map((_, i) => ({
        turret: i,
        reasons: this.turretConstraints(
          i,
          aimSolution(this, track, i, this.action.aimZone),
        ),
      }))
      .filter((c) => c.reasons.length);
  }
}

// This is the ONLY policy observation builder. No policy receives a DuelShip.
export function tacticalSnapshot(sim, id) {
  const self = sim.ships.find((s) => s.id === id),
    observed = sim.opponentObservations[id].estimate(sim.timeMs);
  const track = observed.track;
  const bearing = Math.atan2(
      track.position.y - self.y,
      track.position.x - self.x,
    ),
    range = Math.hypot(track.position.x - self.x, track.position.y - self.y);
  const turrets = self.turrets.map((t, i) => {
    const aim = aimSolution(self, track, i, self.action.aimZone);
    const canBear = turretCanBear(self, i, aim.angle),
      error = Math.abs(angleDelta(t.angle, aim.angle));
    return {
      loaded: t.reload <= 0,
      reloadPct: 1 - t.reload / C.reloadMs,
      canBear,
      traverseError: error,
      impairedMs: t.impaired,
      readyToFire:
        aim.usable &&
        canBear &&
        error <= C.alignment &&
        t.reload <= 0 &&
        t.impaired <= 0 &&
        range <= C.maxRange,
    };
  });
  const enemyAspect = aspect(bearing, track.estimatedHeading ?? bearing);
  return {
    schemaVersion: 3,
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
      hp: observed.hp,
      hpPct: observed.hpPct,
      track: { ...track, aspectEstimate: enemyAspect },
      range,
      relativeBearing: angleDelta(self.heading, bearing),
      descriptor:
        enemyAspect < 30
          ? "BOW_OR_STERN_ON"
          : enemyAspect < 65
            ? "ANGLED"
            : "BROADSIDE",
      enemyFire: observed.enemyFire,
      visibleModules: observed.visibleModules,
    },
  };
}

export class DuelSimulation {
  constructor({
    seed = 42,
    swapped = false,
    scenario = "HEAD_ON",
    timeLimitMs = C.timeLimitMs,
  } = {}) {
    this.seed = seed >>> 0;
    this.swapped = swapped;
    if (!Object.hasOwn(C.scenarios, scenario))
      throw new Error("Invalid scenario");
    this.scenario = scenario;
    this.timeLimitMs = timeLimitMs;
    this.tick = 0;
    this.timeMs = 0;
    this.status = "RUNNING";
    this.invalidReason = null;
    this.winner = null;
    this.ships = [
      new DuelShip("alpha", swapped ? "B" : "A", this.seed),
      new DuelShip("bravo", swapped ? "A" : "B", this.seed),
    ];
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.projectileResearch = [];
    this.projectileResearchById = new Map();
    this.ships.forEach((s, i) => {
      s.heading = C.scenarios[scenario][i] + (swapped ? Math.PI : 0);
      s.holdHeading = s.heading;
      s.turrets.forEach(
        (t, j) => (t.angle = s.heading + (j < 2 ? 0 : Math.PI)),
      );
    });
    this.impacts = [];
    this.frames = [];
    this.opponentObservations = {
      alpha: new OpponentObservationState(),
      bravo: new OpponentObservationState(),
    };
    // Compatibility alias for internal control logic; policy snapshots use the
    // explicit opponent-observation boundary above.
    this.trackers = Object.fromEntries(
      Object.entries(this.opponentObservations).map(([id, state]) => [
        id,
        state.tracker,
      ]),
    );
    this.trackResearch = [];
    this.observationMetrics = { moduleStateDelayMs: [], salvoTimingDelayMs: [] };
    this.moduleTruthState = Object.fromEntries(
      this.ships.map((ship) => [ship.id, this.physicalModuleState(ship)]),
    );
    this.moduleTransitions = Object.fromEntries(
      this.ships.map((ship) => [ship.id, {}]),
    );
    this.observeOpponents();
  }
  physicalModuleState(ship) {
    return {
      engineImpaired: ship.modules.engine > 0,
      steeringImpaired: ship.modules.steering > 0,
      forwardTurretImpaired:
        ship.turrets[0].impaired > 0 || ship.turrets[1].impaired > 0,
    };
  }
  recordModuleTransitions() {
    for (const ship of this.ships) {
      const current = this.physicalModuleState(ship),
        previous = this.moduleTruthState[ship.id];
      for (const key of Object.keys(current))
        if (current[key] !== previous[key])
          this.moduleTransitions[ship.id][key] = this.timeMs;
      this.moduleTruthState[ship.id] = current;
    }
  }
  observeOpponents() {
    for (const observer of this.ships) {
      const target = this.ships.find((s) => s.id !== observer.id);
      const modules = this.physicalModuleState(target);
      const state = this.opponentObservations[observer.id];
      const previous = state.sample;
      const capture = state.capture(
        {
          pose: { x: target.x, y: target.y, heading: target.heading },
          hp: target.hp,
          modules,
          salvoSequence: target.salvoSequence,
        },
        this.timeMs,
        observer.streams.observation,
        this.swapped,
      );
      if (capture.salvoObserved && target.lastSalvoMs != null)
        this.observationMetrics.salvoTimingDelayMs.push(
          this.timeMs - target.lastSalvoMs,
        );
      for (const key of Object.keys(modules))
        if (previous && previous.visibleModules[key] !== modules[key]) {
          const truth = this.moduleTransitions?.[target.id]?.[key];
          if (truth != null) {
            this.observationMetrics.moduleStateDelayMs.push(this.timeMs - truth);
            delete this.moduleTransitions[target.id][key];
          }
        }
      const track = state.tracker.estimate(this.timeMs);
      // Research output only. Never passed back into a snapshot or director.
      this.trackResearch.push({
        label: "GROUND TRUTH - ANALYSIS ONLY",
        timeMs: this.timeMs,
        observer: observer.id,
        positionError: Math.hypot(
          track.position.x - target.x,
          track.position.y - target.y,
        ),
        velocityError:
          track.estimatedSpeed === null
            ? null
            : Math.hypot(
                track.estimatedVelocity.x - target.vx,
                track.estimatedVelocity.y - target.vy,
              ),
        speedError:
          track.estimatedSpeed === null
            ? null
            : Math.abs(track.estimatedSpeed - target.speed),
        headingErrorDegrees:
          (Math.abs(angleDelta(target.heading, track.estimatedHeading)) * 180) /
          Math.PI,
        confidence: track.confidence.overall,
        uncertainty: track.positionUncertainty,
      });
    }
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
    const tracks = Object.fromEntries(
      this.ships.map((s) => [s.id, this.trackers[s.id].estimate(this.timeMs)]),
    );
    this.ships.forEach((s) => s.move(tracks[s.id].position));
    if (this.tick % Math.round(C.observationIntervalMs / (C.dt * 1000)) === 0)
      this.observeOpponents();
    this.ships.forEach((s) =>
      this.projectiles.push(
        ...s.weapons(
          this.trackers[s.id].estimate(this.timeMs),
          this.timeMs,
          () => this.nextProjectileId++,
        ),
      ),
    );
    for (const shell of this.projectiles) {
      if (
        shell.launchTruthRecorded ||
        !shell.launchTrack ||
        shell.projectileId == null
      )
        continue;
      shell.launchTruthRecorded = true;
      const target = this.ships.find((s) => s.id !== shell.shooter),
        origin = { x: shell.x, y: shell.y },
        actualAspect = aspect(
          Math.atan2(origin.y - target.y, origin.x - target.x),
          target.heading,
        );
      const analysis = {
        label: "GROUND TRUTH - ANALYSIS ONLY",
        projectileId: shell.projectileId,
        shooter: shell.shooter,
        target: target.id,
        launchedAtMs: shell.launchedAtMs,
        decisionAgeAtLaunchMs: shell.launchTrack.decisionAgeMs,
        estimatedTargetPositionAtLaunch: { ...shell.launchTrack.estimatedTargetPosition },
        estimatedTargetVelocityAtLaunch: { ...shell.launchTrack.estimatedTargetVelocity },
        estimatedTargetHeadingAtLaunch: shell.launchTrack.estimatedHeading,
        estimatedTargetAspectAtLaunch: shell.launchTrack.estimatedAspect,
        trackConfidenceAtLaunch: shell.launchTrack.confidence,
        trackUncertaintyAtLaunch: shell.launchTrack.uncertainty,
        trackAgeAtLaunchMs: shell.launchTrack.ageMs,
        predictedInterceptPoint: { ...shell.launchTrack.predictedInterceptPoint },
        predictedFlightTimeSeconds: shell.launchTrack.predictedFlightTimeSeconds,
        actualTargetPositionAtLaunch: { x: target.x, y: target.y },
        actualTargetVelocityAtLaunch: { x: target.vx, y: target.vy },
        actualTargetHeadingAtLaunch: target.heading,
        actualTargetAspectAtLaunch: actualAspect,
        trackPositionErrorAtLaunch: Math.hypot(
          shell.launchTrack.estimatedTargetPosition.x - target.x,
          shell.launchTrack.estimatedTargetPosition.y - target.y,
        ),
        trackVelocityErrorAtLaunch: Math.hypot(
          shell.launchTrack.estimatedTargetVelocity.x - target.vx,
          shell.launchTrack.estimatedTargetVelocity.y - target.vy,
        ),
        idealAimAngle: shell.idealAimAngle,
        actualDispersedAngle: shell.angle,
        closestApproachDistance: null,
        actualTargetPositionAtClosestApproach: null,
        actualTargetVelocityAtClosestApproach: null,
        actualTargetHeadingAtClosestApproach: null,
        actualTargetAspectAtClosestApproach: null,
        impact: null,
      };
      this.projectileResearch.push(analysis);
      this.projectileResearchById.set(shell.projectileId, analysis);
    }
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
      const analysis = this.projectileResearchById.get(shell.projectileId);
      if (analysis) {
        const dx = next.x - shell.x,
          dy = next.y - shell.y,
          segment2 = dx * dx + dy * dy,
          fraction = segment2
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((target.x - shell.x) * dx + (target.y - shell.y) * dy) /
                    segment2,
                ),
              )
            : 0,
          closestX = shell.x + dx * fraction,
          closestY = shell.y + dy * fraction,
          distance = Math.hypot(target.x - closestX, target.y - closestY);
        if (
          analysis.closestApproachDistance === null ||
          distance < analysis.closestApproachDistance
        ) {
          analysis.closestApproachDistance = distance;
          analysis.actualTargetPositionAtClosestApproach = {
            x: target.x,
            y: target.y,
          };
          analysis.actualTargetVelocityAtClosestApproach = {
            x: target.vx,
            y: target.vy,
          };
          analysis.actualTargetHeadingAtClosestApproach = target.heading;
          analysis.actualTargetAspectAtClosestApproach = aspect(
            Math.atan2(closestY - target.y, closestX - target.x),
            target.heading,
          );
        }
      }
      const hit = hullIntersection(shell, next, target);
      shell.distance += travel * (hit?.fraction ?? 1);
      if (hit) {
        const impact = resolveImpact(
          shell,
          target,
          hit,
          shooter.streams.armor,
          shooter.streams.modules,
        );
        if (analysis)
          analysis.impact = {
            timeMs: this.timeMs,
            targetPosition: { x: target.x, y: target.y },
            targetVelocity: { x: target.vx, y: target.vy },
            targetHeading: target.heading,
            targetAspect: impact.targetAspect,
            point: { ...impact.point },
            missDistance: 0,
          };
        pending.push(impact);
      } else if (shell.distance < C.maxRange)
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
        event.label = "GROUND TRUTH - ANALYSIS ONLY";
        this.impacts.push(event);
      }
    }
    this.recordModuleTransitions();
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
      label: "GROUND TRUTH - ANALYSIS ONLY",
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
