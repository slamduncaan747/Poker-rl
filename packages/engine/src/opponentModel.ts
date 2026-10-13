/**
 * Bayesian opponent model.
 *
 * Every tendency is a Beta-Bernoulli posterior with a prior centred on what an
 * equilibrium (blueprint) player does. With little data the posterior mean is
 * shrunk toward "balanced", so the exploitation layer — which consumes these
 * posteriors — naturally starts out close to GTO and only deviates once the
 * evidence is strong. That is the core of *safe* exploitation.
 *
 * The model only uses information a human at the table would have: the public
 * action history plus hole cards revealed at showdown.
 */
import { riverHandStrength } from './equity';
import type { HUNLState } from './game';

export const STAT_KEYS = [
  'vpip',
  'pfr',
  'sbOpen',
  'limp',
  'foldVsOpen',
  'threeBet',
  'foldTo3bet',
  'cbet',
  'foldToCbet',
  'postBet',
  'foldToBet',
  'raiseVsBet',
  'foldRiver',
  'wtsd',
  'bluffShow',
  'lightCall',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export interface StatInfo {
  label: string;
  short: string;
  description: string;
}

export const STAT_INFO: Record<StatKey, StatInfo> = {
  vpip: { label: 'VPIP', short: 'VPIP', description: 'Voluntarily put money in the pot preflop' },
  pfr: { label: 'Preflop raise', short: 'PFR', description: 'Raised preflop' },
  sbOpen: { label: 'Button open', short: 'Open', description: 'Raised first in from the button' },
  limp: { label: 'Limp', short: 'Limp', description: 'Just called the big blind from the button' },
  foldVsOpen: { label: 'Fold to steal', short: 'F-Steal', description: 'Folded the big blind to a button raise' },
  threeBet: { label: '3-bet', short: '3Bet', description: 'Re-raised a button open' },
  foldTo3bet: { label: 'Fold to 3-bet', short: 'F-3Bet', description: 'Folded after opening and facing a re-raise' },
  cbet: { label: 'C-bet', short: 'CBet', description: 'Continuation bet the flop after raising preflop' },
  foldToCbet: { label: 'Fold to c-bet', short: 'F-CBet', description: 'Folded to a flop continuation bet' },
  postBet: { label: 'Bet when checked to', short: 'Bet', description: 'Bet postflop when given the chance' },
  foldToBet: { label: 'Fold to bet', short: 'F-Bet', description: 'Folded postflop when facing a bet' },
  raiseVsBet: { label: 'Raise vs bet', short: 'Raise', description: 'Raised postflop when facing a bet' },
  foldRiver: { label: 'Fold to river bet', short: 'F-Riv', description: 'Folded when facing a river bet' },
  wtsd: { label: 'Went to showdown', short: 'WTSD', description: 'Reached showdown after seeing the flop' },
  bluffShow: { label: 'Bluff rate', short: 'Bluff', description: 'Showed down a weak hand after betting/raising on the turn or river' },
  lightCall: { label: 'Light calls', short: 'Light', description: 'Showed down a weak hand after calling a river bet' },
};

/**
 * Baseline (approximately equilibrium) frequencies used as prior means.
 * Overwritten at load time by values measured from blueprint self-play.
 */
export const DEFAULT_BASELINE: Record<StatKey, number> = {
  vpip: 0.72,
  pfr: 0.42,
  sbOpen: 0.7,
  limp: 0.1,
  foldVsOpen: 0.35,
  threeBet: 0.15,
  foldTo3bet: 0.4,
  cbet: 0.6,
  foldToCbet: 0.4,
  postBet: 0.45,
  foldToBet: 0.38,
  raiseVsBet: 0.1,
  foldRiver: 0.4,
  wtsd: 0.35,
  bluffShow: 0.3,
  lightCall: 0.25,
};

export const DEFAULT_BET_SIZE = 0.6;
export const PRIOR_STRENGTH = 6;

interface Counter {
  hits: number;
  opps: number;
}

export interface StatSnapshot {
  key: StatKey;
  mean: number;
  lo: number;
  hi: number;
  hits: number;
  opps: number;
  baseline: number;
  /** raw (unsmoothed) frequency, or null with no data */
  raw: number | null;
}

export interface OpponentSnapshot {
  hands: number;
  stats: StatSnapshot[];
  betSize: number;
  betSizeN: number;
}

export class OpponentModel {
  hands = 0;
  counters: Record<StatKey, Counter>;
  betSizeSum = 0;
  betSizeN = 0;

  constructor(
    public baseline: Record<StatKey, number> = DEFAULT_BASELINE,
    public priorStrength = PRIOR_STRENGTH,
    public baselineBetSize = DEFAULT_BET_SIZE,
  ) {
    this.counters = Object.fromEntries(STAT_KEYS.map((k) => [k, { hits: 0, opps: 0 }])) as Record<StatKey, Counter>;
  }

  reset(): void {
    this.hands = 0;
    for (const k of STAT_KEYS) this.counters[k] = { hits: 0, opps: 0 };
    this.betSizeSum = 0;
    this.betSizeN = 0;
  }

  clone(): OpponentModel {
    const m = new OpponentModel(this.baseline, this.priorStrength, this.baselineBetSize);
    m.hands = this.hands;
    for (const k of STAT_KEYS) m.counters[k] = { ...this.counters[k] };
    m.betSizeSum = this.betSizeSum;
    m.betSizeN = this.betSizeN;
    return m;
  }

  private add(k: StatKey, hit: boolean) {
    this.counters[k].opps++;
    if (hit) this.counters[k].hits++;
  }

  /** Posterior mean of a tendency. */
  mean(k: StatKey): number {
    const c = this.counters[k];
    const a = this.baseline[k] * this.priorStrength + c.hits;
    const b = (1 - this.baseline[k]) * this.priorStrength + (c.opps - c.hits);
    return a / (a + b);
  }

  /** ~95% credible interval (normal approximation to the Beta posterior). */
  interval(k: StatKey): [number, number] {
    const c = this.counters[k];
    const a = this.baseline[k] * this.priorStrength + c.hits;
    const b = (1 - this.baseline[k]) * this.priorStrength + (c.opps - c.hits);
    const m = a / (a + b);
    const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
    return [Math.max(0, m - 1.96 * sd), Math.min(1, m + 1.96 * sd)];
  }

  betSize(): number {
    const k = 4;
    return (this.baselineBetSize * k + this.betSizeSum) / (k + this.betSizeN);
  }

  snapshot(): OpponentSnapshot {
    return {
      hands: this.hands,
      betSize: this.betSize(),
      betSizeN: this.betSizeN,
      stats: STAT_KEYS.map((key) => {
        const [lo, hi] = this.interval(key);
        const c = this.counters[key];
        return {
          key,
          mean: this.mean(key),
          lo,
          hi,
          hits: c.hits,
          opps: c.opps,
          baseline: this.baseline[key],
          raw: c.opps ? c.hits / c.opps : null,
        };
      }),
    };
  }

  /**
   * Update from a finished hand. `hero` is the seat doing the modelling; the
   * opponent is the other seat.
   */
  observeHand(s: HUNLState, hero: number): void {
    const opp = 1 - hero;
    this.hands++;
    const log = s.log;
    const pre = log.filter((r) => r.street === 0);
    const oppPre = pre.filter((r) => r.player === opp);
    const oppIsButton = s.button === opp;

    // --- preflop
    this.add('vpip', oppPre.some((r) => r.kind === 'call' || r.kind === 'raise'));
    this.add('pfr', oppPre.some((r) => r.kind === 'raise'));
    if (oppIsButton && pre.length > 0) {
      const first = pre[0];
      if (first.player === opp) {
        this.add('sbOpen', first.kind === 'raise');
        this.add('limp', first.kind === 'call');
      }
    } else if (pre.length > 0 && pre[0].player === hero && pre[0].kind === 'raise') {
      // hero opened from the button, opponent defends the big blind
      const resp = pre[1];
      if (resp && resp.player === opp) {
        this.add('foldVsOpen', resp.kind === 'fold');
        this.add('threeBet', resp.kind === 'raise');
      }
    }
    // opponent opened (raised first) and hero re-raised
    for (let i = 0; i + 2 < pre.length; i++) {
      if (pre[i].player === opp && pre[i].kind === 'raise' && pre[i + 1].player === hero && pre[i + 1].kind === 'raise') {
        this.add('foldTo3bet', pre[i + 2].kind === 'fold');
        break;
      }
    }

    // --- postflop
    const pfa = s.aggressor[0];
    const sawFlop = s.folded < 0 || log.some((r) => r.street > 0);
    let sawFlopDecision = false;
    for (let street = 1; street <= 3; street++) {
      const recs = log.filter((r) => r.street === street);
      if (recs.length === 0) continue;
      sawFlopDecision = true;
      let facing = false;
      let firstOppDecision = true;
      let firstBettor = -1;
      let cbetFaced = false;
      for (const r of recs) {
        if (r.player === opp) {
          if (!facing) {
            this.add('postBet', r.kind === 'raise');
            if (street === 1 && firstOppDecision && pfa === opp) this.add('cbet', r.kind === 'raise');
            if (r.kind === 'raise' && r.potBefore > 0) {
              this.betSizeSum += Math.min(3, r.added / r.potBefore);
              this.betSizeN++;
            }
          } else {
            this.add('foldToBet', r.kind === 'fold');
            this.add('raiseVsBet', r.kind === 'raise');
            if (street === 3) this.add('foldRiver', r.kind === 'fold');
            if (street === 1 && pfa === hero && firstBettor === hero && !cbetFaced) {
              this.add('foldToCbet', r.kind === 'fold');
              cbetFaced = true;
            }
          }
          firstOppDecision = false;
        }
        if (r.kind === 'raise') {
          if (firstBettor < 0) firstBettor = r.player;
          facing = r.player === hero;
        } else if (r.kind === 'call' || r.kind === 'check') {
          facing = false;
        }
      }
    }
    if (sawFlop && sawFlopDecision) this.add('wtsd', s.isShowdown);

    // --- showdown reads (opponent's cards are revealed)
    if (s.isShowdown && sawFlopDecision) {
      const [h0, h1] = s.holes(opp);
      const hs = riverHandStrength(h0, h1, s.deal.board);
      const lateAgg = log.filter((r) => r.player === opp && r.kind === 'raise' && r.street >= 2);
      if (lateAgg.length > 0) this.add('bluffShow', hs < 0.5);
      const riverCalls = log.filter((r) => r.player === opp && r.kind === 'call' && r.street === 3);
      if (riverCalls.length > 0) this.add('lightCall', hs < 0.6);
    }
  }

  /**
   * Feature vector for the exploitation network: posterior means centred on
   * the baseline (so a balanced opponent maps to ~0), plus sizing and a
   * global evidence term.
   */
  features(): number[] {
    const f: number[] = STAT_KEYS.map((k) => (this.mean(k) - this.baseline[k]) * 3);
    f.push((this.betSize() - this.baselineBetSize) * 2);
    f.push(Math.min(1, Math.log1p(this.hands) / Math.log1p(300)));
    return f;
  }
}

export const OPP_FEATURES = STAT_KEYS.length + 2;
