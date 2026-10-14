/// <reference lib="webworker" />
/**
 * Stress test (runs off the main thread).
 *
 * Fits a clone of the player from Otto's read and plays it against the
 * balanced blueprint and against Otto (which starts with no read and adapts),
 * on the same deals, in duplicate pairs (each deal replayed with seats
 * swapped) to cancel most of the card luck.
 */
import {
  AIAgent,
  Blueprint,
  type BlueprintFile,
  CloneAgent,
  type CloneFit,
  type ExploitModelFile,
  type OpponentSnapshot,
  OpponentModel,
  Rng,
  TRAINING_SAMPLING,
  fitClone,
  loadActor,
  playHand,
  randomDeal,
} from '@poker-rl/engine';

export type CloneIn = { type: 'run'; blueprintUrl: string; exploitUrl: string; snapshot: OpponentSnapshot; hands: number; seed: number } | { type: 'stop' };

export interface CloneProgress {
  type: 'progress';
  done: number;
  total: number;
  /** each bot's result against the clone, big blinds per hand, with standard errors */
  gto: number;
  gtoSE: number;
  otto: number;
  ottoSE: number;
  weights: CloneFit['weights'];
  finished: boolean;
}

export type CloneOut = CloneProgress | { type: 'error'; message: string };

let files: Promise<[BlueprintFile, ExploitModelFile]> | null = null;
let runId = 0;

const post = (m: CloneOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<CloneIn>) => {
  const m = e.data;
  if (m.type === 'stop') {
    runId++;
    return;
  }
  try {
    files ??= Promise.all([fetch(m.blueprintUrl).then((r) => r.json()), fetch(m.exploitUrl).then((r) => r.json())]);
    const [b, x] = await files;
    void run(++runId, new Blueprint(b), x, m.snapshot, m.hands, m.seed);
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};

function meanSE(xs: number[]) {
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1);
  return [m, Math.sqrt(v / n)] as const;
}

async function run(id: number, bp: Blueprint, file: ExploitModelFile, snap: OpponentSnapshot, total: number, seed: number) {
  const fit = fitClone(snap, file.signatures);
  const actor = loadActor(file);
  const model = () => new OpponentModel(file.baseline, undefined, file.baselineBetSize);
  const gtoBot = () => new AIAgent(bp, null, { sampling: TRAINING_SAMPLING }, model());
  const otto = [0, 1].map(() => new AIAgent(bp, actor, { sampling: TRAINING_SAMPLING, lambda: 1 }, model()));
  const gto = [0, 1].map(gtoBot);
  const clones = [0, 1, 2, 3].map((i) => new CloneAgent(fit, gtoBot(), seed * 7 + i));
  const rngs = [0, 1, 2, 3].map((i) => new Rng(seed * 31 + i));
  const dealRng = new Rng(seed);
  const gs: number[] = [];
  const os: number[] = [];
  for (let h = 0; h < total; ) {
    if (id !== runId) return;
    for (let k = 0; k < 200 && h < total; k++, h++) {
      const deal = randomDeal(dealRng);
      const button = h & 1;
      const o = playHand([otto[0], clones[0]], deal, button, rngs[0]).payoffs()[0] + playHand([clones[1], otto[1]], deal, button, rngs[1]).payoffs()[1];
      const g = playHand([gto[0], clones[2]], deal, button, rngs[2]).payoffs()[0] + playHand([clones[3], gto[1]], deal, button, rngs[3]).payoffs()[1];
      os.push(o / 200);
      gs.push(g / 200);
    }
    const [om, ose] = meanSE(os);
    const [gm, gse] = meanSE(gs);
    post({ type: 'progress', done: h, total, gto: gm, gtoSE: gse, otto: om, ottoSE: ose, weights: fit.weights, finished: h >= total });
    await new Promise((r) => setTimeout(r, 0));
  }
}
