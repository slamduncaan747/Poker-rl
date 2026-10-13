import { describe, expect, it } from 'vitest';
import { parseCards } from '../src/cards';
import { type Deal, HUNLState, randomDeal } from '../src/game';
import { abstractActions, pseudoHarmonicLow, translateAction } from '../src/abstraction';
import { Rng } from '../src/rng';

function deal(h0: string, h1: string, board: string): Deal {
  const a = parseCards(h0);
  const b = parseCards(h1);
  return { holes: [[a[0], a[1]], [b[0], b[1]]], board: parseCards(board) };
}

const D = deal('AsAh', 'KsKh', '2c7d9hJcQd');

describe('HUNLState', () => {
  it('posts blinds and lets the button act first preflop', () => {
    const s = new HUNLState(D, 0);
    expect(s.streetBet).toEqual([50, 100]);
    expect(s.stacks).toEqual([9950, 9900]);
    expect(s.toAct).toBe(0);
    expect(s.legalKinds()).toEqual(['fold', 'call', 'raise']);
    expect(s.minRaiseTo()).toBe(200);
  });

  it('gives the big blind the option after a limp', () => {
    const s = new HUNLState(D, 0);
    s.apply({ kind: 'call' });
    expect(s.street).toBe(0);
    expect(s.toAct).toBe(1);
    expect(s.legalKinds()).toEqual(['check', 'raise']);
    s.apply({ kind: 'check' });
    expect(s.street).toBe(1);
    expect(s.toAct).toBe(1); // big blind acts first postflop
    expect(s.board.length).toBe(3);
  });

  it('awards the pot on a fold', () => {
    const s = new HUNLState(D, 0);
    s.apply({ kind: 'raise', to: 300 });
    s.apply({ kind: 'fold' });
    expect(s.terminal).toBe(true);
    expect(s.payoffs()).toEqual([100, -100]);
  });

  it('enforces the min-raise rule', () => {
    const s = new HUNLState(D, 0);
    s.apply({ kind: 'raise', to: 300 }); // raise of 200
    expect(s.minRaiseTo()).toBe(500);
    s.apply({ kind: 'raise', to: 100 }); // clamped up to the minimum
    expect(s.streetBet[1]).toBe(500);
  });

  it('plays to showdown and pays the best hand', () => {
    const s = new HUNLState(D, 0);
    s.apply({ kind: 'call' });
    s.apply({ kind: 'check' });
    for (let st = 1; st <= 3; st++) {
      s.apply({ kind: 'check' });
      s.apply({ kind: 'check' });
    }
    expect(s.terminal).toBe(true);
    expect(s.isShowdown).toBe(true);
    expect(s.payoffs()).toEqual([100, -100]);
  });

  it('runs out the board after an all-in call', () => {
    const s = new HUNLState(D, 1);
    s.apply({ kind: 'raise', to: 10_000 });
    s.apply({ kind: 'call' });
    expect(s.terminal).toBe(true);
    expect(s.board.length).toBe(5);
    expect(s.payoffs()).toEqual([10_000, -10_000]);
  });

  it('refunds the uncalled part of an all-in against a shorter stack', () => {
    const s = new HUNLState(D, 1, undefined, [3_000, 10_000]);
    s.apply({ kind: 'raise', to: 10_000 }); // seat 1 (button) shoves 100bb
    s.apply({ kind: 'call' }); // seat 0 calls all-in for 30bb
    expect(s.terminal).toBe(true);
    expect(s.payoffs()).toEqual([3_000, -3_000]);
  });

  it('splits tied pots', () => {
    const tie = deal('2c3d', '2h3s', 'AsKsQhJdTc');
    const s = new HUNLState(tie, 0);
    s.apply({ kind: 'raise', to: 10_000 });
    s.apply({ kind: 'call' });
    expect(s.payoffs()).toEqual([0, 0]);
  });

  it('is zero-sum across random play', () => {
    const rng = new Rng(42);
    for (let h = 0; h < 2000; h++) {
      const s = new HUNLState(randomDeal(rng), h & 1);
      let guard = 0;
      while (!s.terminal && guard++ < 100) {
        const acts = abstractActions(s);
        const a = acts[rng.int(acts.length)];
        s.apply(a.action, a.code);
        expect(s.stacks[0]).toBeGreaterThanOrEqual(0);
        expect(s.stacks[1]).toBeGreaterThanOrEqual(0);
      }
      expect(s.terminal).toBe(true);
      const [a, b] = s.payoffs();
      expect(a + b).toBe(0);
      expect(Math.abs(a)).toBeLessThanOrEqual(10_000);
    }
  });
});

describe('action abstraction', () => {
  it('offers pot-relative opens preflop', () => {
    const s = new HUNLState(D, 0);
    const acts = abstractActions(s);
    expect(acts.map((a) => a.code)).toEqual(['f', 'c', 'h', 'p', 'a']);
    expect(acts[2].action.to).toBe(200);
    expect(acts[3].action.to).toBe(300);
    expect(acts[4].action.to).toBe(10_000);
  });

  it('offers a third-pot bet postflop', () => {
    const s = new HUNLState(D, 0);
    s.apply({ kind: 'raise', to: 300 }, 'p');
    s.apply({ kind: 'call' }, 'c');
    const acts = abstractActions(s);
    expect(acts.map((a) => a.code)).toEqual(['k', 't', 'h', 'p', 'a']);
    expect(acts[1].action.to).toBe(200);
    expect(acts[3].action.to).toBe(600);
  });

  it('translates off-tree bets with the pseudo-harmonic mapping', () => {
    expect(pseudoHarmonicLow(0.5, 1, 0.5)).toBe(1);
    expect(pseudoHarmonicLow(0.5, 1, 1)).toBe(0);
    const mid = pseudoHarmonicLow(0.5, 1, 0.75);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.6);

    const s = new HUNLState(D, 0);
    s.apply({ kind: 'raise', to: 300 }, 'p');
    s.apply({ kind: 'call' }, 'c');
    const rng = new Rng(1);
    // exact sizes map deterministically
    expect(translateAction(s, { kind: 'raise', to: 600 }, rng)).toBe('p');
    expect(translateAction(s, { kind: 'raise', to: 10_000 }, rng)).toBe('a');
    // a 75% pot bet maps to either half-pot or pot
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(translateAction(s, { kind: 'raise', to: 450 }, rng));
    expect([...seen].sort()).toEqual(['h', 'p']);
  });
});
