/**
 * Parametric "human-like" opponents.
 *
 * A Style is a handful of interpretable knobs (looseness, aggression, bluffing,
 * stickiness, sizing). Named presets model classic player types; random
 * styles (domain randomisation) give the RL exploit layer a broad training
 * population so it generalises to opponents — and humans — it has never seen.
 */
import { handClass } from './cards';
import { PREFLOP_STRENGTH } from './abstraction';
import { equityVsRandom } from './equity';
import type { Action, HUNLState } from './game';
import type { Agent, Decision } from './agents';
import type { Rng } from './rng';

export interface Style {
  id: string;
  name: string;
  /** fraction of hands played preflop */
  vpip: number;
  /** fraction of hands raised preflop */
  pfr: number;
  /** fraction of hands re-raised when facing a raise */
  threeBet: number;
  /** probability of betting/raising with value hands postflop */
  aggression: number;
  /** probability of betting/raising with weak hands postflop */
  bluff: number;
  /** 0 = folds to almost any bet, 1 = calls almost anything */
  callDown: number;
  /** preferred bet size as a fraction of the pot */
  sizing: number;
  /** equity (vs a random hand) above which a hand is treated as value */
  valueThresh: number;
  /** preflop open size in big blinds */
  openSize: number;
}

export const ARCHETYPES: Record<string, Style> = {
  station: {
    id: 'station',
    name: 'Calling Station',
    vpip: 0.85, pfr: 0.12, threeBet: 0.03, aggression: 0.3, bluff: 0.04,
    callDown: 0.92, sizing: 0.5, valueThresh: 0.8, openSize: 2.5,
  },
  maniac: {
    id: 'maniac',
    name: 'Maniac',
    vpip: 0.92, pfr: 0.8, threeBet: 0.38, aggression: 0.92, bluff: 0.55,
    callDown: 0.6, sizing: 1.1, valueThresh: 0.62, openSize: 3.5,
  },
  nit: {
    id: 'nit',
    name: 'Nit',
    vpip: 0.25, pfr: 0.18, threeBet: 0.04, aggression: 0.55, bluff: 0.04,
    callDown: 0.15, sizing: 0.6, valueThresh: 0.8, openSize: 3,
  },
  tag: {
    id: 'tag',
    name: 'TAG Regular',
    vpip: 0.5, pfr: 0.42, threeBet: 0.12, aggression: 0.72, bluff: 0.2,
    callDown: 0.42, sizing: 0.66, valueThresh: 0.7, openSize: 2.5,
  },
  lag: {
    id: 'lag',
    name: 'LAG Aggro',
    vpip: 0.75, pfr: 0.6, threeBet: 0.22, aggression: 0.8, bluff: 0.38,
    callDown: 0.5, sizing: 0.75, valueThresh: 0.66, openSize: 3,
  },
  scared: {
    id: 'scared',
    name: 'Scared Money',
    vpip: 0.55, pfr: 0.25, threeBet: 0.05, aggression: 0.45, bluff: 0.08,
    callDown: 0.08, sizing: 0.45, valueThresh: 0.78, openSize: 2,
  },
  fish: {
    id: 'fish',
    name: 'Passive Fish',
    vpip: 0.7, pfr: 0.06, threeBet: 0.02, aggression: 0.18, bluff: 0.06,
    callDown: 0.7, sizing: 0.4, valueThresh: 0.85, openSize: 2,
  },
};

export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Domain randomisation: blend two presets and add noise. */
export function randomStyle(rng: Rng): Style {
  const a = ARCHETYPES[ARCHETYPE_IDS[rng.int(ARCHETYPE_IDS.length)]];
  const b = ARCHETYPES[ARCHETYPE_IDS[rng.int(ARCHETYPE_IDS.length)]];
  const t = rng.next() < 0.5 ? rng.next() * 0.3 : rng.next();
  const mix = (x: number, y: number, sd: number, lo = 0.01, hi = 0.99) =>
    clamp(x + (y - x) * t + rng.normal() * sd, lo, hi);
  const vpip = mix(a.vpip, b.vpip, 0.06, 0.1, 0.97);
  const pfr = Math.min(vpip, mix(a.pfr, b.pfr, 0.05, 0.02, 0.9));
  return {
    id: 'random',
    name: `${a.name} × ${b.name}`,
    vpip,
    pfr,
    threeBet: Math.min(pfr, mix(a.threeBet, b.threeBet, 0.03, 0.01, 0.5)),
    aggression: mix(a.aggression, b.aggression, 0.08),
    bluff: mix(a.bluff, b.bluff, 0.05, 0, 0.7),
    callDown: mix(a.callDown, b.callDown, 0.08),
    sizing: mix(a.sizing, b.sizing, 0.1, 0.25, 1.6),
    valueThresh: mix(a.valueThresh, b.valueThresh, 0.04, 0.55, 0.9),
    openSize: mix(a.openSize, b.openSize, 0.3, 2, 4),
  };
}

export class StyleAgent implements Agent {
  readonly name: string;
  private eqCache = new Map<string, number>();

  constructor(
    public style: Style,
    private equitySamples = 120,
  ) {
    this.name = style.name;
  }

  beginHand(): void {
    this.eqCache.clear();
  }

  private strength(s: HUNLState, p: number, rng: Rng): number {
    const [h0, h1] = s.holes(p);
    if (s.street === 0) return PREFLOP_STRENGTH[handClass(h0, h1)] ?? 0.5;
    const key = `${s.street}`;
    let e = this.eqCache.get(key);
    if (e === undefined) {
      e = equityVsRandom(h0, h1, s.board, this.equitySamples, rng);
      this.eqCache.set(key, e);
    }
    return e;
  }

  act(s: HUNLState, rng: Rng): Decision {
    const p = s.toAct;
    const st = this.style;
    const x = this.strength(s, p, rng);
    const toCall = s.toCall(p);
    const facing = toCall > 0;
    const canRaise = s.minRaiseTo(p) !== null;
    const potBeforeBet = s.pot - toCall;
    const betFrac = facing ? toCall / Math.max(1, potBeforeBet) : 0;
    const potOdds = facing ? toCall / (s.pot + toCall) : 0;
    const bb = s.config.bigBlind;
    const jitter = (rng.next() - 0.5) * 0.08;

    const raiseTo = (frac: number): Action => {
      const cur = s.streetBet[1 - p];
      const potAfter = s.pot + toCall;
      const size = frac * (1 + (rng.next() - 0.5) * 0.3);
      let to = Math.round((cur + size * potAfter) / 10) * 10;
      const allIn = s.allInTo(p);
      if (to > 0.7 * allIn) to = allIn;
      return { kind: 'raise', to };
    };
    const passive: Action = facing ? { kind: 'call' } : { kind: 'check' };
    const fold: Action = facing ? { kind: 'fold' } : { kind: 'check' };

    if (s.street === 0) {
      const raises = s.raisesThisStreet;
      if (p === s.button && raises === 0) {
        // first in from the button
        if (x + jitter >= 1 - st.pfr && canRaise) {
          return { action: { kind: 'raise', to: Math.round(st.openSize * bb / 10) * 10 } };
        }
        if (x + jitter >= 1 - st.vpip) return { action: passive };
        return { action: fold };
      }
      if (raises === 0) {
        // big blind facing a limp
        if (x + jitter >= 1 - st.pfr * 0.7 && canRaise) return { action: raiseTo(0.8) };
        return { action: { kind: 'check' } };
      }
      // facing a raise: the range tightens with every raise and with size
      const sizePenalty = clamp((s.streetBet[1 - p] / bb - 3) / 30, 0, 0.6);
      const continueFrac = st.vpip * Math.pow(0.45, raises - 1) * (1 - sizePenalty) * (0.5 + st.callDown * 0.7);
      const reraiseFrac = st.threeBet * Math.pow(0.4, raises - 1);
      if (canRaise && x + jitter >= 1 - reraiseFrac) {
        const deep = raises >= 3 || s.streetBet[1 - p] > s.config.startingStack * 0.25;
        return { action: deep ? { kind: 'raise', to: s.allInTo(p) } : raiseTo(0.9) };
      }
      if (canRaise && x < 0.5 && rng.next() < st.bluff * 0.12 * Math.pow(0.4, raises - 1)) return { action: raiseTo(0.9) };
      if (x + jitter >= 1 - continueFrac || toCall <= bb * 0.5) return { action: { kind: 'call' } };
      return { action: { kind: 'fold' } };
    }

    // ---- postflop
    const value = x >= st.valueThresh;
    const medium = !value && x >= 0.5;
    if (!facing) {
      const pBet = value ? st.aggression : medium ? st.aggression * 0.35 : st.bluff;
      if (canRaise && rng.next() < pBet) return { action: raiseTo(st.sizing) };
      return { action: { kind: 'check' } };
    }
    const tight = 1 - st.callDown;
    const req = clamp(potOdds * (0.5 + tight) + tight * (0.12 + 0.3 * betFrac) + jitter, 0.02, 0.97);
    if (canRaise && x >= Math.max(st.valueThresh + 0.08, 0.78) && rng.next() < st.aggression * 0.55) {
      return { action: raiseTo(Math.max(0.8, st.sizing)) };
    }
    if (canRaise && x < 0.4 && rng.next() < st.bluff * 0.2) return { action: raiseTo(Math.max(0.8, st.sizing)) };
    if (x >= req) return { action: { kind: 'call' } };
    return { action: { kind: 'fold' } };
  }
}
