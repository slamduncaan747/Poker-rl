/**
 * External-sampling Monte Carlo CFR (Lanctot et al. 2009) with:
 *  - Linear CFR weighting (Brown & Sandholm 2019): regrets and the average
 *    strategy are discounted by t/(t+1) at every discount interval, so early,
 *    poor iterations fade out.
 *  - Regret-based pruning (as in Libratus / Pluribus): after a warm-up,
 *    actions with very negative regret are skipped 95% of the time.
 *
 * Utilities are measured in big blinds.
 */
import {
  type AbstractAction,
  CardAbstraction,
  type BucketSampling,
  TRAINING_SAMPLING,
  abstractActions,
  infosetKey,
} from './abstraction';
import { encodeProbs } from './blueprint';
import { DEFAULT_CONFIG, type GameConfig, HUNLState, randomDeal } from './game';
import { Rng } from './rng';

export interface CfrNode {
  codes: string;
  regret: Float64Array;
  strategySum: Float64Array;
  visits: number;
}

export interface CfrOptions {
  config?: GameConfig;
  sampling?: BucketSampling;
  /** iterations between linear-CFR discounts */
  discountInterval?: number;
  /** stop discounting after this many iterations */
  discountUntil?: number;
  pruneAfter?: number;
  pruneThreshold?: number;
}

export class MCCFRTrainer {
  readonly nodes = new Map<string, CfrNode>();
  readonly abstraction: CardAbstraction;
  readonly config: GameConfig;
  readonly sampling: BucketSampling;
  iteration = 0;
  private rng: Rng;
  private opts: Required<Omit<CfrOptions, 'config' | 'sampling'>>;
  private buckets: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  private sigma = new Float64Array(8);

  constructor(abstraction: CardAbstraction, seed: number, opts: CfrOptions = {}) {
    this.abstraction = abstraction;
    this.config = opts.config ?? DEFAULT_CONFIG;
    this.sampling = opts.sampling ?? TRAINING_SAMPLING;
    this.rng = new Rng(seed);
    this.opts = {
      discountInterval: opts.discountInterval ?? 20_000,
      discountUntil: opts.discountUntil ?? 2_000_000,
      pruneAfter: opts.pruneAfter ?? 200_000,
      pruneThreshold: opts.pruneThreshold ?? -300,
    };
  }

  /** Run `n` iterations (each iteration = one traversal per player). */
  train(n: number): void {
    for (let i = 0; i < n; i++) {
      this.iteration++;
      const deal = randomDeal(this.rng);
      const button = this.iteration & 1;
      for (let p = 0; p < 2; p++) {
        const [h0, h1] = deal.holes[p];
        for (let st = 0; st < 4; st++) {
          const board = deal.board.slice(0, st === 0 ? 0 : st + 2);
          this.buckets[p][st] = this.abstraction.bucket(st, h0, h1, board, this.sampling, this.rng);
        }
      }
      for (let traverser = 0; traverser < 2; traverser++) {
        const s = new HUNLState(deal, button, this.config);
        s.keepLog = false;
        this.traverse(s, traverser);
      }
      if (this.iteration % this.opts.discountInterval === 0 && this.iteration <= this.opts.discountUntil) {
        const t = this.iteration / this.opts.discountInterval;
        this.discount(t / (t + 1));
      }
    }
  }

  private node(key: string, actions: AbstractAction[]): CfrNode {
    let n = this.nodes.get(key);
    if (!n) {
      const k = actions.length;
      n = {
        codes: actions.map((a) => a.code).join(''),
        regret: new Float64Array(k),
        strategySum: new Float64Array(k),
        visits: 0,
      };
      this.nodes.set(key, n);
    }
    return n;
  }

  private regretMatch(regret: Float64Array, out: Float64Array): void {
    const k = regret.length;
    let pos = 0;
    for (let i = 0; i < k; i++) if (regret[i] > 0) pos += regret[i];
    if (pos > 0) for (let i = 0; i < k; i++) out[i] = regret[i] > 0 ? regret[i] / pos : 0;
    else for (let i = 0; i < k; i++) out[i] = 1 / k;
  }

  private traverse(s: HUNLState, tr: number): number {
    if (s.terminal) return s.payoffs()[tr] / this.config.bigBlind;
    const p = s.toAct;
    const actions = abstractActions(s);
    const k = actions.length;
    const node = this.node(infosetKey(s, p, this.buckets[p][s.street]), actions);
    if (node.regret.length !== k) {
      // Imperfect recall can (rarely) merge nodes whose real stacks allow a
      // different action set; treat the merged node as the first-seen layout.
      return this.traverseMismatch(s, tr, node, actions);
    }
    const sigma = new Float64Array(k);
    this.regretMatch(node.regret, sigma);
    node.visits++;

    if (p === tr) {
      const util = new Float64Array(k);
      const explored = new Uint8Array(k);
      const prune = this.iteration > this.opts.pruneAfter && this.rng.next() < 0.95;
      let v = 0;
      for (let i = 0; i < k; i++) {
        if (prune && node.regret[i] < this.opts.pruneThreshold) continue;
        const child = s.clone();
        child.apply(actions[i].action, actions[i].code);
        util[i] = this.traverse(child, tr);
        explored[i] = 1;
        v += sigma[i] * util[i];
      }
      for (let i = 0; i < k; i++) if (explored[i]) node.regret[i] += util[i] - v;
      return v;
    }

    for (let i = 0; i < k; i++) node.strategySum[i] += sigma[i];
    const a = this.rng.choice(sigma);
    const child = s.clone();
    child.apply(actions[a].action, actions[a].code);
    return this.traverse(child, tr);
  }

  private traverseMismatch(s: HUNLState, tr: number, node: CfrNode, actions: AbstractAction[]): number {
    // Use the stored strategy restricted to codes that exist here (no update).
    const sigma = new Float64Array(node.regret.length);
    this.regretMatch(node.regret, sigma);
    const probs = actions.map((a) => {
      const j = node.codes.indexOf(a.code);
      return j >= 0 ? sigma[j] : 0;
    });
    const total = probs.reduce((x, y) => x + y, 0);
    const a = total > 0 ? this.rng.choice(probs) : this.rng.int(actions.length);
    const child = s.clone();
    child.apply(actions[a].action, actions[a].code);
    return this.traverse(child, tr);
  }

  private discount(f: number): void {
    for (const n of this.nodes.values()) {
      for (let i = 0; i < n.regret.length; i++) {
        n.regret[i] *= f;
        n.strategySum[i] *= f;
      }
    }
  }

  /** Mean positive regret per node visit — a convergence proxy. */
  averageRegret(): number {
    let total = 0;
    let visits = 0;
    for (const n of this.nodes.values()) {
      let m = 0;
      for (let i = 0; i < n.regret.length; i++) if (n.regret[i] > m) m = n.regret[i];
      total += m;
      visits += n.visits;
    }
    return visits ? total / visits : 0;
  }

  averageStrategy(n: CfrNode): number[] {
    let sum = 0;
    for (let i = 0; i < n.strategySum.length; i++) sum += n.strategySum[i];
    const k = n.strategySum.length;
    return Array.from(n.strategySum, (v) => (sum > 0 ? v / sum : 1 / k));
  }

  /** Serialise strategy sums (for merging across worker processes). */
  exportSums(): Array<[string, string, number[]]> {
    const out: Array<[string, string, number[]]> = [];
    for (const [key, n] of this.nodes) out.push([key, n.codes, Array.from(n.strategySum)]);
    return out;
  }
}

/**
 * Merge strategy sums from independent MCCFR runs. Because external-sampling
 * accumulates the average strategy in proportion to how often an infoset is
 * reached, summing the raw sums mixes the runs' realization plans — and a
 * mixture of (approximate) equilibria of a two-player zero-sum game is itself
 * an (approximate) equilibrium.
 */
export function mergeStrategySums(
  parts: Array<Array<[string, string, number[]]>>,
  minMass = 0,
): Record<string, string> {
  const merged = new Map<string, { codes: string; sum: number[] }>();
  for (const part of parts) {
    for (const [key, codes, sums] of part) {
      const m = merged.get(key);
      if (!m) merged.set(key, { codes, sum: sums.slice() });
      else if (m.codes === codes) for (let i = 0; i < sums.length; i++) m.sum[i] += sums[i];
    }
  }
  const table: Record<string, string> = {};
  for (const [key, { codes, sum }] of merged) {
    const mass = sum.reduce((a, b) => a + b, 0);
    if (mass <= minMass) continue;
    table[key] = encodeProbs(codes, sum);
  }
  return table;
}
