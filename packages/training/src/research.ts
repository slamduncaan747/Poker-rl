/**
 * Experiments for the write-up.
 *
 *   npm run research
 *
 * Loads the trained models and measures, with fixed seeds:
 *   1. identification — how many hands Otto needs to name a player's type;
 *   2. learning curve — Otto's edge over the balanced bot by hand of the session;
 *   3. generalisation — Otto vs the balanced bot on randomised opponents it never saw;
 *   4. clone fidelity — whether a clone fitted from Otto's read reproduces the
 *      original's statistics and predicts how exploitable it is;
 *   5. performance — engine throughput and project size.
 * Writes apps/web/src/data/research.json, which the "How it works" page renders.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import {
  AIAgent,
  ARCHETYPES,
  type Agent,
  Blueprint,
  type BlueprintFile,
  CloneAgent,
  type ExploitModelFile,
  OpponentModel,
  Rng,
  STAT_KEYS,
  type StatKey,
  type Style,
  StyleAgent,
  TRAINING_SAMPLING,
  equityVsRandom,
  evaluate,
  fitClone,
  loadActor,
  matchArchetypes,
  playHand,
  randomDeal,
  randomStyle,
} from '@poker-rl/engine';
import { repoRoot } from './util';

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

const bp = new Blueprint(JSON.parse(readFileSync(join(repoRoot, 'apps/web/public/models/blueprint.json'), 'utf8')) as BlueprintFile);
const ex = JSON.parse(readFileSync(join(repoRoot, 'apps/web/public/models/exploit.json'), 'utf8')) as ExploitModelFile;
const actor = loadActor(ex);
const model = () => new OpponentModel(ex.baseline, undefined, ex.baselineBetSize);
const otto = () => new AIAgent(bp, actor, { sampling: TRAINING_SAMPLING, lambda: 1 }, model());
const gto = () => new AIAgent(bp, null, { sampling: TRAINING_SAMPLING }, model());
const IDS = Object.keys(ARCHETYPES);

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const se = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1) / Math.max(1, xs.length));
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Duplicate match of two bots against the same opponent type on the same deals.
 * Returns per-deal results (bb/hand, averaged over both seats) for each bot.
 */
function duplicate(makeA: () => Agent, makeB: () => Agent, makeOpp: () => Agent, deals: number, seed: number) {
  const a = [makeA(), makeA()];
  const b = [makeB(), makeB()];
  const opp = [makeOpp(), makeOpp(), makeOpp(), makeOpp()];
  const rngs = [0, 1, 2, 3].map((i) => new Rng(seed * 13 + i));
  const dealRng = new Rng(seed);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let h = 0; h < deals; h++) {
    const d = randomDeal(dealRng);
    const btn = h & 1;
    ra.push((playHand([a[0], opp[0]], d, btn, rngs[0]).payoffs()[0] + playHand([opp[1], a[1]], d, btn, rngs[1]).payoffs()[1]) / 200);
    rb.push((playHand([b[0], opp[2]], d, btn, rngs[2]).payoffs()[0] + playHand([opp[3], b[1]], d, btn, rngs[3]).payoffs()[1]) / 200);
  }
  return { a: ra, b: rb };
}

// ------------------------------------------------------------ 1. identification
function identification() {
  const checkpoints = [5, 10, 20, 40, 80, 160, 320];
  const seeds = 20;
  const hit = checkpoints.map(() => 0);
  const prob = checkpoints.map(() => 0);
  for (const id of IDS) {
    for (let s = 0; s < seeds; s++) {
      const bot = otto();
      const opp = new StyleAgent(ARCHETYPES[id]);
      const rng = new Rng(1000 + s);
      let k = 0;
      for (let h = 1; h <= checkpoints[checkpoints.length - 1]; h++) {
        playHand([bot, opp], randomDeal(rng), h & 1, rng);
        if (h === checkpoints[k]) {
          const read = matchArchetypes(bot.model, ex.signatures);
          if (read[0].id === id) hit[k]++;
          prob[k] += read.find((r) => r.id === id)!.prob;
          k++;
        }
      }
    }
  }
  const n = IDS.length * seeds;
  log('identification done');
  return { types: IDS.length, sessions: n, points: checkpoints.map((h, i) => ({ hands: h, accuracy: r2(hit[i] / n), prob: r2(prob[i] / n) })) };
}

// ------------------------------------------------------------ 2. learning curve
function learningCurve() {
  const windows = [
    [0, 25],
    [25, 50],
    [50, 100],
    [100, 200],
    [200, 400],
  ];
  const sessions = 8;
  const deals = 400;
  const gains = windows.map(() => [] as number[]);
  for (const id of IDS) {
    for (let s = 0; s < sessions; s++) {
      const r = duplicate(otto, gto, () => new StyleAgent(ARCHETYPES[id]), deals, 2000 + s * 7 + IDS.indexOf(id) * 101);
      windows.forEach(([lo, hi], w) => gains[w].push(mean(r.a.slice(lo, hi).map((x, i) => x - r.b[lo + i])) * 100));
    }
  }
  log('learning curve done');
  return { sessions: sessions * IDS.length, points: windows.map(([lo, hi], w) => ({ from: lo, to: hi, gain: r2(mean(gains[w])), se: r2(se(gains[w])) })) };
}

// ------------------------------------------------------------ 3. generalisation
function generalisation() {
  const count = 40;
  const deals = 1000;
  const rng = new Rng(777);
  const rows: Array<{ name: string; gto: number; otto: number }> = [];
  for (let i = 0; i < count; i++) {
    const style = randomStyle(rng);
    const r = duplicate(otto, gto, () => new StyleAgent(style), deals, 3000 + i);
    rows.push({ name: style.name, otto: r2(mean(r.a) * 100), gto: r2(mean(r.b) * 100) });
  }
  const gains = rows.map((r) => r.otto - r.gto);
  log('generalisation done');
  return { opponents: count, deals, wins: gains.filter((g) => g > 0).length, meanGain: r2(mean(gains)), seGain: r2(se(gains)), rows };
}

// ------------------------------------------------------------ 4. clone fidelity
const FIT_KEYS: StatKey[] = ['vpip', 'pfr', 'sbOpen', 'limp', 'foldVsOpen', 'threeBet', 'foldTo3bet', 'cbet', 'foldToCbet', 'postBet', 'foldToBet', 'raiseVsBet', 'foldRiver', 'wtsd'];

/** Raw frequencies of a player as seen over `hands` hands by a balanced observer. */
function measure(player: Agent, hands: number, seed: number) {
  const watcher = gto();
  const rng = new Rng(seed);
  for (let h = 0; h < hands; h++) playHand([watcher, player], randomDeal(rng), h & 1, rng);
  return watcher.model;
}

function cloneFidelity() {
  const rng = new Rng(4242);
  const subjects: Array<{ id: string; style: Style }> = [
    ...IDS.map((id) => ({ id, style: ARCHETYPES[id] })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `random-${i}`, style: randomStyle(rng) })),
  ];
  const rows = subjects.map(({ id, style }, i) => {
    const read = measure(new StyleAgent(style), 150, 5000 + i);
    const fit = fitClone(read.snapshot(), ex.signatures);
    const original = measure(new StyleAgent(style), 1500, 6000 + i).snapshot();
    const copy = measure(new CloneAgent(fit, gto(), 7 + i), 1500, 6000 + i).snapshot();
    const err = mean(
      FIT_KEYS.map((k) => {
        const o = original.stats.find((s) => s.key === k)!;
        const c = copy.stats.find((s) => s.key === k)!;
        return o.opps && c.opps ? Math.abs(o.hits / o.opps - c.hits / c.opps) : 0;
      }),
    );
    const actual = duplicate(otto, gto, () => new StyleAgent(style), 800, 8000 + i);
    const predicted = duplicate(otto, gto, () => new CloneAgent(fit, gto(), 9 + i), 800, 8000 + i);
    const top = [...fit.weights].sort((a, b) => b.weight - a.weight)[0].id;
    return {
      id,
      identified: ARCHETYPES[id] ? top === id : null,
      statError: r2(err * 100),
      actual: r2(mean(actual.a) * 100),
      predicted: r2(mean(predicted.a) * 100),
    };
  });
  const xs = rows.map((r) => r.actual);
  const ys = rows.map((r) => r.predicted);
  const mx = mean(xs);
  const my = mean(ys);
  const cov = mean(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const r = cov / Math.sqrt(mean(xs.map((x) => (x - mx) ** 2)) * mean(ys.map((y) => (y - my) ** 2)));
  const named = rows.filter((x) => x.identified !== null);
  log('clone fidelity done');
  return {
    subjects: rows.length,
    readHands: 150,
    identified: named.filter((x) => x.identified).length,
    identifiable: named.length,
    meanStatError: r2(mean(rows.map((x) => x.statError))),
    correlation: r2(r),
    rows,
  };
}

// ------------------------------------------------------------ 5. performance
function performance() {
  const rng = new Rng(1);
  const cards = Array.from({ length: 52 }, (_, i) => i);
  // hand evaluator
  const N = 2_000_000;
  const hands: number[][] = [];
  for (let i = 0; i < 1000; i++) {
    for (let j = 51; j > 0; j--) {
      const k = rng.int(j + 1);
      [cards[j], cards[k]] = [cards[k], cards[j]];
    }
    hands.push(cards.slice(0, 7));
  }
  let s = performance_now();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += evaluate(hands[i % 1000], 7);
  const evalsPerSec = N / ((performance_now() - s) / 1000);
  // equity
  s = performance_now();
  for (let i = 0; i < 200; i++) sink += equityVsRandom(hands[i][0], hands[i][1], hands[i].slice(2, 5), 1000, rng);
  const equitySamplesPerSec = (200 * 1000) / ((performance_now() - s) / 1000);
  // full hands, Otto vs balanced
  const a = otto();
  const b = gto();
  s = performance_now();
  const H = 3000;
  for (let i = 0; i < H; i++) playHand([a, b], randomDeal(rng), i & 1, rng);
  const handsPerSec = H / ((performance_now() - s) / 1000);
  if (sink === 42) console.log('');

  // project size
  const loc = (dir: string): number =>
    readdirSync(dir).reduce((acc, f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return acc + loc(p);
      return /\.(ts|tsx)$/.test(f) ? acc + readFileSync(p, 'utf8').split('\n').length : acc;
    }, 0);
  const gz = (p: string) => gzipSync(readFileSync(join(repoRoot, p))).length;
  let tests = 0;
  try {
    const out = execSync('npx vitest run --reporter=json', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    tests = JSON.parse(out.slice(out.indexOf('{'))).numPassedTests;
  } catch {
    tests = 0;
  }
  log('performance done');
  return {
    evalsPerSec: Math.round(evalsPerSec),
    equitySamplesPerSec: Math.round(equitySamplesPerSec),
    handsPerSec: Math.round(handsPerSec),
    loc: { engine: loc(join(repoRoot, 'packages/engine/src')), training: loc(join(repoRoot, 'packages/training/src')), web: loc(join(repoRoot, 'apps/web/src')), tests: loc(join(repoRoot, 'packages/engine/test')) },
    tests,
    modelKB: { blueprint: Math.round(gz('apps/web/public/models/blueprint.json') / 1024), exploit: Math.round(gz('apps/web/public/models/exploit.json') / 1024) },
  };
}

function performance_now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

const out = {
  generatedAt: new Date().toISOString(),
  identification: identification(),
  learningCurve: learningCurve(),
  generalisation: generalisation(),
  cloneFidelity: cloneFidelity(),
  performance: performance(),
};
mkdirSync(join(repoRoot, 'apps/web/src/data'), { recursive: true });
writeFileSync(join(repoRoot, 'apps/web/src/data/research.json'), JSON.stringify(out, null, 1));
log('wrote apps/web/src/data/research.json');
console.log(JSON.stringify({ ...out, generalisation: { ...out.generalisation, rows: undefined }, cloneFidelity: { ...out.cloneFidelity, rows: undefined } }, null, 1));
