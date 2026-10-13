/**
 * Match running and evaluation utilities.
 *
 * Poker results are extremely noisy, so evaluation uses *duplicate* matches:
 * every deal is played twice with the hole cards swapped between seats, which
 * cancels most of the card luck (the same trick used in the Annual Computer
 * Poker Competition).
 */
import { type Agent, applyDecision } from './agents';
import { type Deal, DEFAULT_CONFIG, type GameConfig, HUNLState, randomDeal } from './game';
import { Rng } from './rng';

export function playHand(
  agents: readonly [Agent, Agent],
  deal: Deal,
  button: number,
  rng: Rng,
  config: GameConfig = DEFAULT_CONFIG,
  onDecision?: (s: HUNLState, player: number) => void,
): HUNLState {
  const s = new HUNLState(deal, button, config);
  agents[0].beginHand?.(s, 0);
  agents[1].beginHand?.(s, 1);
  let guard = 0;
  while (!s.terminal) {
    if (guard++ > 200) throw new Error('Runaway hand');
    const p = s.toAct;
    onDecision?.(s, p);
    applyDecision(s, agents[p].act(s, rng), rng);
  }
  agents[0].endHand?.(s, 0);
  agents[1].endHand?.(s, 1);
  return s;
}

export interface MatchStats {
  hands: number;
  /** mean result for seat-0 agent, big blinds per hand */
  mean: number;
  /** standard error of the mean (bb/hand) */
  stderr: number;
  results: number[];
}

export function summarize(results: number[]): MatchStats {
  const n = results.length;
  const mean = results.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const v = results.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  return { hands: n, mean, stderr: Math.sqrt(v / Math.max(1, n)), results };
}

/**
 * Duplicate match: `makeA()` vs `makeB()` over `deals` deals. Each deal is
 * played once normally and once with the agents' seats swapped, in two
 * separate sessions (fresh agents) so neither session's opponent model learns
 * from the other.
 * Returns per-pair mean results for A in bb/hand.
 */
export function duplicateMatch(
  makeA: () => Agent,
  makeB: () => Agent,
  deals: number,
  seed: number,
  config: GameConfig = DEFAULT_CONFIG,
): MatchStats {
  const dealRng = new Rng(seed);
  const dealList: Deal[] = [];
  for (let i = 0; i < deals; i++) dealList.push(randomDeal(dealRng));
  const session = (mirror: boolean, s: number) => {
    const a = makeA();
    const b = makeB();
    const rng = new Rng(s);
    return dealList.map((deal, i) => {
      // In the mirrored session the agents swap seats while cards and button
      // stay put, so A plays exactly the cards and position B had.
      const agents: [Agent, Agent] = mirror ? [b, a] : [a, b];
      const st = playHand(agents, deal, i & 1, rng, config);
      return st.payoffs()[mirror ? 1 : 0] / config.bigBlind;
    });
  };
  const r1 = session(false, seed + 1);
  const r2 = session(true, seed + 2);
  return summarize(r1.map((x, i) => (x + r2[i]) / 2));
}
