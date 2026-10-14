import { type AIAgent, type DecisionInfo, STAT_INFO, type StatKey, groupOf } from '@poker-rl/engine';
import { pct } from './format';

export interface Reason {
  stat: string;
  label: string;
  detail: string;
  /** plain-English sentence, e.g. "You fold to bets 64% of the time (a balanced player: 39%)." */
  sentence: string;
  weight: number;
}

/** What each tendency means, phrased as something the player does. */
export const STAT_PHRASE: Record<StatKey, string> = {
  vpip: 'play',
  pfr: 'raise preflop',
  sbOpen: 'open-raise the button',
  limp: 'just call from the button',
  foldVsOpen: 'fold your big blind to a raise',
  threeBet: 're-raise an open',
  foldTo3bet: 'fold to a re-raise',
  cbet: 'bet the flop after raising preflop',
  foldToCbet: 'fold to a flop continuation bet',
  postBet: 'bet when checked to',
  foldToBet: 'fold when facing a bet',
  raiseVsBet: 'raise when facing a bet',
  foldRiver: 'fold to a river bet',
  wtsd: 'go to showdown after the flop',
  bluffShow: 'are bluffing when you bet the turn or river',
  lightCall: 'call the river with a weak hand',
};

export const GROUP_PHRASE = ['folding', 'checking and calling', 'small bets', 'big bets and raises'];

export interface Explanation {
  headline: string;
  tone: 'gto' | 'exploit' | 'neutral';
  shiftGroup: number | null;
  shiftFrom: number;
  shiftTo: number;
  reasons: Reason[];
}

/**
 * Turn a decision into plain English: which action group the exploit layer
 * moved probability toward, and the opponent tendencies (via gradient × input
 * attribution) that drove the shift.
 */
export function explain(info: DecisionInfo, agent: AIAgent): Explanation {
  if (info.lambda <= 0 || !agent.actor) {
    return {
      headline: "I'm playing balanced poker.",
      tone: 'gto',
      shiftGroup: null,
      shiftFrom: 0,
      shiftTo: 0,
      reasons: [],
    };
  }
  let best = -1;
  let bestMag = 0;
  info.groupFinal.forEach((f, g) => {
    const b = info.groupBlueprint[g];
    const diff = f - b;
    if (Math.abs(diff) > bestMag) {
      bestMag = Math.abs(diff);
      best = g;
    }
  });
  if (best < 0 || bestMag < 0.04) {
    return {
      headline:
        agent.model.hands < 8
          ? "Still getting to know you, so I'm playing balanced."
          : 'No edge against you here, so I stay balanced.',
      tone: 'neutral',
      shiftGroup: null,
      shiftFrom: 0,
      shiftTo: 0,
      reasons: [],
    };
  }
  const up = info.groupFinal[best] > info.groupBlueprint[best];
  const attr = agent.attributions(info.input);
  const snap = agent.model.snapshot();
  const reasons: Reason[] = attr
    .map((a) => ({ a, w: a.contrib[best] * (up ? 1 : -1) }))
    .filter((x) => x.w > 0.02)
    .sort((x, y) => y.w - x.w)
    .slice(0, 3)
    .map(({ a, w }) => {
      if (a.feature === 'betSize') {
        return {
          stat: 'betSize',
          label: 'Bet sizing',
          detail: `average bet ${pct(agent.model.betSize())} of pot (GTO ~${pct(agent.model.baselineBetSize)})`,
          sentence: `Your bets average ${pct(agent.model.betSize())} of the pot (a balanced player: about ${pct(agent.model.baselineBetSize)}).`,
          weight: w,
        };
      }
      const k = a.feature as StatKey;
      const s = snap.stats.find((x) => x.key === k)!;
      const info2 = STAT_INFO[k];
      const obs = s.raw === null ? 'no data yet' : `${pct(s.raw)} (${s.hits}/${s.opps})`;
      // Quote the posterior estimate the bot actually uses, hedged while evidence is thin.
      const share = `${s.opps < 20 ? 'about ' : ''}${pct(s.mean)}`;
      const subject = k === 'vpip' || k === 'pfr' ? `${share} of hands` : `${share} of the time`;
      return {
        stat: k,
        label: info2.label,
        detail: `${obs} vs GTO ${pct(s.baseline)}`,
        sentence: `You ${STAT_PHRASE[k]} ${subject} — balanced: ${pct(s.baseline)}.`,
        weight: w,
      };
    });
  const chosenGroup = groupOf(info.codes[info.chosen]);
  const ratio = info.groupBlueprint[chosenGroup] > 0 ? info.groupFinal[chosenGroup] / info.groupBlueprint[chosenGroup] : 1;
  let headline: string;
  if (chosenGroup === best) {
    headline = up
      ? `Against you, I make this play ${ratio >= 1.8 ? 'much ' : ''}more often than balanced poker would.`
      : `Against you, I make this play less often than balanced poker would, but kept it in the mix.`;
  } else {
    headline = `Against you, I lean ${up ? 'toward' : 'away from'} ${GROUP_PHRASE[best]}, but my hand still led here.`;
  }
  return {
    headline,
    tone: 'exploit',
    shiftGroup: best,
    shiftFrom: info.groupBlueprint[best],
    shiftTo: info.groupFinal[best],
    reasons,
  };
}
