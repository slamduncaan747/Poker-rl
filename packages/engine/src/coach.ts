/**
 * Coach mode: grade a player's decision against the blueprint, chess-engine
 * style. A decision is scored by how often the equilibrium strategy takes the
 * same action relative to its favourite action in that spot.
 */
import type { Code } from './abstraction';
import type { StrategyLookup } from './blueprint';
import type { ArchetypeSignature } from './agents';
import { type OpponentModel, STAT_KEYS } from './opponentModel';

export type GradeLabel = 'Best' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface Grade {
  street: number;
  code: Code;
  prob: number;
  maxProb: number;
  bestCode: Code;
  score: number;
  label: GradeLabel;
  codes: Code[];
  probs: number[];
}

export function gradeDecision(lookup: StrategyLookup, code: Code, street: number): Grade {
  const i = lookup.codes.indexOf(code);
  const prob = i >= 0 ? lookup.probs[i] : 0;
  let best = 0;
  lookup.probs.forEach((p, j) => {
    if (p > lookup.probs[best]) best = j;
  });
  const maxProb = lookup.probs[best];
  const score = maxProb > 0 ? Math.min(1, prob / maxProb) : 1;
  const label: GradeLabel =
    score >= 0.66 || prob >= 0.4 ? 'Best' : score >= 0.25 ? 'Good' : score >= 0.08 ? 'Inaccuracy' : score >= 0.02 ? 'Mistake' : 'Blunder';
  return { street, code, prob, maxProb, bestCode: lookup.codes[best], score, label, codes: lookup.codes, probs: lookup.probs };
}

/** Session accuracy in [0, 100], like a chess "accuracy" score. */
export function accuracy(grades: readonly Grade[]): number {
  if (grades.length === 0) return 100;
  return (100 * grades.reduce((a, g) => a + g.score, 0)) / grades.length;
}

/**
 * Bayesian archetype classification: the posterior over player types given
 * the observed counts, assuming each archetype's measured frequencies.
 * A temperature > 1 tempers over-confidence from correlated statistics.
 */
export function matchArchetypes(
  model: OpponentModel,
  signatures: readonly ArchetypeSignature[],
  temperature = 3,
): Array<{ id: string; name: string; prob: number }> {
  const logs = signatures.map((sig) => {
    let ll = 0;
    for (const k of STAT_KEYS) {
      const c = model.counters[k];
      if (!c.opps) continue;
      const p = Math.min(0.97, Math.max(0.03, sig.stats[k]));
      ll += c.hits * Math.log(p) + (c.opps - c.hits) * Math.log(1 - p);
    }
    return ll / temperature;
  });
  const m = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - m));
  const Z = w.reduce((a, b) => a + b, 0);
  return signatures
    .map((sig, i) => ({ id: sig.id, name: sig.name, prob: w[i] / Z }))
    .sort((a, b) => b.prob - a.prob);
}
