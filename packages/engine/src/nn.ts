/**
 * A tiny dependency-free MLP with manual backprop and Adam — enough for the
 * exploitation policy/value networks, and it runs unchanged in the browser.
 */
import type { Rng } from './rng';

export type Activation = 'relu' | 'tanh' | 'linear';

export interface LayerJSON {
  w: number[];
  b: number[];
  in: number;
  out: number;
  act: Activation;
}

export interface MLPJSON {
  layers: LayerJSON[];
}

class Layer {
  w: Float32Array;
  b: Float32Array;
  gw: Float32Array;
  gb: Float32Array;
  // Adam moments
  mw: Float32Array;
  vw: Float32Array;
  mb: Float32Array;
  vb: Float32Array;

  constructor(
    readonly nIn: number,
    readonly nOut: number,
    readonly act: Activation,
    rng?: Rng,
  ) {
    this.w = new Float32Array(nIn * nOut);
    this.b = new Float32Array(nOut);
    if (rng) {
      // He / Xavier init
      const scale = act === 'relu' ? Math.sqrt(2 / nIn) : Math.sqrt(1 / nIn);
      for (let i = 0; i < this.w.length; i++) this.w[i] = rng.normal() * scale;
    }
    this.gw = new Float32Array(this.w.length);
    this.gb = new Float32Array(nOut);
    this.mw = new Float32Array(this.w.length);
    this.vw = new Float32Array(this.w.length);
    this.mb = new Float32Array(nOut);
    this.vb = new Float32Array(nOut);
  }

  forward(x: Float32Array, out: Float32Array): void {
    const { nIn, nOut, w, b } = this;
    for (let o = 0; o < nOut; o++) {
      let s = b[o];
      const row = o * nIn;
      for (let i = 0; i < nIn; i++) s += w[row + i] * x[i];
      out[o] = this.act === 'relu' ? (s > 0 ? s : 0) : this.act === 'tanh' ? Math.tanh(s) : s;
    }
  }

  /** Given dL/d(out) and the activations, accumulate grads and return dL/d(in). */
  backward(x: Float32Array, out: Float32Array, gOut: Float32Array, gIn: Float32Array | null): void {
    const { nIn, nOut, w } = this;
    if (gIn) gIn.fill(0);
    for (let o = 0; o < nOut; o++) {
      let g = gOut[o];
      if (this.act === 'relu') g = out[o] > 0 ? g : 0;
      else if (this.act === 'tanh') g = g * (1 - out[o] * out[o]);
      if (g === 0) continue;
      this.gb[o] += g;
      const row = o * nIn;
      for (let i = 0; i < nIn; i++) {
        this.gw[row + i] += g * x[i];
        if (gIn) gIn[i] += g * w[row + i];
      }
    }
  }
}

export class MLP {
  layers: Layer[];
  private acts: Float32Array[];
  private grads: Float32Array[];
  private step = 0;

  constructor(sizes: number[], hidden: Activation = 'relu', output: Activation = 'linear', rng?: Rng) {
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push(new Layer(sizes[i], sizes[i + 1], i === sizes.length - 2 ? output : hidden, rng));
    }
    this.acts = sizes.map((n) => new Float32Array(n));
    this.grads = sizes.map((n) => new Float32Array(n));
  }

  get inputSize(): number {
    return this.layers[0].nIn;
  }

  get outputSize(): number {
    return this.layers[this.layers.length - 1].nOut;
  }

  /** Forward pass; returns a view of the internal output buffer (copy if you keep it). */
  forward(x: ArrayLike<number>): Float32Array {
    this.acts[0].set(x);
    for (let l = 0; l < this.layers.length; l++) this.layers[l].forward(this.acts[l], this.acts[l + 1]);
    return this.acts[this.acts.length - 1];
  }

  /** Backprop dL/d(output) for the *most recent* forward pass; returns dL/d(input). */
  backward(gOut: ArrayLike<number>): Float32Array {
    const L = this.layers.length;
    this.grads[L].set(gOut);
    for (let l = L - 1; l >= 0; l--) {
      this.layers[l].backward(this.acts[l], this.acts[l + 1], this.grads[l + 1], this.grads[l]);
    }
    return this.grads[0];
  }

  zeroGrad(): void {
    for (const l of this.layers) {
      l.gw.fill(0);
      l.gb.fill(0);
    }
  }

  /** Adam update using accumulated gradients scaled by 1/batch. */
  adam(lr: number, batch: number, clip = 1.0, beta1 = 0.9, beta2 = 0.999, eps = 1e-8): void {
    this.step++;
    // global-norm gradient clipping
    let norm = 0;
    for (const l of this.layers) {
      for (let i = 0; i < l.gw.length; i++) norm += (l.gw[i] / batch) ** 2;
      for (let i = 0; i < l.gb.length; i++) norm += (l.gb[i] / batch) ** 2;
    }
    norm = Math.sqrt(norm);
    const scale = (norm > clip ? clip / norm : 1) / batch;
    const bc1 = 1 - beta1 ** this.step;
    const bc2 = 1 - beta2 ** this.step;
    const upd = (p: Float32Array, g: Float32Array, m: Float32Array, v: Float32Array) => {
      for (let i = 0; i < p.length; i++) {
        const gi = g[i] * scale;
        m[i] = beta1 * m[i] + (1 - beta1) * gi;
        v[i] = beta2 * v[i] + (1 - beta2) * gi * gi;
        p[i] -= (lr * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + eps);
      }
    };
    for (const l of this.layers) {
      upd(l.w, l.gw, l.mw, l.vw);
      upd(l.b, l.gb, l.mb, l.vb);
    }
  }

  toJSON(): MLPJSON {
    const r = (x: number) => Math.round(x * 1e5) / 1e5;
    return {
      layers: this.layers.map((l) => ({
        w: Array.from(l.w, r),
        b: Array.from(l.b, r),
        in: l.nIn,
        out: l.nOut,
        act: l.act,
      })),
    };
  }

  static fromJSON(j: MLPJSON): MLP {
    const sizes = [j.layers[0].in, ...j.layers.map((l) => l.out)];
    const net = new MLP(sizes);
    j.layers.forEach((lj, i) => {
      const l = net.layers[i];
      (l as { act: Activation }).act = lj.act;
      l.w.set(lj.w);
      l.b.set(lj.b);
    });
    return net;
  }

  copyFrom(other: MLP): void {
    this.layers.forEach((l, i) => {
      l.w.set(other.layers[i].w);
      l.b.set(other.layers[i].b);
    });
  }
}
