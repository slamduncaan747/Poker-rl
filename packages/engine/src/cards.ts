/**
 * Card encoding: an integer 0..51 where rank = c >> 2 (0 = deuce .. 12 = ace)
 * and suit = c & 3 (0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades).
 */
import type { Rng } from './rng';

export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export function cardToString(c: Card): string {
  return RANKS[rankOf(c)] + SUITS[suitOf(c)];
}

export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0].toUpperCase());
  const su = SUITS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error(`Bad card: ${s}`);
  return makeCard(r, su);
}

export function parseCards(s: string): Card[] {
  const out: Card[] = [];
  const clean = s.replace(/[\s,]+/g, '');
  for (let i = 0; i < clean.length; i += 2) out.push(parseCard(clean.slice(i, i + 2)));
  return out;
}

export const cardsToString = (cs: readonly Card[]): string => cs.map(cardToString).join(' ');

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (let c = 0; c < 52; c++) d.push(c);
  return d;
}

/** Deck with the given cards removed. */
export function deckWithout(dead: readonly Card[]): Card[] {
  let mask = 0n;
  for (const c of dead) mask |= 1n << BigInt(c);
  const d: Card[] = [];
  for (let c = 0; c < 52; c++) if (!((mask >> BigInt(c)) & 1n)) d.push(c);
  return d;
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * Canonical 169-class index for a starting hand.
 * Pairs live on the diagonal, suited hands above it, offsuit below it
 * (row = higher rank from ace downwards, matching the standard range grid).
 */
export function handClass(a: Card, b: Card): number {
  let r1 = rankOf(a);
  let r2 = rankOf(b);
  if (r1 < r2) [r1, r2] = [r2, r1];
  const row = 12 - r1;
  const col = 12 - r2;
  if (r1 === r2) return row * 13 + col;
  const suited = suitOf(a) === suitOf(b);
  return suited ? row * 13 + col : col * 13 + row;
}

/** Human label for a 169-class index, e.g. "AKs", "T9o", "77". */
export function handClassLabel(idx: number): string {
  const row = Math.floor(idx / 13);
  const col = idx % 13;
  const hi = RANKS[12 - Math.min(row, col)];
  const lo = RANKS[12 - Math.max(row, col)];
  if (row === col) return hi + lo;
  return hi + lo + (row < col ? 's' : 'o');
}

/** Number of concrete combos in a 169-class (6 pairs, 4 suited, 12 offsuit). */
export function handClassCombos(idx: number): number {
  const row = Math.floor(idx / 13);
  const col = idx % 13;
  if (row === col) return 6;
  return row < col ? 4 : 12;
}
