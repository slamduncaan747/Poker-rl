/**
 * Monte Carlo / exact equity estimators.
 *
 * These power three things:
 *  - the card abstraction (hand-strength buckets used by the CFR blueprint),
 *  - the heuristic archetype opponents,
 *  - UI read-outs (live equity, coach mode).
 */
import type { Card } from './cards';
import { evaluate2 } from './evaluator';
import type { Rng } from './rng';

const scratchDeck = new Int32Array(52);
const scratchBoard = new Int32Array(5);

function liveDeck(dead: ArrayLike<Card>, out: Int32Array = scratchDeck): number {
  const used = new Uint8Array(52);
  for (let i = 0; i < dead.length; i++) used[dead[i]] = 1;
  let n = 0;
  for (let c = 0; c < 52; c++) if (!used[c]) out[n++] = c;
  return n;
}

/** Partial Fisher-Yates: move k random cards of deck[0..n) into deck[0..k). */
function drawInPlace(deck: Int32Array, n: number, k: number, rng: Rng): void {
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(n - i);
    const t = deck[i];
    deck[i] = deck[j];
    deck[j] = t;
  }
}

/** Equity (win + tie/2) of a hand vs one uniformly random opponent hand, random runout. */
export function equityVsRandom(h0: Card, h1: Card, board: readonly Card[], samples: number, rng: Rng): number {
  const deck = new Int32Array(52);
  const n = liveDeck([h0, h1, ...board], deck);
  const need = 5 - board.length;
  const full = new Int32Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  let score = 0;
  for (let s = 0; s < samples; s++) {
    drawInPlace(deck, n, need + 2, rng);
    for (let i = 0; i < need; i++) full[board.length + i] = deck[2 + i];
    const me = evaluate2(h0, h1, full, 5);
    const op = evaluate2(deck[0], deck[1], full, 5);
    score += me > op ? 1 : me === op ? 0.5 : 0;
  }
  return score / samples;
}

/**
 * Unbiased estimate of E[HS^2] (expected squared hand strength over runouts),
 * the classic bucketing metric from the Alberta poker group (Johanson et al.).
 * Squaring rewards hands whose strength is *volatile* — i.e. draws — so they are
 * separated from made hands of the same average equity.
 *
 * For each sampled runout we draw `opps` opponent hands. HS^2 on that runout is
 * estimated with the U-statistic (S^2 - sum x_i^2) / (m(m-1)), which is unbiased,
 * so training (few samples) and runtime (many samples) target the same quantity.
 */
export function ehs2(
  h0: Card, h1: Card, board: readonly Card[],
  runouts: number, opps: number, rng: Rng,
): number {
  const deck = new Int32Array(52);
  const n = liveDeck([h0, h1, ...board], deck);
  const need = 5 - board.length;
  const full = new Int32Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  let acc = 0;
  for (let r = 0; r < runouts; r++) {
    drawInPlace(deck, n, need, rng);
    for (let i = 0; i < need; i++) full[board.length + i] = deck[i];
    const me = evaluate2(h0, h1, full, 5);
    let S = 0;
    let SS = 0;
    const rem = n - need;
    const a = need; // opponent cards are drawn into deck[a], deck[a + 1]
    for (let o = 0; o < opps; o++) {
      const i1 = a + rng.int(rem);
      let t = deck[a];
      deck[a] = deck[i1];
      deck[i1] = t;
      const i2 = a + 1 + rng.int(rem - 1);
      t = deck[a + 1];
      deck[a + 1] = deck[i2];
      deck[i2] = t;
      const op = evaluate2(deck[a], deck[a + 1], full, 5);
      const x = me > op ? 1 : me === op ? 0.5 : 0;
      S += x;
      SS += x * x;
    }
    acc += (S * S - SS) / (opps * (opps - 1));
  }
  return acc / runouts;
}

/** Exact river hand strength vs all opponent holdings (board must have 5 cards). */
export function riverHandStrength(h0: Card, h1: Card, board: readonly Card[]): number {
  const deck = new Int32Array(52);
  const n = liveDeck([h0, h1, ...board], deck);
  for (let i = 0; i < 5; i++) scratchBoard[i] = board[i];
  const me = evaluate2(h0, h1, scratchBoard, 5);
  let score = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const op = evaluate2(deck[i], deck[j], scratchBoard, 5);
      score += me > op ? 1 : me === op ? 0.5 : 0;
      total++;
    }
  }
  return score / total;
}

/** Sampled river hand strength (unbiased, cheaper than exact). */
export function riverHandStrengthMC(h0: Card, h1: Card, board: readonly Card[], samples: number, rng: Rng): number {
  const deck = new Int32Array(52);
  const n = liveDeck([h0, h1, ...board], deck);
  for (let i = 0; i < 5; i++) scratchBoard[i] = board[i];
  const me = evaluate2(h0, h1, scratchBoard, 5);
  let score = 0;
  for (let s = 0; s < samples; s++) {
    drawInPlace(deck, n, 2, rng);
    const op = evaluate2(deck[0], deck[1], scratchBoard, 5);
    score += me > op ? 1 : me === op ? 0.5 : 0;
  }
  return score / samples;
}

/**
 * Equity of hero vs a specific villain hand. Exact enumeration on the flop/turn
 * (<= 990 runouts), Monte Carlo preflop.
 */
export function equityVsHand(
  hero: readonly [Card, Card], villain: readonly [Card, Card], board: readonly Card[],
  rng: Rng, preflopSamples = 1500,
): number {
  const deck = new Int32Array(52);
  const n = liveDeck([...hero, ...villain, ...board], deck);
  const need = 5 - board.length;
  const full = new Int32Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  const cmp = () => {
    const a = evaluate2(hero[0], hero[1], full, 5);
    const b = evaluate2(villain[0], villain[1], full, 5);
    return a > b ? 1 : a === b ? 0.5 : 0;
  };
  if (need === 0) return cmp();
  if (need === 1) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      full[4] = deck[i];
      s += cmp();
    }
    return s / n;
  }
  if (need === 2) {
    let s = 0;
    let t = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        full[3] = deck[i];
        full[4] = deck[j];
        s += cmp();
        t++;
      }
    }
    return s / t;
  }
  let s = 0;
  for (let k = 0; k < preflopSamples; k++) {
    drawInPlace(deck, n, need, rng);
    for (let i = 0; i < need; i++) full[board.length + i] = deck[i];
    s += cmp();
  }
  return s / preflopSamples;
}

/**
 * Equity of hero vs a weighted range of villain combos (each combo = [c0, c1, weight]).
 * Used by coach mode / the opponent-range visualiser.
 */
export function equityVsRange(
  hero: readonly [Card, Card], range: ReadonlyArray<readonly [Card, Card, number]>,
  board: readonly Card[], samples: number, rng: Rng,
): number {
  const dead = new Uint8Array(52);
  dead[hero[0]] = dead[hero[1]] = 1;
  for (const b of board) dead[b] = 1;
  const live = range.filter(([a, b, w]) => w > 0 && !dead[a] && !dead[b]);
  if (live.length === 0) return 0.5;
  const weights = live.map((x) => x[2]);
  let wsum = 0;
  for (const w of weights) wsum += w;
  const deck = new Int32Array(52);
  const full = new Int32Array(5);
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  const need = 5 - board.length;
  let score = 0;
  for (let s = 0; s < samples; s++) {
    let r = rng.next() * wsum;
    let k = 0;
    for (; k < live.length - 1; k++) {
      r -= weights[k];
      if (r < 0) break;
    }
    const [v0, v1] = live[k];
    const n = liveDeck([hero[0], hero[1], v0, v1, ...board], deck);
    drawInPlace(deck, n, need, rng);
    for (let i = 0; i < need; i++) full[board.length + i] = deck[i];
    const a = evaluate2(hero[0], hero[1], full, 5);
    const b = evaluate2(v0, v1, full, 5);
    score += a > b ? 1 : a === b ? 0.5 : 0;
  }
  return score / samples;
}
