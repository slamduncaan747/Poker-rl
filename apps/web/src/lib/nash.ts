import type { OpponentSnapshot, StatKey } from '@poker-rl/engine';
import type { BotDecisionView } from './store';

/** The AI's name at the table. */
export const NASH = 'Nash';

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

/** What Nash says about a habit that is clearly above / below normal. */
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

/** Nash's one-line remark after a decision. */
export function quip(d: BotDecisionView | undefined, snap: OpponentSnapshot | null): string {
  if (!d) return '';
  if (d.explanation.tone !== 'exploit') return snap && snap.hands < 10 ? 'Still learning you.' : 'Playing it straight.';
  const stat = d.explanation.reasons[0]?.stat as StatKey | undefined;
  const s = stat && snap?.stats.find((x) => x.key === stat);
  if (stat && s) return QUIP[stat][s.mean >= s.baseline ? 'high' : 'low'];
  return "I've got a read on you.";
}

/** Rewrite a leak's advice in Nash's voice. */
export function nashify(text: string): string {
  return text.replace(/\bthe bot\b/g, NASH).replace(/\bThe bot\b/g, NASH);
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

export const MARKS: Record<Mark, { sym: string; text: string; good: boolean }> = {
  Brilliant: { sym: '!!', text: 'Brilliant', good: true },
  Best: { sym: '★', text: 'Best', good: true },
  Good: { sym: '✓', text: 'Good', good: true },
  Inaccuracy: { sym: '?!', text: 'Inaccuracy', good: false },
  Mistake: { sym: '?', text: 'Mistake', good: false },
  Blunder: { sym: '??', text: 'Blunder', good: false },
};
