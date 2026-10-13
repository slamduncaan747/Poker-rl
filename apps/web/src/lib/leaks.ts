import type { OpponentSnapshot, StatKey } from '@poker-rl/engine';

/** Advice for a tendency that is too high / too low relative to equilibrium. */
const ADVICE: Record<StatKey, { high: string; low: string }> = {
  vpip: { high: 'You play too many hands preflop — tighten up your weakest offsuit holdings.', low: 'You are folding too much preflop; heads-up ranges are very wide.' },
  pfr: { high: 'You raise preflop very often — make sure your raises aren’t predictable.', low: 'You rarely raise preflop. Raising takes the initiative and wins pots outright.' },
  sbOpen: { high: 'Your button opens are very wide.', low: 'Open-raise more from the button instead of limping or folding.' },
  limp: { high: 'You limp the button a lot — the bot isolates limps aggressively.', low: '' },
  foldVsOpen: { high: 'You give up your big blind too easily — defend wider; you already have 1bb invested.', low: 'You defend the big blind very wide — fine, but play carefully out of position.' },
  threeBet: { high: 'You 3-bet a lot; the bot will 4-bet and call lighter.', low: 'You rarely 3-bet. Re-raising some strong and some bluffing hands makes you harder to play against.' },
  foldTo3bet: { high: 'You fold to 3-bets too often — the bot will re-raise you light.', low: 'You almost never fold to 3-bets; the bot will value-bet you harder.' },
  cbet: { high: 'You c-bet almost every flop — the bot will float and raise more.', low: 'You check too many flops after raising preflop; you give up initiative.' },
  foldToCbet: { high: 'You fold to continuation bets too much — the bot is c-betting you with air.', low: 'You rarely fold to c-bets; expect thinner value bets.' },
  postBet: { high: 'You bet very often when checked to — the bot will check-raise and call down lighter.', low: 'You check back a lot. Betting for value and as a bluff wins more pots.' },
  foldToBet: { high: 'You fold to postflop bets too often — the bot bluffs you more and more.', low: 'You almost never fold to a bet — a calling station. The bot stops bluffing and value-bets thin.' },
  raiseVsBet: { high: 'You raise bets frequently; the bot calls down lighter and traps.', low: 'You rarely raise postflop — your range is capped when you just call.' },
  foldRiver: { high: 'You fold to river bets too much — big river bluffs work against you.', low: 'You call river bets too light — the bot value-bets big and never bluffs you.' },
  wtsd: { high: 'You go to showdown a lot — classic calling-station profile.', low: 'You rarely reach showdown — you may be folding too much.' },
  bluffShow: { high: 'You have shown down many bluffs — the bot will call you down lighter.', low: 'Your aggression is almost always value — the bot folds marginal hands to your bets.' },
  lightCall: { high: 'You make lots of light river calls.', low: '' },
};

export interface Leak {
  key: StatKey;
  direction: 'high' | 'low';
  severity: number;
  advice: string;
  mean: number;
  baseline: number;
  opps: number;
}

/** Tendencies whose 95% credible interval excludes the equilibrium baseline. */
export function findLeaks(snap: OpponentSnapshot): Leak[] {
  const out: Leak[] = [];
  for (const s of snap.stats) {
    if (s.opps < 5) continue;
    const high = s.lo > s.baseline;
    const low = s.hi < s.baseline;
    if (!high && !low) continue;
    const advice = ADVICE[s.key][high ? 'high' : 'low'];
    if (!advice) continue;
    out.push({ key: s.key, direction: high ? 'high' : 'low', severity: Math.abs(s.mean - s.baseline), advice, mean: s.mean, baseline: s.baseline, opps: s.opps });
  }
  return out.sort((a, b) => b.severity - a.severity);
}
