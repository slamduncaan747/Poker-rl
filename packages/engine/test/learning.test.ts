import { describe, expect, it } from 'vitest';
import { MLP } from '../src/nn';
import { Rng } from '../src/rng';
import { OpponentModel } from '../src/opponentModel';
import { HUNLState, type Deal } from '../src/game';
import { parseCards } from '../src/cards';
import { tiltPolicy } from '../src/agents';
import type { StrategyLookup } from '../src/blueprint';
import { gradeDecision, accuracy } from '../src/coach';

describe('MLP', () => {
  it('backprop matches numerical gradients', () => {
    const rng = new Rng(3);
    const net = new MLP([5, 7, 3], 'tanh', 'linear', rng);
    const x = [0.3, -0.2, 0.9, 0.1, -0.7];
    const gOut = [0.5, -1, 0.25];
    const loss = () => {
      const y = net.forward(x);
      return y[0] * gOut[0] + y[1] * gOut[1] + y[2] * gOut[2];
    };
    net.zeroGrad();
    net.forward(x);
    net.backward(gOut);
    const l0 = net.layers[0];
    for (const i of [0, 4, 11, 20]) {
      const orig = l0.w[i];
      const eps = 1e-3;
      l0.w[i] = orig + eps;
      const up = loss();
      l0.w[i] = orig - eps;
      const down = loss();
      l0.w[i] = orig;
      expect(l0.gw[i]).toBeCloseTo((up - down) / (2 * eps), 3);
    }
  });

  it('learns a simple regression with Adam', () => {
    const rng = new Rng(1);
    const net = new MLP([2, 16, 1], 'relu', 'linear', rng);
    const f = (a: number, b: number) => a * 0.7 - b * 0.4 + 0.1;
    let last = Infinity;
    for (let step = 0; step < 400; step++) {
      net.zeroGrad();
      let l = 0;
      for (let k = 0; k < 32; k++) {
        const a = rng.next() * 2 - 1;
        const b = rng.next() * 2 - 1;
        const y = net.forward([a, b])[0];
        const d = y - f(a, b);
        l += d * d;
        net.backward([2 * d]);
      }
      net.adam(0.01, 32);
      last = l / 32;
    }
    expect(last).toBeLessThan(0.01);
  });

  it('round-trips through JSON', () => {
    const net = new MLP([3, 4, 2], 'relu', 'linear', new Rng(9));
    const copy = MLP.fromJSON(net.toJSON());
    const a = Array.from(net.forward([0.1, 0.2, 0.3]));
    const b = Array.from(copy.forward([0.1, 0.2, 0.3]));
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 4));
  });
});

describe('tilt policy', () => {
  const lookup: StrategyLookup = {
    key: 'x',
    codes: ['f', 'c', 'h', 'a'],
    probs: [0.2, 0.5, 0.2, 0.1],
    actions: [],
    found: true,
  };
  it('is exactly the blueprint when lambda = 0', () => {
    const r = tiltPolicy(lookup, [2, -1, 1, 3], 0);
    r.probs.forEach((p, i) => expect(p).toBeCloseTo(lookup.probs[i], 9));
  });
  it('shifts mass toward groups with positive delta and sums to 1', () => {
    const r = tiltPolicy(lookup, [0, 0, 0, 1.5], 1);
    expect(r.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(r.probs[3]).toBeGreaterThan(lookup.probs[3] * 2);
  });
});

describe('opponent model', () => {
  const D: Deal = (() => {
    const a = parseCards('AsAh');
    const b = parseCards('7c2d');
    return { holes: [[a[0], a[1]], [b[0], b[1]]], board: parseCards('Kd9s4cJh3s') };
  })();

  it('starts at the baseline and moves with evidence', () => {
    const m = new OpponentModel();
    expect(m.mean('foldVsOpen')).toBeCloseTo(m.baseline.foldVsOpen, 9);
    expect(m.features().slice(0, 16).every((f) => Math.abs(f) < 1e-9)).toBe(true);
    for (let i = 0; i < 30; i++) {
      // hero (seat 0) opens from the button, villain folds the big blind
      const s = new HUNLState(D, 0);
      s.apply({ kind: 'raise', to: 250 });
      s.apply({ kind: 'fold' });
      m.observeHand(s, 0);
    }
    expect(m.hands).toBe(30);
    expect(m.counters.foldVsOpen.opps).toBe(30);
    expect(m.mean('foldVsOpen')).toBeGreaterThan(0.85);
    const [lo] = m.interval('foldVsOpen');
    expect(lo).toBeGreaterThan(m.baseline.foldVsOpen);
  });

  it('records showdown bluffs', () => {
    const m = new OpponentModel();
    const s = new HUNLState(D, 1); // villain (seat 1) on the button
    s.apply({ kind: 'call' });
    s.apply({ kind: 'check' });
    s.apply({ kind: 'check' }); // flop
    s.apply({ kind: 'check' });
    s.apply({ kind: 'check' }); // turn: hero checks
    s.apply({ kind: 'raise', to: 200 }); // villain bets with 7-high
    s.apply({ kind: 'call' });
    s.apply({ kind: 'check' }); // river
    s.apply({ kind: 'check' });
    expect(s.isShowdown).toBe(true);
    m.observeHand(s, 0);
    expect(m.counters.bluffShow).toEqual({ hits: 1, opps: 1 });
  });
});

describe('coach', () => {
  it('grades the most likely action as Best and rare ones as mistakes', () => {
    const lookup: StrategyLookup = { key: 'x', codes: ['f', 'c', 'p'], probs: [0.01, 0.79, 0.2], actions: [], found: true };
    expect(gradeDecision(lookup, 'c', 1).label).toBe('Best');
    expect(gradeDecision(lookup, 'p', 1).label).toBe('Good');
    expect(gradeDecision(lookup, 'f', 1).label).toBe('Blunder');
    expect(accuracy([gradeDecision(lookup, 'c', 1)])).toBe(100);
  });
});
