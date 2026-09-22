import { mkdir, writeFile } from "node:fs/promises";
import { DuelRunner } from "../duel/runner.js";

// Offline, sequential mirrored controls. No adapter, fetch, secrets or accelerated live mode.
const seeds = [1, 7, 42, 2026, 9001];
const results = [];
for (const seed of seeds)
  for (const swapped of [false, true]) {
    const runner = new DuelRunner({
      seed,
      swapped,
      battleId: `control-${seed}-${swapped ? "BA" : "AB"}`,
    });
    while (runner.sim.status === "RUNNING") runner.tick();
    results.push(runner.summary());
  }
const pairs = seeds.map((seed) => {
  const [a, b] = results.filter((r) => r.seed === seed);
  return {
    seed,
    sameWinner: a.winner === b.winner,
    sameDuration: a.battleDurationMs === b.battleDurationMs,
    maxHpDifference: Math.max(
      ...a.ships.map((s, i) => Math.abs(s.endingHp - b.ships[i].endingHp)),
    ),
  };
});
const report = {
  description:
    "Software parity controls only. No Jev calls or comparative Jev conclusions.",
  seeds,
  trials: results.length,
  passedPairs: pairs.filter(
    (p) => p.sameWinner && p.sameDuration && p.maxHpDifference < 1e-6,
  ).length,
  pairs,
  results,
};
await mkdir("output/evals", { recursive: true });
await writeFile(
  "output/evals/control-results.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    { trials: report.trials, passedPairs: report.passedPairs, pairs },
    null,
    2,
  ),
);
if (report.passedPairs !== seeds.length) process.exitCode = 1;
