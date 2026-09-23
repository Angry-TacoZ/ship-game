import { CONFIG as C } from "./config.js";
import { DuelRunner } from "./runner.js";
import { liveAdapter, mockAdapter } from "./client.js";
import { tacticalSnapshot } from "./simulation.js";
import { renderArena } from "./render.js";
import { OpponentObservationState } from "./observation.js";

const $ = (id) => document.getElementById(id),
  canvas = $("arena");
let runner = new DuelRunner(),
  running = false,
  accumulator = 0,
  previous = performance.now(),
  uiAt = 0,
  liveConfig = null;
const verify = new URLSearchParams(location.search).has("verify-duel");
const fmt = (v) => (Number.isFinite(v) ? `${v.toFixed(0)} ms` : "—");
const text = (id, value) => {
  $(id).textContent = value;
};
const labels = () =>
  ["alpha", "bravo"].map((id) =>
    runner.controller(id) === "MOCK_DELAYED_RULES"
      ? "MOCK RULES"
      : runner.controller(id),
  );

function panel(id) {
  const detailWasOpen = $(id).querySelector("details")?.open;
  const s = runner.sim.ships.find((s) => s.id === id),
    snapshot = tacticalSnapshot(runner.sim, id),
    self = snapshot.self,
    e = runner.latest[id];
  const pending = runner.pending?.event.ship === id && runner.pending;
  const track = snapshot.opponent.track;
  const estimated = (v, degrees = false) =>
    v === null
      ? "unknown"
      : `~${(degrees ? (v * 180) / Math.PI : v).toFixed(1)}${degrees ? "°" : ""}`;
  const turrets = self.turrets
    .map(
      (t, i) =>
        `<div class="turret ${t.readyToFire ? "ready" : ""}"><b>${i < 2 ? "F" : "A"}${(i % 2) + 1}</b>${t.impairedMs > 0 ? "JAM" : t.loaded ? "RDY" : Math.round(t.reloadPct * 100) + "%"}<br>${t.canBear ? "ARC ✓" : "BLIND"}</div>`,
    )
    .join("");
  // Values here are enums/numbers produced by validated simulation contracts, never raw provider text.
  const confidence = e?.answers
    ? Object.entries(e.answers)
        .map(([k, a]) => `${k}: ${(a.confidence * 100).toFixed(0)}%`)
        .join(" · ")
    : "No provider confidence";
  $(id).innerHTML =
    `<div class="panel-heading"><span>${id === "alpha" ? "α" : "β"} ${labels()[id === "alpha" ? 0 : 1]}</span><small>${s.startingSide} / ${s.rngRole}</small></div>
    <div class="hp">${s.hp.toFixed(0)} <small>/ ${C.hp} HP</small></div><meter min="0" max="${C.hp}" value="${s.hp}"></meter>
    <div class="intent">${s.action.maneuver} · ${s.action.fire}</div>
    <div class="panel-grid"><span>${s.action.shell} → ${s.action.aimZone}</span><span>${self.loadedGunsBearing}/4 loaded & bearing</span>
    <span>Range ${self.range.toFixed(0)} u</span><span>Aspect ${self.aspect.toFixed(0)}°</span>
    <span class="wide muted">B ${s.zones.BOW.toFixed(0)} · M ${s.zones.MIDSHIPS.toFixed(0)} · S ${s.zones.STERN.toFixed(0)}</span>
    <span class="wide">Own modules: engine ${self.modules.engine > 0 ? "IMPAIRED" : "OK"} · helm ${self.modules.steering > 0 ? "IMPAIRED" : "OK"}</span>
    <span class="wide muted">Damage ${s.stats.damageDealt.toFixed(0)} · Hits ${s.stats.hits} / Shots ${s.stats.shots}</span>
    <span class="wide muted">Bounce ${s.stats.RICOCHET} · Pen ${s.stats.PENETRATION} · Cit ${s.stats.CITADEL}</span></div>
    <div class="turrets">${turrets}</div>
    <div class="track-panel"><b>OPPONENT TRACK · ${track.quality}</b><br>
    Est. speed ${estimated(track.estimatedSpeed)} u/s · heading ${estimated(track.estimatedHeading, true)}<br>
    ${track.turnTrend.replaceAll("_", " ")} · ${track.speedTrend.replaceAll("_", " ")}<br>
    Age ${fmt(track.trackAgeMs)} · confidence ${(track.confidence.overall * 100).toFixed(0)}%<br>
    Position uncertainty ±${track.positionUncertainty.toFixed(1)} u · ${track.maturity}<br>
    <b>OBSERVED DAMAGE</b> · Engine ${snapshot.opponent.visibleModules.engineImpaired ? "IMPAIRED" : "OK"} · Steering ${snapshot.opponent.visibleModules.steeringImpaired ? "IMPAIRED" : "OK"} · Forward battery ${snapshot.opponent.visibleModules.forwardTurretImpaired ? "IMPAIRED" : "OK"}<br>
    <b>ENEMY FIRE</b> · ${snapshot.opponent.enemyFire.status.replaceAll("_", " ")} · Last salvo observed ${snapshot.opponent.enemyFire.lastSalvoObservedAgeMs === null ? "never" : `${(snapshot.opponent.enemyFire.lastSalvoObservedAgeMs / 1000).toFixed(1)} s ago`}</div>
    <div class="state-line ${pending ? "pending" : ""}">${pending ? `● ${pending.ready ? "DELAY INJECTION" : "REQUEST PENDING"} · holding intent<br>Snapshot ${fmt(runner.sim.timeMs - pending.event.snapshot.timeMs)} old` : e?.ruleId ? `${e.ruleId}<br>Computed in ${e.computationLatencyMs.toFixed(3)} ms` : e ? `APPLIED · snapshot ${fmt(e.stateAgeAtApplyMs)} old<br>${runner.mode === "MOCK" ? "MOCK one-hot fixture · " : ""}${confidence}` : "Awaiting first decision"}</div>`;
  if (e?.answers) {
    const detail = document.createElement("details"),
      summary = document.createElement("summary"),
      pre = document.createElement("pre");
    summary.textContent = "Choice probabilities";
    pre.textContent = JSON.stringify(e.answers, null, 2);
    pre.style.cssText = "font-size:10px;max-height:170px;overflow:auto";
    detail.append(summary, pre);
    $(id).append(detail);
    detail.open = !!detailWasOpen;
  }
}
function refresh() {
  panel("alpha");
  panel("bravo");
  const sim = runner.sim,
    sec = sim.timeMs / 1000;
  text(
    "clock",
    `${String(Math.floor(sec / 60)).padStart(2, "0")}:${(sec % 60).toFixed(1).padStart(4, "0")} / 02:00`,
  );
  text(
    "battle-status",
    `${sim.status !== "RUNNING" ? sim.status : running ? "RUNNING" : "READY"} / ${runner.mode} / SEED ${sim.seed} / +${runner.injectedDelayMs} MS`,
  );
  $("legend-bravo").lastChild.textContent = ` β ${labels()[1]}`;
  $("legend-alpha").lastChild.textContent = ` α ${labels()[0]}`;
  const latest = runner.latest[runner.contenderShip];
  text("provider-ms", fmt(latest?.providerLatencyMs));
  text(
    "age-ms",
    runner.mode === "CONTROL" ? "—" : fmt(latest?.stateAgeAtApplyMs),
  );
  text("missed", runner.missed);
  text(
    "timing-title",
    runner.pending
      ? `The world is moving. ${runner.controller(runner.contenderShip)} is waiting.`
      : "Decisions share a 250 ms cadence.",
  );
  text(
    "timing-detail",
    runner.mode === "CONTROL"
      ? "Both policies receive the same observation schema and use the same helm and fire control."
      : latest
        ? `Last applied: ${latest.action.maneuver}. Range changed ${latest.stateChange.rangeDelta.toFixed(1)} u; enemy aspect changed ${latest.stateChange.aspectDelta.toFixed(1)}°; HP changed ${latest.stateChange.hpDelta.toFixed(0)} while waiting.`
        : "The previous committed intent continues while an asynchronous decision is pending.",
  );
  const hits = sim.impacts.slice(-3).reverse();
  text(
    "impact-feed",
    hits.length
      ? hits
          .map(
            (h) =>
              `${(h.timeMs / 1000).toFixed(1)}s · ${h.shooter === "alpha" ? "α" : "β"} ${h.shellType} → ${h.actualImpactZone} ${h.side} · ${h.outcome} · ${h.finalDamage.toFixed(0)} dmg${h.moduleEffect ? " · " + h.moduleEffect : ""}`,
          )
          .join("\n")
      : "Awaiting first salvo.",
  );
  $("impact-feed").style.whiteSpace = "pre-line";
  if (sim.status !== "RUNNING") showResult();
}
function showResult() {
  const s = runner.summary();
  $("results").hidden = false;
  text(
    "result-title",
    s.status === "INVALID"
      ? `INVALID · ${s.invalidReason}`
      : s.winner === "DRAW"
        ? "DRAW · time limit or simultaneous destruction"
        : `${s.winner === "alpha" ? `α ${labels()[0]}` : `β ${labels()[1]}`} wins`,
  );
  text(
    "result-detail",
    `${(s.battleDurationMs / 1000).toFixed(1)} seconds · seed ${s.seed} · ${s.mode} · ${s.benchmarkEligible ? "eligible live trial" : "not a real Jev benchmark result"}`,
  );
  const rows = [
    ["Metric", "α", "β"],
    ["Ending HP", ...s.ships.map((s) => s.endingHp.toFixed(0))],
    ["Damage dealt", ...s.ships.map((s) => s.damageDealt.toFixed(0))],
    ["Shots / hits", ...s.ships.map((s) => `${s.shots} / ${s.hits}`)],
    ["AP / HE", ...s.ships.map((s) => `${s.AP} / ${s.HE}`)],
    ["Ricochet / nonpen", ...s.ships.map((s) => `${s.RICOCHET} / ${s.NONPEN}`)],
    ["Pen / citadel", ...s.ships.map((s) => `${s.PENETRATION} / ${s.CITADEL}`)],
    ["Decisions", ...s.ships.map((s) => s.totalDecisions)],
  ];
  $("result-table").replaceChildren();
  const table = document.createElement("table");
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    r.forEach((v) => {
      const cell = document.createElement(i ? "td" : "th");
      cell.textContent = v;
      tr.append(cell);
    });
    table.append(tr);
  });
  $("result-table").append(table);
  running = false;
  $("stop").disabled = true;
}
function start() {
  if (!$("controls").reportValidity()) return;
  if ($("mode").value === "JEV" && !liveConfig?.liveEnabled) {
    text(
      "notice",
      "Live Jev requires the local server and server-side environment settings.",
    );
    return;
  }
  runner.dispose();
  const mode = $("mode").value;
  runner = new DuelRunner({
    seed: Number($("seed").value),
    swapped: $("swapped").checked,
    contenderShip: $("contender").value,
    scenario: $("scenario").value,
    mode,
    injectedDelayMs: Number($("delay").value),
    requestDecision:
      mode === "JEV"
        ? liveAdapter(liveConfig.token)
        : mode === "MOCK"
          ? mockAdapter()
          : null,
  });
  running = true;
  accumulator = 0;
  previous = performance.now();
  $("results").hidden = true;
  $("stop").disabled = false;
  text(
    "notice",
    mode === "CONTROL"
      ? "Control condition. Both ships use the same transparent rules. No provider calls."
      : mode === "MOCK"
        ? "MOCK ONLY · delayed deterministic rules, 180 ms simulated provider wait. This is not Jev."
        : `LIVE JEV · ${liveConfig.model} · uses your configured TypeSafe account. Keep this tab visible. Stop ends requests.`,
  );
  refresh();
}
$("controls").addEventListener("submit", (e) => {
  e.preventDefault();
  start();
});
$("restart").onclick = start;
$("new-seed").onclick = () => {
  $("seed").value = crypto.getRandomValues(new Uint32Array(1))[0];
  start();
};
$("mirror").onclick = () => {
  $("swapped").checked = !$("swapped").checked;
  start();
};
$("stop").onclick = () => {
  runner.sim.invalidate("Stopped by observer");
  runner.dispose();
  running = false;
  refresh();
};
function download(name, type, data) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  download(
    `duel-${runner.battleId}.json`,
    "application/json",
    JSON.stringify(runner.export()),
  );
$("csv").onclick = () => {
  const s = runner.summary();
  const rows = [
    [
      "battleId",
      "seed",
      "mode",
      "status",
      "winner",
      "durationMs",
      "side",
      "shipId",
      "rngRole",
      "scenario",
      "contenderShip",
      "controller",
      "hp",
      "damage",
      "shots",
      "hits",
    ],
    ...s.ships.map((p) => [
      s.battleId,
      s.seed,
      s.mode,
      s.status,
      s.winner,
      s.battleDurationMs,
      p.startingSide,
      p.id,
      p.rngRole,
      s.scenario,
      s.contenderShip,
      p.controller,
      p.endingHp,
      p.damageDealt,
      p.shots,
      p.hits,
    ]),
  ];
  download(
    `duel-${runner.battleId}.csv`,
    "text/csv",
    rows
      .map((r) => r.map((v) => JSON.stringify(String(v ?? ""))).join(","))
      .join("\r\n"),
  );
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running && runner.mode === "JEV") {
    runner.sim.invalidate(
      "Live tab hidden: wall/simulation timing compromised",
    );
    runner.dispose();
    refresh();
  }
});
function animate(now) {
  const elapsed = now - previous;
  previous = now;
  if (running) {
    if (runner.mode === "JEV" && elapsed > 250) {
      runner.sim.invalidate("Browser stall exceeded 250 ms");
      runner.dispose();
    } else {
      accumulator += Math.min(elapsed, 250);
      while (accumulator >= 1000 / 60 && runner.sim.status === "RUNNING") {
        runner.tick();
        accumulator -= 1000 / 60;
      }
    }
  }
  renderArena(canvas, runner.sim, {
    labels: labels(),
    arcs: $("arcs").checked,
  });
  if (now - uiAt > 150) {
    refresh();
    uiAt = now;
  }
  requestAnimationFrame(animate);
}
window.render_game_to_text = () =>
  JSON.stringify({
    coordinates:
      "origin top-left; x right, y down; heading radians clockwise from east",
    mode: runner.mode,
    status: runner.sim.status,
    timeMs: runner.sim.timeMs,
    seed: runner.sim.seed,
    pending: !!runner.pending,
    missed: runner.missed,
    ships: runner.sim.ships.map((s) => ({
      geometryLabel: "GROUND TRUTH - ANALYSIS ONLY",
      id: s.id,
      x: s.x,
      y: s.y,
      heading: s.heading,
      hp: s.hp,
      action: s.action,
      observation: tacticalSnapshot(runner.sim, s.id),
    })),
  });
window.advanceTime = (ms) => {
  if (runner.mode === "JEV")
    throw new Error("Live benchmark cannot fast-forward");
  for (let n = 0; n < Math.round(ms / (1000 / 60)); n++) runner.tick();
  renderArena(canvas, runner.sim, {
    labels: labels(),
    arcs: $("arcs").checked,
  });
  refresh();
};
if (verify)
  window.__duel = {
    get runner() {
      return runner;
    },
    start,
    refresh,
    scene(name) {
      running = false;
      runner.dispose();
      runner = new DuelRunner();
      const [a, b] = runner.sim.ships;
      a.x = 500;
      a.y = 500;
      b.x = 1050;
      b.y = 500;
      a.heading = 0;
      b.heading = name === "bow" ? Math.PI : Math.PI / 2;
      runner.sim.opponentObservations = {
        alpha: new OpponentObservationState(),
        bravo: new OpponentObservationState(),
      };
      runner.sim.trackers = Object.fromEntries(
        Object.entries(runner.sim.opponentObservations).map(([id, state]) => [
          id,
          state.tracker,
        ]),
      );
      runner.sim.trackResearch = [];
      runner.sim.observeOpponents();
      for (const s of [a, b])
        s.turrets.forEach((t, i) => {
          t.angle = s.heading + (i < 2 ? 0 : Math.PI);
        });
      if (name === "modules") {
        b.modules.engine = 3000;
        b.modules.steering = 2000;
        b.turrets[0].impaired = 4000;
        b.zones.BOW = 500;
        b.hp = 6500;
        runner.sim.impacts = ["BOW", "MIDSHIPS", "STERN"].map((zone, i) => ({
          timeMs: 0,
          shooter: "alpha",
          target: "bravo",
          shellType: "AP",
          actualImpactZone: zone,
          side: "PORT",
          outcome: "PENETRATION",
          finalDamage: 310,
          point: { x: b.x, y: b.y + (1 - i) * 43 },
          moduleEffect: i === 0 ? "TURRET" : i === 1 ? "ENGINE" : "STEERING",
        }));
      }
      if (name === "modules") {
        runner.sim.timeMs += C.observationIntervalMs;
        runner.sim.observeOpponents();
      }
      renderArena(canvas, runner.sim, { labels: labels(), arcs: true });
      refresh();
    },
  };
// Static hosting still supports controls and mocks; live config is only requested on loopback.
if (location.hostname === "127.0.0.1")
  fetch("/api/config")
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      liveConfig = c;
      if (c?.liveEnabled) {
        const option = $("mode").querySelector("[value=JEV]");
        option.disabled = false;
        option.textContent = `Live Jev · ${c.model}`;
      }
    })
    .catch(() => {});
refresh();
requestAnimationFrame(animate);
