import type { StatKey } from '@poker-rl/engine';

/** The AI's name at the table. */
export const OTTO = 'Otto';

/** Each tracked habit, phrased as something you do. */
export const HABIT: Record<StatKey, string> = {
  vpip: 'Play a hand',
  pfr: 'Raise before the flop',
  sbOpen: 'Raise from the button',
  limp: 'Limp from the button',
  foldVsOpen: 'Fold your big blind',
  threeBet: 'Re-raise before the flop',
  foldTo3bet: 'Fold to a re-raise',
  cbet: 'Follow up on the flop',
  foldToCbet: 'Fold to a flop bet',
  postBet: 'Bet when checked to',
  foldToBet: 'Fold to a bet',
  raiseVsBet: 'Raise a bet',
  foldRiver: 'Fold on the river',
  wtsd: 'Go to showdown',
  bluffShow: 'Get caught bluffing',
  lightCall: 'Call light on the river',
};

/** Rewrite a leak's advice in Otto's voice. */
export function voice(text: string): string {
  return text.replace(/\bthe bot\b/g, OTTO).replace(/\bThe bot\b/g, OTTO);
}

export type Mark = 'Brilliant' | 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

/**
 * A bold play the solver agrees with but doesn't always make (a bet or raise it
 * mixes in under half the time) counts as brilliant; everything else keeps the
 * coach's label.
 */
export function markOf(g: { label: string; code: string; prob: number }): Mark {
  if (g.label === 'Best' && 'thpa'.includes(g.code) && g.prob < 0.5) return 'Brilliant';
  return g.label as Mark;
}

/** Chess-style marks, coloured from brilliant (teal) through green and yellow to blunder (red). */
export const MARKS: Record<Mark, { sym: string; text: string; good: boolean; color: string }> = {
  Brilliant: { sym: '!!', text: 'Brilliant', good: true, color: 'var(--color-mark-brilliant)' },
  Best: { sym: '★', text: 'Best', good: true, color: 'var(--color-mark-best)' },
  Good: { sym: '✓', text: 'Good', good: true, color: 'var(--color-mark-good)' },
  Inaccuracy: { sym: '?!', text: 'Inaccuracy', good: false, color: 'var(--color-mark-inaccuracy)' },
  Mistake: { sym: '?', text: 'Mistake', good: false, color: 'var(--color-mark-mistake)' },
  Blunder: { sym: '??', text: 'Blunder', good: false, color: 'var(--color-mark-blunder)' },
};

/** How each reference player type is named for you, short names for the map, and what Otto does about it. */
export const STYLES: Record<string, { name: string; short: string; blurb: string }> = {
  gto: { name: 'Balanced player', short: 'Balanced', blurb: "You're hard to read, so Otto stays balanced." },
  station: { name: 'Calling station', short: 'Station', blurb: 'You call too much. Otto bets its good hands bigger and stops bluffing you.' },
  maniac: { name: 'Maniac', short: 'Maniac', blurb: 'You bet and raise relentlessly. Otto calls you down lighter and traps.' },
  nit: { name: 'Rock', short: 'Rock', blurb: 'You play few hands and fold under pressure. Otto steals and bluffs more.' },
  tag: { name: 'Tight-aggressive regular', short: 'TAG', blurb: 'Solid and aggressive. Otto only makes small adjustments.' },
  lag: { name: 'Loose-aggressive player', short: 'LAG', blurb: 'Loose and aggressive. Otto calls and re-raises wider.' },
  scared: { name: 'Scared player', short: 'Scared', blurb: 'You fold to pressure. Otto keeps the pressure on.' },
  fish: { name: 'Loose-passive player', short: 'Passive', blurb: 'You play many hands but rarely bet. Otto bets its good hands relentlessly.' },
};
