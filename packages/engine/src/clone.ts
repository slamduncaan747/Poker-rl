/**
 * Player cloning.
 *
 * Turns what the opponent model has seen of a player into an agent that plays
 * like them, so their style can be simulated against any bot. The clone is a
 * blend of the reference player types, weighted by how closely each type's
 * measured statistics match the player's: a parametric blend of the styles,
 * mixed per hand with the equilibrium blueprint for the share of the player
 * that looks balanced.
 */
import type { Agent, ArchetypeSignature, Decision } from './agents';
import { ARCHETYPES, type Style, StyleAgent } from './archetypes';
import type { HUNLState } from './game';
import type { OpponentSnapshot, StatKey } from './opponentModel';
import { Rng } from './rng';

/** Statistics used to match a player to the reference types. */
const FIT_KEYS: StatKey[] = [
  'vpip', 'pfr', 'sbOpen', 'limp', 'foldVsOpen', 'threeBet', 'foldTo3bet',
  'cbet', 'foldToCbet', 'postBet', 'foldToBet', 'raiseVsBet', 'foldRiver', 'wtsd',
];

const STYLE_FIELDS = ['vpip', 'pfr', 'threeBet', 'aggression', 'bluff', 'callDown', 'sizing', 'valueThresh', 'openSize'] as const;

export interface CloneFit {
  style: Style;
  /** share of hands played like the equilibrium blueprint */
  gtoWeight: number;
  /** weight of each reference type (including 'gto'), summing to 1 */
  weights: Array<{ id: string; name: string; weight: number }>;
}

/**
 * Fit a clone to a snapshot. Each statistic counts in proportion to how often
 * it has been observed, and the snapshot's means are already shrunk toward
 * balanced play, so a player seen for a few hands clones as mostly balanced.
 */
export function fitClone(snap: OpponentSnapshot, signatures: ArchetypeSignature[], temperature = 0.006): CloneFit {
  const stats = new Map(snap.stats.map((s) => [s.key, s]));
  const dist = signatures.map((sig) => {
    let num = 0;
    let den = 0;
    for (const k of FIT_KEYS) {
      const s = stats.get(k);
      if (!s) continue;
      const w = s.opps / (s.opps + 4);
      num += w * (s.mean - sig.stats[k]) ** 2;
      den += w;
    }
    return den > 0 ? num / den : 0;
  });
  const best = Math.min(...dist);
  const raw = dist.map((d) => Math.exp(-(d - best) / temperature));
  const Z = raw.reduce((a, b) => a + b, 0);
  const weights = signatures.map((sig, i) => ({ id: sig.id, name: sig.name, weight: raw[i] / Z }));

  const styled = weights.filter((w) => ARCHETYPES[w.id]);
  const styleMass = styled.reduce((a, w) => a + w.weight, 0);
  const style: Style = { ...ARCHETYPES.tag, id: 'clone', name: 'Your clone' };
  if (styleMass > 0) {
    for (const f of STYLE_FIELDS) {
      style[f] = styled.reduce((a, w) => a + (w.weight / styleMass) * ARCHETYPES[w.id][f], 0);
    }
  }
  return { style, gtoWeight: 1 - styleMass, weights };
}

/** Plays each hand either like the blueprint or like the fitted style. */
export class CloneAgent implements Agent {
  readonly name = 'Your clone';
  private styleAgent: StyleAgent;
  private current: Agent;
  private rng: Rng;
  private gtoWeight: number;

  constructor(
    fit: CloneFit,
    private gto: Agent,
    seed = 1,
  ) {
    this.styleAgent = new StyleAgent(fit.style);
    this.current = this.styleAgent;
    this.rng = new Rng(seed);
    this.gtoWeight = fit.gtoWeight;
  }

  beginHand(s: HUNLState, seat: number): void {
    this.current = this.rng.next() < this.gtoWeight ? this.gto : this.styleAgent;
    this.current.beginHand?.(s, seat);
  }

  act(s: HUNLState, rng: Rng): Decision {
    return this.current.act(s, rng);
  }
}
