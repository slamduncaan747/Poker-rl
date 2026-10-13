/**
 * Game abstraction for the CFR blueprint.
 *
 * Full HUNL has ~10^161 decision points, so (like every strong poker AI) we
 * solve a smaller abstract game and map the real game onto it:
 *
 *  - **Action abstraction**: a handful of pot-relative bet sizes per node.
 *    Off-tree bets made by a human are mapped back with the randomized
 *    pseudo-harmonic mapping (Ganzfried & Sandholm, IJCAI 2013).
 *
 *  - **Card abstraction**: preflop is lossless (169 strategically distinct
 *    classes). Postflop hands are bucketed by percentile of E[HS^2] on the
 *    flop / turn and of hand strength on the river.
 *
 *  - **Imperfect-recall history**: postflop infosets remember the full action
 *    sequence of the *current* street, but compress earlier streets to the
 *    stack-to-pot ratio class plus who held the betting lead. This keeps the
 *    abstract game small enough to converge on a laptop in minutes while
 *    retaining the information that matters most strategically.
 */
import { type Card, handClass } from './cards';
import { ehs2, riverHandStrength, riverHandStrengthMC } from './equity';
import type { Action, HUNLState } from './game';
import type { Rng } from './rng';

export type Code = 'f' | 'k' | 'c' | 't' | 'h' | 'p' | 'a';

export const CODE_LABELS: Record<Code, string> = {
  f: 'Fold',
  k: 'Check',
  c: 'Call',
  t: '⅓ pot',
  h: '½ pot',
  p: 'Pot',
  a: 'All-in',
};

export interface AbstractAction {
  code: Code;
  action: Action;
  /** for raises: size as a fraction of the pot after calling */
  frac: number;
}

/** Bet-size menu. */
export const SIZES = {
  t: 1 / 3,
  h: 0.5,
  p: 1.0,
} as const;

const PREFLOP_RAISE_CAP = 4;
const POSTFLOP_RAISE_CAP = 3;

/** Raise codes offered at a node (before deduping / stack clipping). */
function raiseCodesFor(street: number, raisesThisStreet: number): Code[] {
  const cap = street === 0 ? PREFLOP_RAISE_CAP : POSTFLOP_RAISE_CAP;
  if (raisesThisStreet >= cap) return ['a'];
  if (raisesThisStreet === 0) return street === 0 ? ['h', 'p', 'a'] : ['t', 'h', 'p', 'a'];
  return ['p', 'a'];
}

/** Concrete "raise to" amount for a pot-fraction raise. */
export function raiseToForFraction(s: HUNLState, frac: number): number {
  const p = s.toAct;
  const cur = s.streetBet[1 - p];
  const toCall = cur - s.streetBet[p];
  const potAfterCall = s.pot + toCall;
  return Math.round(cur + frac * potAfterCall);
}

/**
 * Abstract actions available to the player to act, each mapped to a concrete
 * legal action. Sizes that would commit >= 80% of the stack are merged into
 * all-in; duplicate amounts are removed.
 */
export function abstractActions(s: HUNLState): AbstractAction[] {
  const p = s.toAct;
  const out: AbstractAction[] = [];
  const facing = s.streetBet[1 - p] > s.streetBet[p];
  if (facing) {
    out.push({ code: 'f', action: { kind: 'fold' }, frac: 0 });
    out.push({ code: 'c', action: { kind: 'call' }, frac: 0 });
  } else {
    out.push({ code: 'k', action: { kind: 'check' }, frac: 0 });
  }
  const min = s.minRaiseTo(p);
  if (min === null) return out;
  const allIn = s.allInTo(p);
  const cur = s.streetBet[1 - p];
  const potAfterCall = s.pot + (cur - s.streetBet[p]);
  let lastTo = -1;
  for (const code of raiseCodesFor(s.street, s.raisesThisStreet)) {
    let to: number;
    if (code === 'a') to = allIn;
    else {
      to = Math.max(min, raiseToForFraction(s, SIZES[code as keyof typeof SIZES]));
      if (to >= 0.8 * allIn) continue; // effectively all-in
    }
    if (to <= lastTo) continue;
    lastTo = to;
    out.push({ code, action: { kind: 'raise', to }, frac: (to - cur) / potAfterCall });
  }
  return out;
}

/**
 * Pseudo-harmonic action translation: probability of mapping an observed bet
 * of size x (pot fractions) to the smaller abstract size A rather than B.
 */
export function pseudoHarmonicLow(A: number, B: number, x: number): number {
  if (x <= A) return 1;
  if (x >= B) return 0;
  return ((B - x) * (1 + A)) / ((B - A) * (1 + x));
}

/**
 * Map a concrete action taken by the player to act onto an abstract code.
 * Deterministic for fold/check/call; randomized for bet sizes between two
 * abstract sizes.
 */
export function translateAction(s: HUNLState, action: Action, rng: Rng): Code {
  const p = s.toAct;
  const facing = s.streetBet[1 - p] > s.streetBet[p];
  if (action.kind === 'fold') return 'f';
  if (action.kind === 'check' || action.kind === 'call') return facing ? 'c' : 'k';
  const options = abstractActions(s).filter((a) => a.action.kind === 'raise');
  if (options.length === 0) return facing ? 'c' : 'k';
  const allIn = s.allInTo(p);
  const to = Math.min(action.to ?? 0, allIn);
  if (to >= allIn) return 'a';
  const cur = s.streetBet[1 - p];
  const potAfterCall = s.pot + (cur - s.streetBet[p]);
  const x = (to - cur) / potAfterCall;
  if (x <= options[0].frac) return options[0].code;
  for (let i = 0; i < options.length - 1; i++) {
    const A = options[i].frac;
    const B = options[i + 1].frac;
    if (x >= A && x <= B) {
      return rng.next() < pseudoHarmonicLow(A, B, x) ? options[i].code : options[i + 1].code;
    }
  }
  return options[options.length - 1].code;
}

// ----------------------------------------------------------------- infosets

const SPR_EDGES = [1.5, 3, 6, 12];

export function sprClass(s: HUNLState): number {
  const pot = s.streetStartPot[s.street] || s.pot;
  const eff = Math.min(s.stacks[0] + s.streetBet[0], s.stacks[1] + s.streetBet[1]);
  const spr = eff / pot;
  let k = 0;
  while (k < SPR_EDGES.length && spr > SPR_EDGES[k]) k++;
  return k;
}

/**
 * Infoset key for player `p`. Preflop keeps the full action history; postflop
 * uses imperfect recall (SPR class + previous-street aggressor relative to p).
 */
export function infosetKey(s: HUNLState, p: number, bucket: number): string {
  const pos = p === s.button ? 'B' : 'O'; // button / out-of-position-preflop (big blind)
  if (s.street === 0) return `0${pos}${bucket}:${s.streetCodes[0]}`;
  const prevAgg = s.aggressor[s.street - 1];
  const agg = prevAgg < 0 ? 'n' : prevAgg === p ? 'm' : 'o';
  return `${s.street}${pos}${bucket}:${sprClass(s)}${agg}:${s.streetCodes[s.street]}`;
}

// ----------------------------------------------------------- card buckets

export interface BucketSampling {
  runouts: number;
  opps: number;
  riverSamples: number; // 0 = exact enumeration
}

export const TRAINING_SAMPLING: BucketSampling = { runouts: 24, opps: 6, riverSamples: 48 };
export const PLAY_SAMPLING: BucketSampling = { runouts: 200, opps: 12, riverSamples: 0 };

/** Raw postflop strength metric in [0, 1]. */
export function strengthMetric(
  street: number, h0: Card, h1: Card, board: readonly Card[], sampling: BucketSampling, rng: Rng,
): number {
  if (street === 3) {
    return sampling.riverSamples > 0
      ? riverHandStrengthMC(h0, h1, board, sampling.riverSamples, rng)
      : riverHandStrength(h0, h1, board);
  }
  return ehs2(h0, h1, board, sampling.runouts, sampling.opps, rng);
}

/**
 * Percentile-based card abstraction. `thresholds[street]` holds the (n-1)
 * interior quantile cut points of the strength metric for that street,
 * calibrated on random deals (see training/calibrate).
 */
export class CardAbstraction {
  constructor(public thresholds: number[][]) {}

  buckets(street: number): number {
    return street === 0 ? 169 : this.thresholds[street].length + 1;
  }

  bucketOfMetric(street: number, m: number): number {
    const t = this.thresholds[street];
    let lo = 0;
    let hi = t.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (m >= t[mid]) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  bucket(street: number, h0: Card, h1: Card, board: readonly Card[], sampling: BucketSampling, rng: Rng): number {
    if (street === 0) return handClass(h0, h1);
    return this.bucketOfMetric(street, strengthMetric(street, h0, h1, board, sampling, rng));
  }

  /** Bucket expressed as a percentile in [0, 1] (preflop uses a strength table). */
  percentile(street: number, bucket: number): number {
    if (street === 0) return PREFLOP_STRENGTH[bucket] ?? 0.5;
    const n = this.buckets(street);
    return (bucket + 0.5) / n;
  }

  toJSON() {
    return { thresholds: this.thresholds };
  }
}

/**
 * Preflop strength percentile per 169-class (fraction of hands each class beats
 * by equity vs a random hand). Filled in by `setPreflopStrength` from the model
 * file, with a cheap analytic fallback.
 */
export let PREFLOP_STRENGTH: number[] = [];

export function setPreflopStrength(table: number[]) {
  PREFLOP_STRENGTH = table;
}
