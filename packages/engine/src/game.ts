/**
 * Heads-up No-Limit Texas Hold'em state machine.
 *
 * Chip-accurate (blinds, min-raise rule, all-ins, uncalled-bet refunds, split
 * pots). The same class is used by the CFR trainer, the RL trainer, the arena
 * simulator and the interactive UI, so there is exactly one source of truth for
 * the rules.
 *
 * Seats are 0 and 1. `button` posts the small blind, acts first preflop and
 * last on every later street.
 */
import { type Card, cardToString, deckWithout, shuffle } from './cards';
import { evaluate2 } from './evaluator';
import type { Rng } from './rng';

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  smallBlind: 50,
  bigBlind: 100,
  startingStack: 10_000,
};

export type Street = 0 | 1 | 2 | 3;
export const STREET_NAMES = ['Preflop', 'Flop', 'Turn', 'River'] as const;

export type ActionKind = 'fold' | 'check' | 'call' | 'raise';

/** A concrete action. For `raise` (which also covers opening bets) `to` is the
 * player's total commitment on this street after the action. */
export interface Action {
  kind: ActionKind;
  to?: number;
}

export interface ActionRecord {
  player: number;
  street: Street;
  kind: ActionKind;
  /** chips added to the pot by this action */
  added: number;
  /** street commitment after the action */
  to: number;
  /** pot (all chips committed, both players) before the action */
  potBefore: number;
  allIn: boolean;
  /** abstract action code used for infoset keys */
  code: string;
}

export interface Deal {
  holes: [[Card, Card], [Card, Card]];
  board: Card[]; // all five board cards, revealed street by street
}

export function randomDeal(rng: Rng): Deal {
  const d = shuffle(deckWithout([]), rng);
  return {
    holes: [
      [d[0], d[1]],
      [d[2], d[3]],
    ],
    board: [d[4], d[5], d[6], d[7], d[8]],
  };
}

/** Swap the hole cards (used by duplicate evaluation). */
export function mirrorDeal(deal: Deal): Deal {
  return { holes: [deal.holes[1], deal.holes[0]], board: deal.board };
}

const BOARD_COUNT = [0, 3, 4, 5];

export class HUNLState {
  config: GameConfig;
  deal: Deal;
  button: number;
  street: Street = 0;
  stacks: [number, number];
  streetBet: [number, number] = [0, 0];
  invested: [number, number] = [0, 0];
  toAct: number;
  /** size of the last bet/raise increment on this street (for the min-raise rule) */
  lastRaiseInc: number;
  /** voluntary bets/raises on this street (blinds don't count) */
  raisesThisStreet = 0;
  acted: [boolean, boolean] = [false, false];
  folded = -1;
  terminal = false;
  /** abstract action codes per street, e.g. ["pc", "kh c", ...] */
  streetCodes: string[] = ['', '', '', ''];
  /** last aggressor on each street (-1 = none) */
  aggressor: number[] = [-1, -1, -1, -1];
  /** pot at the start of each street */
  streetStartPot: number[] = [0, 0, 0, 0];
  log: ActionRecord[] = [];
  /** disable the action log for hot loops (CFR / RL rollouts) */
  keepLog = true;

  constructor(deal: Deal, button: number, config: GameConfig = DEFAULT_CONFIG, stacks?: [number, number]) {
    this.config = config;
    this.deal = deal;
    this.button = button;
    this.stacks = stacks ? [stacks[0], stacks[1]] : [config.startingStack, config.startingStack];
    const sb = button;
    const bb = 1 - button;
    this.post(sb, Math.min(config.smallBlind, this.stacks[sb]));
    this.post(bb, Math.min(config.bigBlind, this.stacks[bb]));
    this.lastRaiseInc = config.bigBlind;
    this.toAct = sb;
    // degenerate short-stack case: someone is all-in from the blinds
    if (this.stacks[sb] === 0 && this.streetBet[sb] <= this.streetBet[bb]) this.runOut();
    else if (this.stacks[bb] === 0 && this.streetBet[sb] >= this.streetBet[bb]) this.runOut();
  }

  private post(p: number, amt: number) {
    this.stacks[p] -= amt;
    this.streetBet[p] += amt;
    this.invested[p] += amt;
  }

  clone(): HUNLState {
    const s = Object.create(HUNLState.prototype) as HUNLState;
    s.config = this.config;
    s.deal = this.deal;
    s.button = this.button;
    s.street = this.street;
    s.stacks = [this.stacks[0], this.stacks[1]];
    s.streetBet = [this.streetBet[0], this.streetBet[1]];
    s.invested = [this.invested[0], this.invested[1]];
    s.toAct = this.toAct;
    s.lastRaiseInc = this.lastRaiseInc;
    s.raisesThisStreet = this.raisesThisStreet;
    s.acted = [this.acted[0], this.acted[1]];
    s.folded = this.folded;
    s.terminal = this.terminal;
    s.streetCodes = this.streetCodes.slice();
    s.aggressor = this.aggressor.slice();
    s.streetStartPot = this.streetStartPot.slice();
    s.keepLog = this.keepLog;
    s.log = this.keepLog ? this.log.slice() : this.log;
    return s;
  }

  // ---------------------------------------------------------------- queries

  get pot(): number {
    return this.invested[0] + this.invested[1];
  }

  get board(): Card[] {
    return this.deal.board.slice(0, BOARD_COUNT[this.street]);
  }

  boardCount(): number {
    return BOARD_COUNT[this.street];
  }

  holes(p: number): [Card, Card] {
    return this.deal.holes[p];
  }

  isInPosition(p: number): boolean {
    return p === this.button ? this.street > 0 : this.street === 0;
  }

  toCall(p: number = this.toAct): number {
    return Math.max(0, Math.min(this.streetBet[1 - p] - this.streetBet[p], this.stacks[p]));
  }

  /** Largest total street commitment `p` can reach (all-in). */
  allInTo(p: number = this.toAct): number {
    return this.streetBet[p] + this.stacks[p];
  }

  /** Smallest legal raise-to amount, or null if raising is not possible. */
  minRaiseTo(p: number = this.toAct): number | null {
    const opp = 1 - p;
    if (this.stacks[opp] === 0) return null; // nobody to raise against
    const cur = this.streetBet[opp];
    const allIn = this.allInTo(p);
    if (allIn <= cur) return null; // can only call (possibly all-in)
    const min = cur + Math.max(this.lastRaiseInc, this.config.bigBlind);
    return Math.min(min, allIn);
  }

  legalKinds(p: number = this.toAct): ActionKind[] {
    if (this.terminal) return [];
    const kinds: ActionKind[] = [];
    const facing = this.streetBet[1 - p] > this.streetBet[p];
    if (facing) kinds.push('fold', 'call');
    else kinds.push('check');
    if (this.minRaiseTo(p) !== null) kinds.push('raise');
    return kinds;
  }

  // -------------------------------------------------------------- transitions

  /** Apply a concrete action. `code` is the abstract label recorded in history. */
  apply(action: Action, code?: string): void {
    if (this.terminal) throw new Error('Hand is over');
    const p = this.toAct;
    const opp = 1 - p;
    const potBefore = this.pot;
    const facing = this.streetBet[opp] > this.streetBet[p];
    let added = 0;
    let kind = action.kind;
    if (kind === 'check' && facing) throw new Error('Cannot check facing a bet');
    if ((kind === 'call' || kind === 'fold') && !facing) {
      if (kind === 'fold') throw new Error('Cannot fold when not facing a bet');
      kind = 'check';
    }

    if (kind === 'fold') {
      this.folded = p;
      this.terminal = true;
      this.record(p, kind, 0, potBefore, code ?? 'f');
      return;
    }

    if (kind === 'check') {
      this.acted[p] = true;
      this.record(p, kind, 0, potBefore, code ?? 'k');
    } else if (kind === 'call') {
      added = this.toCall(p);
      this.post(p, added);
      this.acted[p] = true;
      this.record(p, kind, added, potBefore, code ?? 'c');
    } else {
      const min = this.minRaiseTo(p);
      if (min === null) throw new Error('Raise not allowed');
      const allIn = this.allInTo(p);
      let to = Math.round(action.to ?? min);
      to = Math.max(min, Math.min(to, allIn));
      const inc = to - this.streetBet[opp];
      if (inc >= this.lastRaiseInc) this.lastRaiseInc = inc; // short all-ins don't reopen sizing
      added = to - this.streetBet[p];
      this.post(p, added);
      this.raisesThisStreet++;
      this.aggressor[this.street] = p;
      this.acted[p] = true;
      this.acted[opp] = false;
      this.record(p, 'raise', added, potBefore, code ?? 'r');
    }

    this.advance();
  }

  private record(p: number, kind: ActionKind, added: number, potBefore: number, code: string) {
    this.streetCodes[this.street] += code;
    if (!this.keepLog) return;
    this.log.push({
      player: p,
      street: this.street,
      kind,
      added,
      to: this.streetBet[p],
      potBefore,
      allIn: this.stacks[p] === 0 && kind !== 'fold' && kind !== 'check',
      code,
    });
  }

  private advance() {
    const p = this.toAct;
    const opp = 1 - p;
    const matched = this.streetBet[0] === this.streetBet[1];
    const someoneAllIn = this.stacks[0] === 0 || this.stacks[1] === 0;

    // A call (or check) that closes the action
    const closed =
      (this.acted[0] && this.acted[1] && matched) ||
      // calling an all-in for less
      (this.acted[p] && someoneAllIn && this.streetBet[p] <= this.streetBet[opp] && this.stacks[p] === 0) ||
      (this.acted[p] && this.stacks[opp] === 0 && this.streetBet[p] >= this.streetBet[opp]);

    if (!closed) {
      this.toAct = opp;
      return;
    }
    if (someoneAllIn || this.street === 3) {
      this.runOut();
      return;
    }
    this.nextStreet();
  }

  private nextStreet() {
    this.street = (this.street + 1) as Street;
    this.streetBet = [0, 0];
    this.acted = [false, false];
    this.lastRaiseInc = this.config.bigBlind;
    this.raisesThisStreet = 0;
    this.toAct = 1 - this.button;
    this.streetStartPot[this.street] = this.pot;
  }

  private runOut() {
    this.street = 3;
    this.terminal = true;
  }

  /** True once all decisions are done and the hand goes to showdown. */
  get isShowdown(): boolean {
    return this.terminal && this.folded < 0;
  }

  // ----------------------------------------------------------------- payoffs

  /** Hand values at showdown (only meaningful when isShowdown). */
  showdownValues(): [number, number] {
    const b = this.deal.board;
    return [
      evaluate2(this.deal.holes[0][0], this.deal.holes[0][1], b, 5),
      evaluate2(this.deal.holes[1][0], this.deal.holes[1][1], b, 5),
    ];
  }

  /**
   * Net chips won by each player (zero-sum). Uncalled excess bets are refunded.
   */
  payoffs(): [number, number] {
    if (!this.terminal) throw new Error('Hand not finished');
    const matched = Math.min(this.invested[0], this.invested[1]);
    if (this.folded >= 0) {
      const w = 1 - this.folded;
      // winner wins what the folder put in
      const won = this.invested[this.folded];
      return w === 0 ? [won, -won] : [-won, won];
    }
    const [v0, v1] = this.showdownValues();
    if (v0 === v1) return [0, 0];
    return v0 > v1 ? [matched, -matched] : [-matched, matched];
  }

  winner(): number {
    if (this.folded >= 0) return 1 - this.folded;
    const [v0, v1] = this.showdownValues();
    return v0 === v1 ? -1 : v0 > v1 ? 0 : 1;
  }

  describe(): string {
    const parts = [`[${STREET_NAMES[this.street]}] pot=${this.pot}`];
    parts.push(`board=${this.board.map(cardToString).join('')}`);
    parts.push(`stacks=${this.stacks.join('/')}`);
    parts.push(`bets=${this.streetBet.join('/')}`);
    parts.push(`toAct=${this.toAct}`);
    return parts.join(' ');
  }
}
