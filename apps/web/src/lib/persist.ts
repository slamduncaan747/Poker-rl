import type { Grade, OpponentModel, StatKey } from '@poker-rl/engine';
import type { HandSummary } from './store';

/**
 * Everything that carries over between visits: both stacks, the rebuy
 * record, recent hands, every decision grade, and Otto's read on you.
 * Stored in localStorage; any failure (private mode, quota) just means the
 * game starts fresh.
 */
export interface SavedGame {
  version: 1;
  stacks: [number, number];
  handNo: number;
  /** times each player went broke and bought back in, [you, Otto] */
  rebuys: [number, number];
  history: HandSummary[];
  grades: Grade[];
  model: { hands: number; counters: Record<StatKey, { hits: number; opps: number }>; betSizeSum: number; betSizeN: number };
  profitBB: number;
}

const KEY = 'otto.game.v1';
/** Hands kept in full; older ones still count in the totals and in Otto's read. */
export const KEEP_HANDS = 200;

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as SavedGame;
    return g.version === 1 && Array.isArray(g.stacks) ? g : null;
  } catch {
    return null;
  }
}

export function saveGame(g: SavedGame) {
  const write = (v: SavedGame) => localStorage.setItem(KEY, JSON.stringify(v));
  try {
    write({ ...g, history: g.history.slice(-KEEP_HANDS) });
  } catch {
    // most likely the storage quota: keep fewer hands and try once more
    try {
      write({ ...g, history: g.history.slice(-40) });
    } catch {
      /* storage unavailable */
    }
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function snapshotModel(m: OpponentModel): SavedGame['model'] {
  return { hands: m.hands, counters: JSON.parse(JSON.stringify(m.counters)), betSizeSum: m.betSizeSum, betSizeN: m.betSizeN };
}

export function restoreModel(m: OpponentModel, s: SavedGame['model']) {
  m.hands = s.hands;
  for (const k of Object.keys(m.counters) as StatKey[]) if (s.counters[k]) m.counters[k] = { ...s.counters[k] };
  m.betSizeSum = s.betSizeSum;
  m.betSizeN = s.betSizeN;
}
