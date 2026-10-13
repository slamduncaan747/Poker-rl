/**
 * Train the GTO blueprint with parallel external-sampling MCCFR.
 *
 *   npm run train:blueprint -- --minutes 60 --workers 4 --buckets 32
 *
 * Steps:
 *   1. Calibrate percentile thresholds for the postflop card abstraction.
 *   2. Compute the preflop equity / strength table for the 169 hand classes.
 *   3. Run N independent MCCFR workers (worker_threads), each reporting a
 *      convergence log.
 *   4. Merge their average-strategy sums and write the compact blueprint used
 *      by the web app.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  type BlueprintFile,
  CardAbstraction,
  MCCFRTrainer,
  Rng,
  TRAINING_SAMPLING,
  type TrainingLogPoint,
  equityVsRandom,
  handClassCombos,
  mergeStrategySums,
  randomDeal,
  strengthMetric,
} from '@poker-rl/engine';
import { arg, repoRoot } from './util';

interface WorkerInit {
  seed: number;
  seconds: number;
  thresholds: number[][];
  logEvery: number;
}

interface WorkerResult {
  sums: Array<[string, string, number[]]>;
  iterations: number;
  log: TrainingLogPoint[];
}

const here = fileURLToPath(import.meta.url);
const tsWorker = new URL('./tsWorker.mjs', import.meta.url);

function calibrate(buckets: number, samples: number, rng: Rng): number[][] {
  const thresholds: number[][] = [[]];
  for (let street = 1; street <= 3; street++) {
    const values: number[] = [];
    for (let i = 0; i < samples; i++) {
      const d = randomDeal(rng);
      values.push(strengthMetric(street, d.holes[0][0], d.holes[0][1], d.board.slice(0, street + 2), TRAINING_SAMPLING, rng));
    }
    values.sort((a, b) => a - b);
    const cuts: number[] = [];
    for (let b = 1; b < buckets; b++) cuts.push(+values[Math.floor((b * samples) / buckets)].toFixed(5));
    thresholds.push(cuts);
    console.log(`  street ${street}: ${cuts.length + 1} buckets, median metric ${values[samples >> 1].toFixed(3)}`);
  }
  return thresholds;
}

/** Equity vs a random hand for each of the 169 classes + combo-weighted percentile. */
function preflopTable(samples: number, rng: Rng) {
  const equity: number[] = new Array(169).fill(0);
  for (let idx = 0; idx < 169; idx++) {
    const row = Math.floor(idx / 13);
    const col = idx % 13;
    const hi = 12 - Math.min(row, col);
    const lo = 12 - Math.max(row, col);
    const suited = row < col;
    const c0 = hi * 4;
    const c1 = lo * 4 + (row === col || !suited ? 1 : 0);
    equity[idx] = +equityVsRandom(c0, c1, [], samples, rng).toFixed(4);
  }
  const order = equity.map((e, i) => [e, i] as const).sort((a, b) => a[0] - b[0]);
  const strength = new Array(169).fill(0);
  let below = 0;
  for (const [, i] of order) {
    const combos = handClassCombos(i);
    strength[i] = +((below + combos / 2) / 1326).toFixed(4);
    below += combos;
  }
  return { equity, strength };
}

function runWorker(init: WorkerInit): WorkerResult {
  const trainer = new MCCFRTrainer(new CardAbstraction(init.thresholds), init.seed);
  const log: TrainingLogPoint[] = [];
  const start = Date.now();
  let prev = new Map<string, number[]>();
  const chunk = 2000;
  let nextLog = init.logEvery;
  while ((Date.now() - start) / 1000 < init.seconds) {
    trainer.train(chunk);
    if (trainer.iteration >= nextLog) {
      nextLog += init.logEvery;
      let delta = 0;
      let count = 0;
      const snap = new Map<string, number[]>();
      for (const [key, node] of trainer.nodes) {
        if (node.visits < 50) continue;
        const avg = trainer.averageStrategy(node);
        snap.set(key, avg);
        const p = prev.get(key);
        if (p) {
          let d = 0;
          for (let i = 0; i < avg.length; i++) d += Math.abs(avg[i] - p[i]);
          delta += d;
          count++;
        }
      }
      prev = snap;
      const point: TrainingLogPoint = {
        iteration: trainer.iteration,
        seconds: (Date.now() - start) / 1000,
        infosets: trainer.nodes.size,
        avgRegret: trainer.averageRegret(),
        strategyDelta: count ? delta / count : 1,
      };
      log.push(point);
      parentPort?.postMessage({ type: 'progress', point });
    }
  }
  return { sums: trainer.exportSums(), iterations: trainer.iteration, log };
}

async function main() {
  const minutes = Number(arg('minutes', '30'));
  const workers = Number(arg('workers', '4'));
  const buckets = Number(arg('buckets', '32'));
  const out = resolve(repoRoot, arg('out', 'apps/web/public/models/blueprint.json'));
  const rng = new Rng(Number(arg('seed', '2026')));

  console.log(`Calibrating ${buckets}-bucket card abstraction...`);
  const thresholds = calibrate(buckets, 60_000, rng);
  console.log('Computing preflop equity table...');
  const { equity, strength } = preflopTable(20_000, rng);

  console.log(`Training MCCFR with ${workers} workers for ${minutes} min...`);
  const t0 = Date.now();
  const logs: TrainingLogPoint[][] = Array.from({ length: workers }, () => []);
  const results = await Promise.all(
    Array.from({ length: workers }, (_, w) =>
      new Promise<WorkerResult>((res, rej) => {
        const init: WorkerInit = { seed: 1000 + w * 7919, seconds: minutes * 60, thresholds, logEvery: 100_000 };
        const worker = new Worker(tsWorker, {
          workerData: { ...init, __entry: here },
          resourceLimits: { maxOldGenerationSizeMb: 3072 },
        });
        worker.on('message', (m: { type: string; point?: TrainingLogPoint; result?: WorkerResult }) => {
          if (m.type === 'progress' && m.point) {
            logs[w].push(m.point);
            if (w === 0) {
              const p = m.point;
              console.log(
                `  [w0] it=${(p.iteration / 1e6).toFixed(2)}M infosets=${p.infosets} avgRegret=${p.avgRegret.toFixed(4)} ` +
                  `Δσ=${p.strategyDelta.toFixed(4)} (${p.seconds.toFixed(0)}s)`,
              );
            }
          }
          if (m.type === 'done' && m.result) res(m.result);
        });
        worker.on('error', rej);
      }),
    ),
  );

  const iterations = results.reduce((a, r) => a + r.iterations, 0);
  console.log(`Merging ${workers} strategy tables (${(iterations / 1e6).toFixed(1)}M total iterations)...`);
  const table = mergeStrategySums(results.map((r) => r.sums), 1e-9);

  // Average the per-worker convergence logs (aligned by checkpoint index).
  const len = Math.min(...results.map((r) => r.log.length));
  const trainingLog: TrainingLogPoint[] = [];
  for (let i = 0; i < len; i++) {
    const pts = results.map((r) => r.log[i]);
    trainingLog.push({
      iteration: pts.reduce((a, p) => a + p.iteration, 0),
      seconds: +(pts.reduce((a, p) => a + p.seconds, 0) / pts.length).toFixed(1),
      infosets: Math.max(...pts.map((p) => p.infosets)),
      avgRegret: +(pts.reduce((a, p) => a + p.avgRegret, 0) / pts.length).toFixed(5),
      strategyDelta: +(pts.reduce((a, p) => a + p.strategyDelta, 0) / pts.length).toFixed(5),
    });
  }

  const file: BlueprintFile = {
    version: 1,
    meta: {
      iterations,
      infosets: Object.keys(table).length,
      trainedAt: new Date().toISOString(),
      seconds: Math.round((Date.now() - t0) / 1000),
      workers,
    },
    thresholds,
    preflopStrength: strength,
    preflopEquity: equity,
    table,
    trainingLog,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(file));
  console.log(`Wrote ${out} — ${file.meta.infosets} infosets.`);
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  const result = runWorker(workerData as WorkerInit);
  parentPort!.postMessage({ type: 'done', result });
}
