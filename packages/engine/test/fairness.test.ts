/**
 * Fair-play guarantees: the AI may only use information a human player at the
 * table would have — its own hole cards, the board dealt so far, the betting,
 * and cards shown at showdown.
 */
import { describe, expect, it } from 'vitest';
import { AIAgent } from '../src/agents';
import { type BlueprintFile, Blueprint } from '../src/blueprint';
import { type Card, deckWithout, parseCards } from '../src/cards';
import { type Deal, HUNLState } from '../src/game';
import { MLP } from '../src/nn';
import { OpponentModel } from '../src/opponentModel';
import { CryptoRng, Rng } from '../src/rng';
import { ACTOR_INPUTS } from '../src/agents';

// A tiny synthetic blueprint is enough: we test information flow, not strength.
const thresholds = [[], [0.2, 0.4, 0.6, 0.8], [0.2, 0.4, 0.6, 0.8], [0.2, 0.4, 0.6, 0.8]];
const file: BlueprintFile = {
  version: 1,
  meta: { iterations: 0, infosets: 0, trainedAt: '', seconds: 0, workers: 0 },
  thresholds,
  preflopStrength: Array.from({ length: 169 }, (_, i) => i / 169),
  preflopEquity: Array.from({ length: 169 }, () => 0.5),
  table: {},
};

function dealWith(botHole: string, oppHole: string, board: string): Deal {
  const b = parseCards(botHole);
  const o = parseCards(oppHole);
  return { holes: [[o[0], o[1]], [b[0], b[1]]], board: parseCards(board) };
}

/** Play a fixed public line, then return the bot's full policy at its next decision. */
function botPolicy(deal: Deal) {
  const bp = new Blueprint(file);
  const actor = new MLP([ACTOR_INPUTS, 16, 4], 'relu', 'linear', new Rng(1));
  const bot = new AIAgent(bp, actor, { lambda: 1 }, new OpponentModel());
  const s = new HUNLState(deal, 0);
  bot.beginHand();
  s.apply({ kind: 'raise', to: 300 }, 'p'); // human (seat 0) opens
  s.apply({ kind: 'call' }, 'c'); // bot calls; on the flop the big blind (the bot) acts first
  expect(s.street).toBe(1);
  expect(s.toAct).toBe(1);
  return bot.policy(s, new Rng(99)).result.probs;
}

describe('fair play', () => {
  it("the AI's decision ignores the opponent's hole cards and the undealt board", () => {
    // Same bot cards and same flop; different opponent cards and different turn/river.
    const a = botPolicy(dealWith('AsKd', '7c7h', 'Qs8d2c3h9s'));
    const b = botPolicy(dealWith('AsKd', 'JhTh', 'Qs8d2cKcAh'));
    expect(a.length).toBeGreaterThan(0);
    a.forEach((p, i) => expect(b[i]).toBeCloseTo(p, 12));
  });

  it('the opponent model learns nothing from cards that were never shown', () => {
    const fold = (opp: string) => {
      const m = new OpponentModel();
      const s = new HUNLState(dealWith('AsKd', opp, 'Qs8d2c3h9s'), 0);
      s.apply({ kind: 'raise', to: 300 }); // seat 0 (modelled player) opens
      s.apply({ kind: 'raise', to: 900 }); // bot 3-bets
      s.apply({ kind: 'fold' }); // the player folds: cards stay hidden
      m.observeHand(s, 1);
      return JSON.stringify(m.counters);
    };
    expect(fold('7c2d')).toBe(fold('AhAc'));
  });

  it('deals with a cryptographic RNG that covers the whole deck', () => {
    const rng = new CryptoRng();
    const seen = new Set<Card>();
    for (let i = 0; i < 2000; i++) {
      const d = deckWithout([]);
      seen.add(d[rng.int(52)]);
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(seen.size).toBe(52);
  });

  it('both seats get identical blinds and stacks over a session (button alternates)', () => {
    let posted = [0, 0];
    for (let h = 1; h <= 100; h++) {
      const s = new HUNLState({ holes: [[0, 1], [2, 3]], board: [4, 5, 6, 7, 8] }, h % 2);
      posted = [posted[0] + s.invested[0], posted[1] + s.invested[1]];
      expect(s.stacks[0] + s.invested[0]).toBe(s.stacks[1] + s.invested[1]);
    }
    expect(posted[0]).toBe(posted[1]);
  });
});
