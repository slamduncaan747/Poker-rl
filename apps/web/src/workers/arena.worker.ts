/// <reference lib="webworker" />
/**
 * Arena simulator (runs off the main thread).
 *
 * Plays the Exploit AI and the pure GTO blueprint against the *same* opponent
 * type on the *same* deals and seats (common random numbers), using duplicate
 * pairs (every deal is also replayed with seats swapped). The difference
 * between the two curves is the value added by the RL exploitation layer.
 */
import {
  AIAgent,
  type Agent,
  Blueprint,
  type BlueprintFile,
  type Card,
  type ExploitModelFile,
  type MLP,
  OpponentModel,
  Rng,
  type Style,
  StyleAgent,
  TRAINING_SAMPLING,
  loadActor,
  matchArchetypes,
  playHand,
  randomDeal,
} from '@poker-rl/engine';

export type ArenaOpponent = { kind: 'style'; style: Style } | { kind: 'gto' };

export type ArenaIn =
  | { type: 'init'; blueprintUrl: string; exploitUrl: string }
  | { type: 'start'; opponent: ArenaOpponent; hands: number; turbo: boolean; seed: number; lambda: number; pace?: { batch: number; delay: number } }
  | { type: 'stop' }
  | { type: 'turbo'; turbo: boolean };

export interface ArenaTick {
  hand: number;
  exploit: number; // cumulative bb
  gto: number;
  /** moving-average deviation of the exploit bot from the blueprint (TV distance) */
  tilt: number;
}

export interface ArenaSample {
  hand: number;
  heroCards: [Card, Card];
  oppCards: [Card, Card];
  board: Card[];
  exploitNet: number;
  gtoNet: number;
  showdown: boolean;
}

export type ArenaOut =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | {
      type: 'progress';
      ticks: ArenaTick[];
      done: number;
      total: number;
      exploitMean: number;
      exploitSE: number;
      gtoMean: number;
      gtoSE: number;
      diffMean: number;
      diffSE: number;
      read: Array<{ id: string; name: string; prob: number }>;
      stats: Array<{ key: string; mean: number; baseline: number; opps: number }>;
      tilt: number;
      sample: ArenaSample | null;
      finished: boolean;
    };

let bp: Blueprint | null = null;
let exploitFile: ExploitModelFile | null = null;
let actor: MLP | null = null;
let runId = 0;
let turbo = true;
let pace: { batch: number; delay: number } | null = null;

const post = (m: ArenaOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<ArenaIn>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const [b, x] = await Promise.all([fetch(m.blueprintUrl).then((r) => r.json()), fetch(m.exploitUrl).then((r) => r.json())]);
      bp = new Blueprint(b as BlueprintFile);
      exploitFile = x as ExploitModelFile;
      actor = loadActor(exploitFile);
      post({ type: 'ready' });
    } else if (m.type === 'stop') {
      runId++;
    } else if (m.type === 'turbo') {
      turbo = m.turbo;
    } else if (m.type === 'start') {
      turbo = m.turbo;
      pace = m.pace ?? null;
      void run(++runId, m.opponent, m.hands, m.seed, m.lambda);
    }
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};

function makeOpp(o: ArenaOpponent): Agent {
  return o.kind === 'gto' ? new AIAgent(bp!, null, { sampling: TRAINING_SAMPLING }) : new StyleAgent(o.style);
}

async function run(id: number, opponent: ArenaOpponent, total: number, seed: number, lambda: number) {
  if (!bp || !exploitFile || !actor) return;
  const mkModel = () => new OpponentModel(exploitFile!.baseline, undefined, exploitFile!.baselineBetSize);
  // two duplicate sessions per bot (normal seats / swapped seats)
  const exploitBots = [0, 1].map(() => new AIAgent(bp!, actor, { sampling: TRAINING_SAMPLING, lambda }, mkModel()));
  const gtoBots = [0, 1].map(() => new AIAgent(bp!, null, { sampling: TRAINING_SAMPLING }, mkModel()));
  const opps = [0, 1, 2, 3].map(() => makeOpp(opponent));
  const dealRng = new Rng(seed);
  const rngs = [0, 1, 2, 3].map((i) => new Rng(seed * 31 + i));
  let cumX = 0;
  let cumG = 0;
  const xs: number[] = [];
  const gs: number[] = [];
  let ticks: ArenaTick[] = [];
  let sample: ArenaSample | null = null;
  let tiltSum = 0;
  let tiltN = 0;
  // Track how far the exploit bot's action-group distribution moves from the
  // blueprint (total-variation distance), averaged over its decisions.
  for (const bot of exploitBots) {
    const act = bot.act.bind(bot);
    bot.act = (s, r) => {
      const d = act(s, r);
      const i = d.info;
      if (i) {
        const tv = 0.5 * i.groupFinal.reduce((a, f, g) => a + Math.abs(f - i.groupBlueprint[g]), 0);
        tiltN++;
        tiltSum = tiltN === 1 ? tv : 0.99 * tiltSum + 0.01 * tv; // exponential moving average
      }
      return d;
    };
  }
  const batch = () => (pace ? pace.batch : turbo ? 40 : 1);

  for (let h = 0; h < total; ) {
    if (id !== runId) return;
    const n = Math.min(batch(), total - h);
    for (let k = 0; k < n; k++, h++) {
      const deal = randomDeal(dealRng);
      const button = h & 1;
      // duplicate pair: bot in seat 0, then bot in seat 1 with the same cards as the opponent had
      const x0 = playHand([exploitBots[0], opps[0]], deal, button, rngs[0]).payoffs()[0];
      const x1 = playHand([opps[1], exploitBots[1]], deal, button, rngs[1]).payoffs()[1];
      const st = playHand([gtoBots[0], opps[2]], deal, button, rngs[2]);
      const g0 = st.payoffs()[0];
      const g1 = playHand([opps[3], gtoBots[1]], deal, button, rngs[3]).payoffs()[1];
      const xv = (x0 + x1) / 200;
      const gv = (g0 + g1) / 200;
      xs.push(xv);
      gs.push(gv);
      cumX += xv;
      cumG += gv;
      if (h % 5 === 0 || !turbo) ticks.push({ hand: h + 1, exploit: +cumX.toFixed(2), gto: +cumG.toFixed(2), tilt: +tiltSum.toFixed(4) });
      sample = {
        hand: h + 1,
        heroCards: deal.holes[0],
        oppCards: deal.holes[1],
        board: st.isShowdown ? deal.board : st.board,
        exploitNet: x0 / 100,
        gtoNet: g0 / 100,
        showdown: st.isShowdown,
      };
    }
    const se = (arr: number[]) => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, arr.length - 1);
      return [m, Math.sqrt(v / arr.length)] as const;
    };
    const [xm, xse] = se(xs);
    const [gm, gse] = se(gs);
    const [dm, dse] = se(xs.map((x, i) => x - gs[i]));
    const model = exploitBots[0].model;
    post({
      type: 'progress',
      ticks,
      done: h,
      total,
      exploitMean: xm,
      exploitSE: xse,
      gtoMean: gm,
      gtoSE: gse,
      diffMean: dm,
      diffSE: dse,
      read: matchArchetypes(model, exploitFile.signatures).slice(0, 3),
      stats: model.snapshot().stats.map((s) => ({ key: s.key, mean: s.mean, baseline: s.baseline, opps: s.opps })),
      tilt: tiltSum,
      sample,
      finished: h >= total,
    });
    ticks = [];
    // yield so stop/turbo messages are processed; in watch mode pace the hands
    await new Promise((r) => setTimeout(r, pace ? pace.delay : turbo ? 0 : 160));
  }
}
