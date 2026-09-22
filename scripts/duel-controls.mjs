import { mkdir, writeFile, readFile } from "node:fs/promises";
import { DuelRunner } from "../duel/runner.js";
import { CONFIG as C } from "../duel/config.js";

// Frozen evaluation set; repeated roles/mirrors are NOT independent evidence.
const seeds = [
  1,
  7,
  42,
  2026,
  9001,
  ...Array.from({ length: 27 }, (_, i) => 100 + i),
];
const results = [],
  checks = [];
function run(seed, scenario, contenderShip, swapped, reverse = false) {
  const r = new DuelRunner({
    seed,
    scenario,
    contenderShip,
    swapped,
    clock: () => 0,
    wallClock: () => 0,
    battleId: `control-${scenario}-${seed}-${contenderShip}-${swapped ? "BA" : "AB"}`,
  });
  if (reverse) r.sim.ships.reverse();
  while (r.sim.status === "RUNNING") r.tick();
  const summary = r.summary();
  delete summary.configuration;
  summary.ships.sort((a, b) => a.id.localeCompare(b.id));
  return summary;
}
function equivalent(a, b) {
  return (
    a.status === "COMPLETE" &&
    b.status === "COMPLETE" &&
    a.winner === b.winner &&
    a.battleDurationMs === b.battleDurationMs &&
    a.ships.every(
      (s, i) =>
        Math.abs(s.endingHp - b.ships[i].endingHp) < 1e-6 &&
        [
          "shots",
          "hits",
          "RICOCHET",
          "NONPEN",
          "PENETRATION",
          "CITADEL",
          "modulesCaused",
        ].every((k) => s[k] === b.ships[i][k]),
    )
  );
}
for (const scenario of Object.keys(C.scenarios))
  for (const seed of seeds) {
    const group = [];
    for (const contenderShip of ["bravo", "alpha"])
      for (const swapped of [false, true])
        group.push(run(seed, scenario, contenderShip, swapped));
    results.push(...group);
    checks.push({
      seed,
      scenario,
      physicalSymmetry:
        equivalent(group[0], group[1]) && equivalent(group[2], group[3]),
      roleParity: equivalent(group[0], group[2]),
      repeatability: equivalent(group[0], run(seed, scenario, "bravo", false)),
      reverseUpdateOrder: equivalent(
        group[0],
        run(seed, scenario, "bravo", false, true),
      ),
    });
  }
function aggregate(rows) {
  const ships = rows.flatMap((r) => r.ships),
    sum = (k) => ships.reduce((n, s) => n + (s[k] ?? 0), 0);
  const shots = sum("shots"),
    hits = sum("hits"),
    durations = rows.map((r) => r.battleDurationMs).sort((a, b) => a - b);
  const winCounts = (key) => {
    if (!ships.every((s) => s[key] !== undefined)) return null;
    const wins = {};
    for (const r of rows) {
      const winner =
        r.winner === "DRAW"
          ? "DRAW"
          : r.ships.find((s) => s.id === r.winner)?.[key];
      wins[winner] = (wins[winner] ?? 0) + 1;
    }
    return wins;
  };
  const metrics = Object.fromEntries(
    [
      "positionError",
      "velocityError",
      "speedError",
      "headingErrorDegrees",
      "confidence",
      "uncertainty",
    ].map((key) => {
      const valid = rows
        .map((r) => r.trackMetrics?.[key])
        .filter((v) => v?.count);
      const count = valid.reduce((n, v) => n + v.count, 0);
      return [
        key,
        {
          count,
          mean: count
            ? valid.reduce((n, v) => n + v.mean * v.count, 0) / count
            : null,
        },
      ];
    }),
  );
  return {
    trials: rows.length,
    winsByShip: winCounts("id"),
    winsByPhysicalSide: winCounts("startingSide"),
    winsByRngRole: winCounts("rngRole"),
    shots,
    hits,
    hitRate: hits / shots,
    outcomes: Object.fromEntries(
      ["RICOCHET", "NONPEN", "PENETRATION", "CITADEL"].map((k) => [
        k,
        { count: sum(k), perImpact: sum(k) / hits, perShot: sum(k) / shots },
      ]),
    ),
    meanDurationMs: durations.reduce((a, b) => a + b, 0) / rows.length,
    medianDurationMs:
      (durations[Math.floor((durations.length - 1) / 2)] +
        durations[Math.floor(durations.length / 2)]) /
      2,
    meanShotsPerBattle: shots / rows.length,
    moduleImpairments: sum("modulesCaused"),
    observedFiringOpportunities: sum("observedFiringOpportunities"),
    usedFiringOpportunities: ships.every(
      (s) => s.usedFiringOpportunities !== undefined,
    )
      ? sum("usedFiringOpportunities")
      : null,
    firingTicks: sum("firingTicks"),
    trackMetrics: metrics,
  };
}
const baseline = JSON.parse(
  await readFile(
    new URL("../docs/duel-evidence/control-results.json", import.meta.url),
    "utf8",
  ),
);
const report = {
  description:
    "Offline mechanical and information parity controls; not intelligence superiority or Jev performance evidence. No paid calls.",
  configuration: C,
  seeds,
  uniqueSeeds: seeds.length,
  scenarios: Object.keys(C.scenarios),
  trials: results.length,
  independentSeedScenarios: seeds.length * Object.keys(C.scenarios).length,
  roleMeaning:
    "Both use deterministic rules; contenderShip crosses the slot reserved for Jev in live trials. Repeated roles and mirrored sides are paired controls, not independent samples.",
  checks,
  passedChecks: checks.filter(
    (c) =>
      c.physicalSymmetry &&
      c.roleParity &&
      c.repeatability &&
      c.reverseUpdateOrder,
  ).length,
  aggregate: aggregate(results),
  byScenario: Object.fromEntries(
    Object.keys(C.scenarios).map((s) => [
      s,
      aggregate(results.filter((r) => r.scenario === s)),
    ]),
  ),
  matchedOriginalSeeds: aggregate(
    results.filter(
      (r) =>
        r.scenario === "HEAD_ON" &&
        r.contenderShip === "bravo" &&
        baseline.seeds.includes(r.seed),
    ),
  ),
  originalBaseline: aggregate(baseline.results),
  results,
};
await mkdir("output/evals", { recursive: true });
await writeFile(
  "output/evals/revised-controls.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      uniqueSeeds: seeds.length,
      trials: report.trials,
      checks: checks.length,
      passedChecks: report.passedChecks,
      aggregate: report.aggregate,
      matchedOriginalSeeds: report.matchedOriginalSeeds,
      originalBaseline: report.originalBaseline,
    },
    null,
    2,
  ),
);
if (report.passedChecks !== checks.length) process.exitCode = 1;
