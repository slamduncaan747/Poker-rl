/**
 * The blueprint: an approximate Nash equilibrium strategy for the abstract
 * game, produced offline by MCCFR (see cfr.ts) and shipped to the browser.
 *
 * Serialised compactly: each infoset maps to "codes|hexprobs" where every
 * action probability is quantised to one byte.
 */
import {
  type AbstractAction,
  CardAbstraction,
  type Code,
  PLAY_SAMPLING,
  abstractActions,
  infosetKey,
  setPreflopStrength,
} from './abstraction';
import type { HUNLState } from './game';
import type { Rng } from './rng';

export interface BlueprintFile {
  version: number;
  meta: {
    iterations: number;
    infosets: number;
    trainedAt: string;
    seconds: number;
    workers: number;
  };
  thresholds: number[][];
  preflopStrength: number[];
  preflopEquity: number[];
  table: Record<string, string>;
  trainingLog?: TrainingLogPoint[];
}

export interface TrainingLogPoint {
  iteration: number;
  seconds: number;
  infosets: number;
  /** average positive regret per infoset visit (decreasing => converging) */
  avgRegret: number;
  /** mean L1 change of the average strategy since the previous checkpoint */
  strategyDelta: number;
}

export interface StrategyLookup {
  key: string;
  codes: Code[];
  probs: number[];
  /** concrete legal actions aligned with `codes` */
  actions: AbstractAction[];
  /** false when the infoset was never visited in training and a fallback was used */
  found: boolean;
}

export function encodeProbs(codes: string, probs: ArrayLike<number>): string {
  let hex = '';
  // quantise to bytes while keeping the sum at 255
  const q: number[] = [];
  let sum = 0;
  for (let i = 0; i < probs.length; i++) sum += probs[i];
  let acc = 0;
  for (let i = 0; i < probs.length; i++) {
    const v = i === probs.length - 1 ? 255 - acc : Math.round((probs[i] / (sum || 1)) * 255);
    const c = Math.max(0, Math.min(255, v));
    q.push(c);
    acc += c;
  }
  for (const v of q) hex += v.toString(16).padStart(2, '0');
  return `${codes}|${hex}`;
}

export function decodeProbs(s: string): { codes: Code[]; probs: number[] } {
  const [codes, hex] = s.split('|');
  const probs: number[] = [];
  let sum = 0;
  for (let i = 0; i < codes.length; i++) {
    const v = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    probs.push(v);
    sum += v;
  }
  return { codes: codes.split('') as Code[], probs: probs.map((v) => (sum ? v / sum : 1 / probs.length)) };
}

export class Blueprint {
  readonly abstraction: CardAbstraction;
  readonly preflopEquity: number[];
  private table: Map<string, string>;
  private cache = new Map<string, { codes: Code[]; probs: number[] }>();

  constructor(public readonly file: BlueprintFile) {
    this.abstraction = new CardAbstraction(file.thresholds);
    this.table = new Map(Object.entries(file.table));
    this.preflopEquity = file.preflopEquity;
    setPreflopStrength(file.preflopStrength);
  }

  get size(): number {
    return this.table.size;
  }

  raw(key: string): { codes: Code[]; probs: number[] } | null {
    let v = this.cache.get(key);
    if (v) return v;
    const s = this.table.get(key);
    if (!s) return null;
    v = decodeProbs(s);
    this.cache.set(key, v);
    return v;
  }

  /** Card bucket for player p at the current street (high-precision sampling). */
  bucket(s: HUNLState, p: number, rng: Rng): number {
    const [h0, h1] = s.holes(p);
    return this.abstraction.bucket(s.street, h0, h1, s.board, PLAY_SAMPLING, rng);
  }

  /**
   * Strategy for the player to act, aligned with the concrete legal abstract
   * actions of the real state. Probability mass on abstract actions that are
   * not available in the real state (e.g. because stacks differ after an
   * off-tree bet) is moved to the nearest available action.
   */
  lookup(s: HUNLState, bucket: number): StrategyLookup {
    const p = s.toAct;
    const actions = abstractActions(s);
    const codes = actions.map((a) => a.code);
    const key = infosetKey(s, p, bucket);
    const entry = this.raw(key) ?? this.nearest(s, p, bucket);
    if (!entry) {
      return { key, codes, probs: fallbackStrategy(s, actions, this.abstraction.percentile(s.street, bucket)), actions, found: false };
    }
    const probs = new Array(codes.length).fill(0);
    entry.codes.forEach((c, i) => {
      let j = codes.indexOf(c);
      if (j < 0) j = remapCode(c, codes);
      if (j >= 0) probs[j] += entry.probs[i];
    });
    const total = probs.reduce((a, b) => a + b, 0);
    return {
      key,
      codes,
      probs: total > 0 ? probs.map((x) => x / total) : probs.map(() => 1 / codes.length),
      actions,
      found: this.table.has(key),
    };
  }

  /** Fall back to the same situation in a neighbouring SPR class / bucket. */
  private nearest(s: HUNLState, p: number, bucket: number) {
    if (s.street === 0) return null;
    const key = infosetKey(s, p, bucket);
    const m = /^(\d[BO])(\d+):(\d)([nmo]):(.*)$/.exec(key);
    if (!m) return null;
    const [, head, , spr, agg, hist] = m;
    const n = this.abstraction.buckets(s.street);
    for (let d = 1; d < 4; d++) {
      for (const sp of [+spr - d, +spr + d]) {
        if (sp < 0 || sp > 4) continue;
        const e = this.raw(`${head}${bucket}:${sp}${agg}:${hist}`);
        if (e) return e;
      }
      for (const b of [bucket - d, bucket + d]) {
        if (b < 0 || b >= n) continue;
        const e = this.raw(`${head}${b}:${spr}${agg}:${hist}`);
        if (e) return e;
      }
    }
    return null;
  }
}

function remapCode(c: Code, available: Code[]): number {
  const order: Code[] = ['t', 'h', 'p', 'a'];
  if (order.includes(c)) {
    // nearest available raise size, preferring larger
    const idx = order.indexOf(c);
    for (let d = 0; d < 4; d++) {
      for (const k of [idx + d, idx - d]) {
        const code = order[k];
        if (code && available.includes(code)) return available.indexOf(code);
      }
    }
    return available.indexOf('c') >= 0 ? available.indexOf('c') : available.indexOf('k');
  }
  if (c === 'k') return available.indexOf('c');
  if (c === 'c') return available.indexOf('k');
  return -1;
}

/** Simple strength-based strategy used only for unseen infosets. */
export function fallbackStrategy(s: HUNLState, actions: AbstractAction[], strength: number): number[] {
  const p = s.toAct;
  const toCall = s.toCall(p);
  const potOdds = toCall / (s.pot + toCall);
  const w = actions.map((a): number => {
    switch (a.code) {
      case 'f':
        return strength < potOdds + 0.1 ? 1 : 0.05;
      case 'k':
      case 'c':
        return 1;
      case 't':
      case 'h':
        return strength > 0.7 ? 1 : strength < 0.2 ? 0.3 : 0.1;
      case 'p':
        return strength > 0.85 ? 1 : 0.05;
      case 'a':
        return strength > 0.95 ? 0.5 : 0.01;
      default:
        return 0;
    }
  });
  const total = w.reduce((x, y) => x + y, 0);
  return w.map((v) => v / total);
}
