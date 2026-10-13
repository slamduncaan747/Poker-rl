import { type Card, evaluate } from '@poker-rl/engine';

/** The five cards (from hole + board) that make the best hand. */
export function bestFive(hole: readonly Card[], board: readonly Card[]): Card[] {
  const all = [...hole, ...board];
  if (all.length < 5) return [];
  let best = -1;
  let bestSet: Card[] = [];
  const n = all.length;
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === 5) {
      const v = evaluate(pick, 5);
      if (v > best) {
        best = v;
        bestSet = pick.slice();
      }
      return;
    }
    for (let i = start; i < n; i++) {
      pick.push(all[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return bestSet;
}
