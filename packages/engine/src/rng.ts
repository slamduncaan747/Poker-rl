/**
 * Small, fast, seedable PRNG (mulberry32). Every stochastic component of the
 * engine takes an `Rng` so training runs and evaluations are reproducible.
 */
export class Rng {
  private s: number;

  constructor(seed: number = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return (this.next() * n) | 0;
  }

  /** Standard normal via Box-Muller. */
  normal(): number {
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Sample an index from a (not necessarily normalised) probability vector. */
  choice(probs: ArrayLike<number>): number {
    let total = 0;
    for (let i = 0; i < probs.length; i++) total += probs[i];
    let r = this.next() * total;
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r < 0) return i;
    }
    return probs.length - 1;
  }

  fork(): Rng {
    return new Rng((this.next() * 2 ** 32) >>> 0);
  }
}
