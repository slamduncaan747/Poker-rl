import type { OpponentSnapshot, StatKey } from '@poker-rl/engine';
import type { BotDecisionView } from './store';

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

/** What Otto says about a habit that is clearly above / below normal. */
const QUIP: Record<StatKey, { high: string; low: string }> = {
  vpip: { high: 'You play every hand.', low: "You're so tight." },
  pfr: { high: 'You raise a lot.', low: 'You never raise.' },
  sbOpen: { high: 'You open wide.', low: "You don't open enough." },
  limp: { high: 'Limping again?', low: 'You never limp.' },
  foldVsOpen: { high: 'You give up your blind.', low: 'You defend everything.' },
  threeBet: { high: 'Re-raising again?', low: "You don't fight back." },
  foldTo3bet: { high: 'You fold to re-raises.', low: 'You never back down.' },
  cbet: { high: 'You always follow up.', low: 'You give up the lead.' },
  foldToCbet: { high: 'You give up flops.', low: "You don't let go." },
  postBet: { high: 'You bet whenever you can.', low: 'You check too much.' },
  foldToBet: { high: 'You fold too much.', low: 'You never fold.' },
  raiseVsBet: { high: 'You raise a lot.', low: 'You just call.' },
  foldRiver: { high: 'You fold rivers.', low: 'You call everything.' },
  wtsd: { high: 'You love showdowns.', low: 'You give up early.' },
  bluffShow: { high: "I've seen your bluffs.", low: 'You only bet the goods.' },
  lightCall: { high: 'You call light.', low: 'You only call with it.' },
};

/** Otto's one-line remark after a decision. */
export function quip(d: BotDecisionView | undefined, snap: OpponentSnapshot | null): string {
  if (!d) return '';
  if (d.explanation.tone !== 'exploit') return snap && snap.hands < 10 ? 'Still learning you.' : 'Playing it straight.';
  const stat = d.explanation.reasons[0]?.stat as StatKey | undefined;
  const s = stat && snap?.stats.find((x) => x.key === stat);
  if (stat && s) return QUIP[stat][s.mean >= s.baseline ? 'high' : 'low'];
  return "I've got a read on you.";
}

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
  Brilliant: { sym: '!!', text: 'Brilliant', good: true, color: '#3cc2ae' },
  Best: { sym: '★', text: 'Best', good: true, color: '#7cc160' },
  Good: { sym: '✓', text: 'Good', good: true, color: '#a6b892' },
  Inaccuracy: { sym: '?!', text: 'Inaccuracy', good: false, color: '#e6bf45' },
  Mistake: { sym: '?', text: 'Mistake', good: false, color: '#ee8d3e' },
  Blunder: { sym: '??', text: 'Blunder', good: false, color: '#e5513f' },
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
