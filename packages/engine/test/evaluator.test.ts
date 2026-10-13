import { describe, expect, it } from 'vitest';
import { handClass, handClassLabel, parseCards } from '../src/cards';
import { Category, categoryOf, evaluate } from '../src/evaluator';
import { equityVsHand, riverHandStrength } from '../src/equity';
import { Rng } from '../src/rng';

const ev = (s: string) => evaluate(parseCards(s));

describe('evaluator', () => {
  it('classifies every category', () => {
    expect(categoryOf(ev('AsKsQsJsTs2d3c'))).toBe(Category.StraightFlush);
    expect(categoryOf(ev('AsAhAdAc2d3c4h'))).toBe(Category.Quads);
    expect(categoryOf(ev('AsAhAdKcKd3c4h'))).toBe(Category.FullHouse);
    expect(categoryOf(ev('As9s7s4s2s3c4h'))).toBe(Category.Flush);
    expect(categoryOf(ev('9s8h7d6c5s2c2h'))).toBe(Category.Straight);
    expect(categoryOf(ev('As2h3d4c5s9cKh'))).toBe(Category.Straight); // wheel
    expect(categoryOf(ev('7s7h7d2c5s9cKh'))).toBe(Category.Trips);
    expect(categoryOf(ev('7s7h5d5c2s9cKh'))).toBe(Category.TwoPair);
    expect(categoryOf(ev('7s7h5d4c2s9cKh'))).toBe(Category.Pair);
    expect(categoryOf(ev('As7h5d4c2s9cKh'))).toBe(Category.HighCard);
  });

  it('orders hands correctly', () => {
    expect(ev('As2h3d4c5s9cKh')).toBeLessThan(ev('6s2h3d4c5s9cKh')); // wheel < six-high
    expect(ev('AsAhKdKcQs2c3h')).toBeGreaterThan(ev('AsAhKdKcJs2c3h')); // kicker
    expect(ev('AsAhKdKcQsQc3h')).toBe(ev('AsAhKdKcQs2c3h')); // third pair can't play over Q kicker
    expect(ev('KsKhKdAcAs2c3h')).toBeGreaterThan(ev('QsQhQdAcAs2c3h'));
    expect(ev('2s2h2dAcAsKcKh')).toBeGreaterThan(ev('AsAhKdKc2s3c4h')); // full house > two pair
  });

  it('uses the best five of seven', () => {
    expect(ev('AsKsQsJs9s8s7s')).toBe(ev('AsKsQsJs9s'));
  });
});

describe('cards', () => {
  it('maps 169 hand classes onto the range grid', () => {
    const [a, k, a2] = parseCards('AsKsAh');
    expect(handClassLabel(handClass(a, k))).toBe('AKs');
    expect(handClassLabel(handClass(a2, k))).toBe('AKo');
    expect(handClassLabel(handClass(a, a2))).toBe('AA');
    const seen = new Set<number>();
    for (let x = 0; x < 52; x++) for (let y = x + 1; y < 52; y++) seen.add(handClass(x, y));
    expect(seen.size).toBe(169);
  });
});

describe('equity', () => {
  it('computes AA vs KK preflop near 82%', () => {
    const [a, b, c, d] = parseCards('AsAhKdKc');
    const e = equityVsHand([a, b], [c, d], [], new Rng(5), 20000);
    expect(e).toBeGreaterThan(0.8);
    expect(e).toBeLessThan(0.84);
  });

  it('gives the nuts a river hand strength of 1', () => {
    const cards = parseCards('AsKsQsJsTs2d3c');
    expect(riverHandStrength(cards[0], cards[1], cards.slice(2))).toBe(1);
  });
});
