import {
  type AIAgent,
  type DecisionInfo,
  GROUPS,
  STAT_INFO,
  type StatKey,
} from '@poker-rl/engine';
import { pct } from './format';

export interface Reason {
  stat: string;
  label: string;
  detail: string;
  weight: number;
}

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
      headline: 'Exploitation is off — playing the CFR equilibrium strategy.',
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
          ? 'Still gathering evidence — staying close to equilibrium.'
          : 'No exploitable edge in this spot — playing near-GTO.',
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
          weight: w,
        };
      }
      const k = a.feature as StatKey;
      const s = snap.stats.find((x) => x.key === k)!;
      const info2 = STAT_INFO[k];
      const obs = s.raw === null ? 'no data yet' : `${pct(s.raw)} (${s.hits}/${s.opps})`;
      return {
        stat: k,
        label: info2.label,
        detail: `${obs} vs GTO ${pct(s.baseline)}`,
        weight: w,
      };
    });
  const verb = up ? 'More' : 'Less';
  return {
    headline: `${verb} ${GROUPS[best].toLowerCase()}: ${pct(info.groupBlueprint[best])} → ${pct(info.groupFinal[best])}`,
    tone: 'exploit',
    shiftGroup: best,
    shiftFrom: info.groupBlueprint[best],
    shiftTo: info.groupFinal[best],
    reasons,
  };
}
