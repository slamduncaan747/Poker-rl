import { CODE_LABELS, type Code, type ActionRecord, STREET_NAMES } from '@poker-rl/engine';

export const BB = 100;

export function bb(chips: number, digits = 1): string {
  const v = chips / BB;
  const s = Math.abs(v) >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(digits);
  return `${s}`;
}

export function signed(x: number, digits = 1): string {
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function codeLabel(code: Code, to?: number, toCall?: number): string {
  if (code === 'c' && toCall !== undefined) return `Call ${bb(toCall)}`;
  if ((code === 't' || code === 'h' || code === 'p' || code === 'a') && to !== undefined) {
    return code === 'a' ? `All-in ${bb(to)}` : `${CODE_LABELS[code]} → ${bb(to)}`;
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
      return r.allIn ? `Call ${bb(r.added)} (all-in)` : `Call ${bb(r.added)}`;
    default:
      if (r.allIn) return `All-in ${bb(r.to)}`;
      return `${isBet ? 'Bet' : 'Raise to'} ${bb(r.to)}`;
  }
}

export const streetName = (s: number) => STREET_NAMES[s] ?? 'Showdown';
