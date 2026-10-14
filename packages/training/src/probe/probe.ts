// Quick exploitability probes: simple human-style counter-strategies vs Otto.
import { readFileSync } from 'node:fs';
import {
  AIAgent, type Agent, Blueprint, type BlueprintFile, type Decision, duplicateMatch, equityVsRandom,
  DEFAULT_CONFIG, type ExploitModelFile, handClass, type HUNLState, loadActor, PREFLOP_STRENGTH, type Rng, type Action,
} from '@poker-rl/engine';

const bp = new Blueprint(JSON.parse(readFileSync('apps/web/public/models/blueprint.json', 'utf8')) as BlueprintFile);
const ex = JSON.parse(readFileSync('apps/web/public/models/exploit.json', 'utf8')) as ExploitModelFile;
const SAMPLING = { runouts: 60, opps: 6, riverSamples: 0 };

const tells: Record<string, { n: number; sum: number }> = {};
const sizeClass = (f: number) => (f < 0.4 ? '<40%' : f < 0.8 ? '40-80%' : f < 1.2 ? '80-120%' : '>120%');
const stats = { decisions: 0, notFound: 0, byStreet: [0, 0, 0, 0], missByStreet: [0, 0, 0, 0] };
class Tracked extends AIAgent {
  override act(s: HUNLState, rng: Rng): Decision {
    const d = super.act(s, rng);
    stats.decisions++; stats.byStreet[s.street]++;
    if (d.info && !d.info.found) { stats.notFound++; stats.missByStreet[s.street]++; }
    if (d.info && s.street > 0) {
      const pct = bp.abstraction.percentile(s.street, d.info.bucket);
      const code = d.info.codes[d.info.chosen];
      const tc = s.toCall(s.toAct);
      const k = tc === 0 ? `S${s.street} open ${code}` : `S${s.street} facing ${sizeClass(tc / (s.pot - tc))} -> ${code === 'f' ? 'fold' : code === 'c' ? 'call' : 'raise'}`;
      const t = (tells[k] ??= { n: 0, sum: 0 }); t.n++; t.sum += pct;
    }
    return d;
  }
}
const otto = () => new Tracked(bp, loadActor(ex), { lambda: 1, sampling: SAMPLING, name: 'Otto' });
const gto = () => new Tracked(bp, null, { sampling: SAMPLING, name: 'GTO' });

/** Strength-based probe bot; `post` decides postflop given equity and situation. */
abstract class Probe implements Agent {
  abstract name: string;
  private cache = new Map<number, number>();
  beginHand() { this.cache.clear(); }
  eq(s: HUNLState, rng: Rng) {
    const p = s.toAct; const [a, b] = s.holes(p);
    if (s.street === 0) return PREFLOP_STRENGTH[handClass(a, b)] ?? 0.5;
    let e = this.cache.get(s.street);
    if (e === undefined) { e = equityVsRandom(a, b, s.board, 150, rng); this.cache.set(s.street, e); }
    return e;
  }
  to(s: HUNLState, frac: number): Action {
    const p = s.toAct; const cur = s.streetBet[1 - p]; const pa = s.pot + (cur - s.streetBet[p]);
    const min = s.minRaiseTo(p)!; const all = s.allInTo(p);
    let t = Math.max(min, Math.round(cur + frac * pa));
    if (t > 0.85 * all) t = all;
    return { kind: 'raise', to: Math.min(t, all) };
  }
  minRaise(s: HUNLState): Action { return { kind: 'raise', to: s.minRaiseTo(s.toAct)! }; }
  pre(s: HUNLState, x: number): Action {
    // solid-ish preflop: open 2.5x top 75%, defend top 55%, 3-bet top 12%, jam vs 4-bet top 5%
    const p = s.toAct; const r = s.raisesThisStreet; const can = s.minRaiseTo(p) !== null;
    const facing = s.toCall(p) > 0;
    if (r === 0 && p === s.button) return x > 0.25 && can ? { kind: 'raise', to: 250 } : { kind: 'fold' };
    if (r === 0) return x > 0.7 && can ? { kind: 'raise', to: 750 } : { kind: 'check' };
    if (r === 1) return x > 0.88 && can ? this.to(s, 0.9) : x > 0.45 ? { kind: 'call' } : { kind: 'fold' };
    if (x > 0.95 && can) return { kind: 'raise', to: s.allInTo(p) };
    return x > 0.8 || !facing ? { kind: 'call' } : { kind: 'fold' };
  }
  abstract post(s: HUNLState, x: number, rng: Rng): Action;
  act(s: HUNLState, rng: Rng): Decision {
    const x = this.eq(s, rng);
    return { action: s.street === 0 ? this.pre(s, x) : this.post(s, x, rng) };
  }
  callOrFold(s: HUNLState, x: number, slack = 0.05): Action {
    const tc = s.toCall(s.toAct); const odds = tc / (s.pot + tc);
    return x > odds + slack ? { kind: 'call' } : { kind: 'fold' };
  }
}

/** Polarised overbets (1.5x pot) with strong hands and air; off-tree size. */
class Overbettor extends Probe {
  name = 'Overbettor';
  post(s: HUNLState, x: number, rng: Rng): Action {
    const can = s.minRaiseTo(s.toAct) !== null;
    if (s.toCall(s.toAct) === 0) return can && (x > 0.75 || (x < 0.35 && rng.next() < 0.5)) ? this.to(s, 1.5) : { kind: 'check' };
    if (can && x > 0.88) return this.to(s, 1.5);
    return this.callOrFold(s, x);
  }
}

/** Min-raises every bet Otto makes with a wide range (translation exploit). */
class MinRaiser extends Probe {
  name = 'MinRaiser';
  post(s: HUNLState, x: number, rng: Rng): Action {
    const can = s.minRaiseTo(s.toAct) !== null;
    const tc = s.toCall(s.toAct);
    if (tc === 0) return can && x > 0.6 ? this.to(s, 0.5) : { kind: 'check' };
    if (can && s.raisesThisStreet < 2 && (x > 0.6 || rng.next() < 0.35)) return this.minRaise(s);
    return this.callOrFold(s, x);
  }
}

/** Stabs small (~25% pot) whenever checked to; plays straightforwardly otherwise. */
class Stabber extends Probe {
  name = 'Stabber';
  post(s: HUNLState, x: number): Action {
    const can = s.minRaiseTo(s.toAct) !== null;
    if (s.toCall(s.toAct) === 0) return can ? this.to(s, x > 0.8 ? 0.75 : 0.25) : { kind: 'check' };
    if (can && x > 0.85) return this.to(s, 1);
    return this.callOrFold(s, x);
  }
}

/** Honest value player: bets 2/3 pot with good hands, calls by pot odds, never bluffs. */
class Honest extends Probe {
  name = 'Honest';
  post(s: HUNLState, x: number): Action {
    const can = s.minRaiseTo(s.toAct) !== null;
    if (s.toCall(s.toAct) === 0) return can && x > 0.65 ? this.to(s, 0.66) : { kind: 'check' };
    if (can && x > 0.85) return this.to(s, 1);
    return this.callOrFold(s, x, 0);
  }
}

const probes: Record<string, () => Agent> = {
  overbet: () => new Overbettor(), minraise: () => new MinRaiser(), stab: () => new Stabber(), honest: () => new Honest(),
};
const which = process.argv[2];
const vs = process.argv[3] ?? 'otto';
const deals = Number(process.argv[4] ?? 1500);
const r = which === 'short' ? null! : duplicateMatch(vs === 'otto' ? otto : gto, probes[which], deals, 7);
if (r) { const bb100 = r.mean * 100, ci = 1.96 * r.stderr * 100;
console.log(JSON.stringify({ probe: which, vs, deals, ottoBB100: +bb100.toFixed(1), ci95: +ci.toFixed(1),
  missRate: +(stats.notFound / stats.decisions).toFixed(3), missByStreet: stats.missByStreet.map((m, i) => +(m / Math.max(1, stats.byStreet[i])).toFixed(3)) })); }
if (process.argv[5] === 'tells') {
  for (const k of Object.keys(tells).sort()) console.log(k.padEnd(32), String(tells[k].n).padStart(6), (tells[k].sum / tells[k].n).toFixed(2));
}
/** Short-stack shover: jams preflop with a wide range, calls jams tighter. */
export class Shover extends Probe {
  name = 'Shover';
  override pre(s: HUNLState, x: number): Action {
    const p = s.toAct; const can = s.minRaiseTo(p) !== null; const tc = s.toCall(p);
    if (s.raisesThisStreet === 0 && p === s.button) return x > 0.35 && can ? { kind: 'raise', to: s.allInTo(p) } : { kind: 'fold' };
    if (s.raisesThisStreet === 0) return x > 0.6 && can ? { kind: 'raise', to: s.allInTo(p) } : { kind: 'check' };
    if (can && x > 0.55) return { kind: 'raise', to: s.allInTo(p) };
    return x > 0.6 || tc === 0 ? { kind: 'call' } : { kind: 'fold' };
  }
  post(s: HUNLState, x: number): Action { return s.toCall(s.toAct) === 0 ? { kind: 'check' } : this.callOrFold(s, x); }
}
if (process.argv[2] === 'short') {
  for (const bbs of [15, 25, 40]) {
    const cfg = { ...DEFAULT_CONFIG, startingStack: bbs * 100 };
    for (const [n, mk] of [['otto', otto], ['gto', gto]] as const) {
      const r = duplicateMatch(mk, () => new Shover(), 4000, 11, cfg);
      console.log(`${bbs}bb ${n} vs Shover: ${(r.mean * 100).toFixed(1)} ± ${(1.96 * r.stderr * 100).toFixed(1)} bb/100`);
    }
  }
}
