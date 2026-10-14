import { describe, expect, it } from 'vitest';
import type { ArchetypeSignature } from '../src/agents';
import { ARCHETYPES } from '../src/archetypes';
import { CloneAgent, fitClone } from '../src/clone';
import { DEFAULT_BASELINE, type OpponentSnapshot, STAT_KEYS, type StatKey } from '../src/opponentModel';

const sig = (id: string, shift: number): ArchetypeSignature => ({
  id,
  name: id,
  betSize: 0.6,
  stats: Object.fromEntries(STAT_KEYS.map((k) => [k, Math.min(0.95, Math.max(0.05, DEFAULT_BASELINE[k] + shift))])) as Record<StatKey, number>,
});

const SIGS = [sig('gto', 0), sig('station', -0.3), sig('maniac', 0.3)];

function snapshotOf(stats: Record<StatKey, number>, opps: number): OpponentSnapshot {
  return {
    hands: opps,
    betSize: 0.6,
    betSizeN: 0,
    stats: STAT_KEYS.map((key) => ({ key, mean: stats[key], lo: stats[key], hi: stats[key], hits: 0, opps, baseline: DEFAULT_BASELINE[key], raw: stats[key] })),
  };
}

describe('fitClone', () => {
  it('matches a player to the reference type they resemble', () => {
    const fit = fitClone(snapshotOf(SIGS[1].stats, 50), SIGS);
    const top = [...fit.weights].sort((a, b) => b.weight - a.weight)[0];
    expect(top.id).toBe('station');
    expect(fit.gtoWeight).toBeLessThan(0.05);
    expect(fit.style.vpip).toBeCloseTo(ARCHETYPES.station.vpip, 2);
  });

  it('clones a balanced player as mostly the blueprint', () => {
    const fit = fitClone(snapshotOf(SIGS[0].stats, 50), SIGS);
    expect(fit.gtoWeight).toBeGreaterThan(0.9);
    expect(fit.weights.reduce((a, w) => a + w.weight, 0)).toBeCloseTo(1, 6);
  });

  it('plays every hand as the blueprint when the fit is fully balanced', () => {
    const fit = { ...fitClone(snapshotOf(SIGS[0].stats, 50), SIGS), gtoWeight: 1 };
    const calls: number[] = [];
    const gto = { name: 'gto', beginHand: () => calls.push(1), act: () => ({ action: { kind: 'check' as const } }) };
    const clone = new CloneAgent(fit, gto);
    for (let i = 0; i < 5; i++) clone.beginHand({} as never, 0);
    expect(calls.length).toBe(5);
  });
});
