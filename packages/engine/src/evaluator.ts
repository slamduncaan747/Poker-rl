/**
 * Fast 5-7 card hand evaluator.
 *
 * Instead of a large lookup table, it works on 13-bit rank masks: one mask per
 * suit plus "rank seen >= k times" masks built with a bit-carry trick. Each
 * evaluation is a few dozen integer ops, which is plenty fast for Monte Carlo
 * equity during training (~10M+ evals/sec in V8).
 *
 * The returned value is an integer where larger = stronger:
 *   category << 20 | five 4-bit kicker ranks
 */
import type { Card } from './cards';

export const enum Category {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
];

/** straightHigh[mask] = highest rank (3 = five-high wheel .. 12 = ace) of a straight in mask, or -1. */
const STRAIGHT_HIGH = new Int8Array(8192);
/** Packed top-5 ranks of a mask (as 4-bit nibbles), for flush / high-card kickers. */
const TOP5 = new Int32Array(8192);
const POPCOUNT = new Uint8Array(8192);

(function init() {
  for (let m = 0; m < 8192; m++) {
    let hi = -1;
    for (let top = 12; top >= 4; top--) {
      const need = 0b11111 << (top - 4);
      if ((m & need) === need) {
        hi = top;
        break;
      }
    }
    // wheel: A-2-3-4-5
    if (hi < 0 && (m & 0b1000000001111) === 0b1000000001111) hi = 3;
    STRAIGHT_HIGH[m] = hi;

    let packed = 0;
    let n = 0;
    for (let r = 12; r >= 0 && n < 5; r--) {
      if (m & (1 << r)) {
        packed |= r << (4 * (4 - n));
        n++;
      }
    }
    TOP5[m] = packed;
    let pc = 0;
    for (let r = 0; r < 13; r++) if (m & (1 << r)) pc++;
    POPCOUNT[m] = pc;
  }
})();

const topBit = (m: number): number => 31 - Math.clz32(m);

/** Evaluate 5, 6 or 7 cards. */
export function evaluate(cards: ArrayLike<Card>, n: number = cards.length): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  let m1 = 0, m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const bit = 1 << (c >> 2);
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit;
    }
    m4 |= m3 & bit;
    m3 |= m2 & bit;
    m2 |= m1 & bit;
    m1 |= bit;
  }
  return evalMasks(s0, s1, s2, s3, m1, m2, m3, m4);
}

/** Evaluate hole cards + board without allocating. */
export function evaluate2(h0: Card, h1: Card, board: ArrayLike<Card>, boardLen: number = board.length): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  let m1 = 0, m2 = 0, m3 = 0, m4 = 0;
  for (let i = -2; i < boardLen; i++) {
    const c = i === -2 ? h0 : i === -1 ? h1 : board[i];
    const bit = 1 << (c >> 2);
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit;
    }
    m4 |= m3 & bit;
    m3 |= m2 & bit;
    m2 |= m1 & bit;
    m1 |= bit;
  }
  return evalMasks(s0, s1, s2, s3, m1, m2, m3, m4);
}

function evalMasks(
  s0: number, s1: number, s2: number, s3: number,
  m1: number, m2: number, m3: number, m4: number,
): number {
  // With <= 7 cards a flush excludes quads / full house, so check it first.
  let fl = 0;
  if (POPCOUNT[s0] >= 5) fl = s0;
  else if (POPCOUNT[s1] >= 5) fl = s1;
  else if (POPCOUNT[s2] >= 5) fl = s2;
  else if (POPCOUNT[s3] >= 5) fl = s3;
  if (fl) {
    const sh = STRAIGHT_HIGH[fl];
    if (sh >= 0) return (Category.StraightFlush << 20) | (sh << 16);
    return (Category.Flush << 20) | TOP5[fl];
  }
  if (m4) {
    const q = topBit(m4);
    const k = topBit(m1 & ~(1 << q));
    return (Category.Quads << 20) | (q << 16) | (k << 12);
  }
  if (m3) {
    const t = topBit(m3);
    const rest = m2 & ~(1 << t);
    if (rest) {
      return (Category.FullHouse << 20) | (t << 16) | (topBit(rest) << 12);
    }
  }
  const sh = STRAIGHT_HIGH[m1];
  if (sh >= 0) return (Category.Straight << 20) | (sh << 16);
  if (m3) {
    const t = topBit(m3);
    const k = TOP5[m1 & ~(1 << t)] >> 8; // top two kickers
    return (Category.Trips << 20) | (t << 16) | k;
  }
  if (m2) {
    const p1 = topBit(m2);
    const rest = m2 & ~(1 << p1);
    if (rest) {
      const p2 = topBit(rest);
      const k = topBit(m1 & ~(1 << p1) & ~(1 << p2));
      return (Category.TwoPair << 20) | (p1 << 16) | (p2 << 12) | (k << 8);
    }
    const k = TOP5[m1 & ~(1 << p1)] >> 4; // top three kickers
    return (Category.Pair << 20) | (p1 << 16) | k;
  }
  return (Category.HighCard << 20) | TOP5[m1];
}

export const categoryOf = (value: number): number => value >> 20;

export function describeHand(value: number): string {
  return CATEGORY_NAMES[categoryOf(value)];
}
