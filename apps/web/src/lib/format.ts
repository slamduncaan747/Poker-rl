import { CODE_LABELS, type Code, type ActionRecord, STREET_NAMES } from '@poker-rl/engine';

export const BB = 100;

export function bb(chips: number, digits = 1): string {
  const v = chips / BB;
  const s = Math.abs(v) >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(digits);
  return `${s}`;
}

/** Table stakes: $1/$2 blinds, so the 100-chip big blind is $2. */
export const CHIPS_PER_DOLLAR = 50;

/** Chips as dollars: "$5", "$13.40". */
export function money(chips: number): string {
  const v = Math.abs(chips) / CHIPS_PER_DOLLAR;
  return `${chips < 0 ? '−' : ''}$${Number.isInteger(v) || v >= 1000 ? v.toFixed(0) : v.toFixed(2)}`;
}

/** A result in chips as signed dollars: "+$13.40", "−$5", "$0". */
export function signedMoney(chips: number): string {
  if (Math.round(chips) === 0) return '$0';
  return `${chips > 0 ? '+' : '−'}${money(Math.abs(chips))}`;
}

/** A win rate in big blinds per hand as dollars per 100 hands. */
export function per100(bbPerHand: number): string {
  const v = (bbPerHand * 100 * 100) / CHIPS_PER_DOLLAR;
  return `${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}$${Math.abs(v).toFixed(0)}`;
}

export function signed(x: number, digits = 1): string {
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function codeLabel(code: Code, to?: number, toCall?: number): string {
  if (code === 'c' && toCall !== undefined) return `Call ${money(toCall)}`;
  if ((code === 't' || code === 'h' || code === 'p' || code === 'a') && to !== undefined) {
    return code === 'a' ? `All-in ${money(to)}` : `${CODE_LABELS[code]} → ${money(to)}`;
  }
  return CODE_LABELS[code];
}

export function describeAction(r: ActionRecord, isBet: boolean): string {
  switch (r.kind) {
    case 'fold':
      return 'Fold';
    case 'check':
      return 'Check';
    case 'call':
      return r.allIn ? `Call ${money(r.added)} (all-in)` : `Call ${money(r.added)}`;
    default:
      if (r.allIn) return `All-in ${money(r.to)}`;
      return `${isBet ? 'Bet' : 'Raise to'} ${money(r.to)}`;
  }
}

export const streetName = (s: number) => STREET_NAMES[s] ?? 'Showdown';
