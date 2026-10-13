/**
 * Agents: the blueprint (GTO) bot and the RL exploitation bot.
 *
 * The exploit bot's policy is the blueprint re-weighted by a learned,
 * opponent-conditioned "tilt" over four action groups:
 *
 *     P(group g) ∝ (Q_g + ε·λ·m_g) · exp(λ · Δ_g(x))
 *
 * where Q_g is the blueprint's probability mass on group g, Δ(x) = 3·tanh(MLP(x))
 * is produced by the policy network from (state features, opponent-model
 * features), and λ ∈ [0,1] is the exploitation gate. Within a group, actions
 * keep their blueprint proportions. At λ = 0 the bot is exactly the blueprint,
 * so exploitation is a bounded, interpretable deviation from equilibrium.
 */
import {
  type AbstractAction,
  type BucketSampling,
  type Code,
  PLAY_SAMPLING,
  translateAction,
} from './abstraction';
import type { Blueprint, StrategyLookup } from './blueprint';
import type { Action, HUNLState } from './game';
import { MLP, type MLPJSON } from './nn';
import { OPP_FEATURES, OpponentModel, STAT_KEYS, type StatKey } from './opponentModel';
import type { Rng } from './rng';

export interface Decision {
  action: Action;
  /** abstract code if the agent acted inside the abstraction */
  code?: Code;
  info?: DecisionInfo;
}

export interface Agent {
  readonly name: string;
  act(s: HUNLState, rng: Rng): Decision;
  beginHand?(s: HUNLState, seat: number): void;
  endHand?(s: HUNLState, seat: number): void;
}

/** Apply a decision to the state, translating off-tree actions into codes. */
export function applyDecision(s: HUNLState, d: Decision, rng: Rng): Code {
  const code = d.code ?? translateAction(s, d.action, rng);
  s.apply(d.action, code);
  return code;
}

// ------------------------------------------------------------------ groups

export const GROUPS = ['Fold', 'Check/Call', 'Small bet', 'Big bet'] as const;
export const NUM_GROUPS = 4;

export function groupOf(code: Code): number {
  switch (code) {
    case 'f':
      return 0;
    case 'k':
    case 'c':
      return 1;
    case 't':
    case 'h':
      return 2;
    default:
      return 3;
  }
}

// ---------------------------------------------------------------- features

export const STATE_FEATURES = 18;
export const ACTOR_INPUTS = STATE_FEATURES + OPP_FEATURES;

export const FEATURE_NAMES: string[] = [
  'street:preflop', 'street:flop', 'street:turn', 'street:river',
  'in position', 'hand strength', 'polarity', 'facing bet', 'pot odds', 'bet size',
  'stack/pot', 'raises', 'had initiative', 'opp had initiative',
  'gto:fold', 'gto:call', 'gto:small', 'gto:big',
  ...STAT_KEYS.map((k) => `opp:${k}`),
  'opp:betSize', 'evidence',
];

export function groupMasses(lookup: StrategyLookup): { Q: number[]; m: number[] } {
  const Q = [0, 0, 0, 0];
  const m = [0, 0, 0, 0];
  lookup.codes.forEach((c, i) => {
    const g = groupOf(c);
    Q[g] += lookup.probs[i];
    m[g]++;
  });
  return { Q, m };
}

export function stateFeatures(s: HUNLState, p: number, strength: number, Q: number[]): number[] {
  const toCall = s.toCall(p);
  const potBefore = s.pot - toCall;
  const eff = Math.min(s.stacks[0] + s.streetBet[0], s.stacks[1] + s.streetBet[1]);
  const prevAgg = s.street > 0 ? s.aggressor[s.street - 1] : -1;
  return [
    s.street === 0 ? 1 : 0,
    s.street === 1 ? 1 : 0,
    s.street === 2 ? 1 : 0,
    s.street === 3 ? 1 : 0,
    s.isInPosition(p) ? 1 : 0,
    strength * 2 - 1,
    (strength - 0.5) ** 2 * 4,
    toCall > 0 ? 1 : 0,
    toCall > 0 ? toCall / (s.pot + toCall) : 0,
    Math.min(3, toCall / Math.max(1, potBefore)),
    Math.log1p(eff / s.pot) / Math.log(101),
    s.raisesThisStreet / 3,
    prevAgg === p ? 1 : 0,
    prevAgg === 1 - p ? 1 : 0,
    Q[0],
    Q[1],
    Q[2],
    Q[3],
  ];
}

// ------------------------------------------------------------- the policy

export interface DecisionInfo {
  street: number;
  key: string;
  bucket: number;
  strength: number;
  found: boolean;
  codes: Code[];
  actions: AbstractAction[];
  blueprint: number[];
  final: number[];
  delta: number[];
  lambda: number;
  chosen: number;
  groupBlueprint: number[];
  groupFinal: number[];
  input: number[];
}

export interface ExploitPolicyResult {
  probs: number[];
  groupP: number[];
  delta: number[];
  /** smoothed group masses used for the policy (needed for PPO ratios) */
  base: number[];
}

export const SMOOTHING = 0.02;
export const DELTA_SCALE = 3;

/** Combine blueprint probabilities with group deltas. */
export function tiltPolicy(lookup: StrategyLookup, delta: number[], lambda: number): ExploitPolicyResult {
  const { Q, m } = groupMasses(lookup);
  const base = Q.map((q, g) => (m[g] ? q + SMOOTHING * lambda * m[g] : 0));
  const w = base.map((b, g) => (b > 0 ? b * Math.exp(lambda * delta[g]) : 0));
  const Z = w.reduce((a, b) => a + b, 0);
  const groupP = w.map((x) => x / Z);
  const probs = lookup.codes.map((c, i) => {
    const g = groupOf(c);
    if (groupP[g] === 0) return 0;
    const within = Q[g] > 1e-9 ? lookup.probs[i] / Q[g] : 1 / m[g];
    // mix within-group blueprint proportions with uniform for the smoothing mass
    const qShare = base[g] > 0 ? Q[g] / base[g] : 0;
    const share = qShare * within + (1 - qShare) * (1 / m[g]);
    return groupP[g] * share;
  });
  return { probs, groupP, delta, base };
}

export interface AIAgentOptions {
  name?: string;
  sampling?: BucketSampling;
  /** exploitation gate in [0, 1]; 0 = pure blueprint */
  lambda?: number;
  /** scale the gate by the bot's running profit (safe exploitation) */
  riskBudget?: boolean;
}

/**
 * The poker AI. With no actor network (or lambda = 0) it plays the CFR
 * blueprint; with an actor it exploits the opponent it is modelling.
 */
export class AIAgent implements Agent {
  readonly name: string;
  model: OpponentModel;
  actor: MLP | null;
  lambda: number;
  riskBudget: boolean;
  sampling: BucketSampling;
  /** running profit in big blinds (for the risk budget) */
  profitBB = 0;
  lastInfo: DecisionInfo | null = null;
  private buckets = new Map<number, number>();

  constructor(
    public blueprint: Blueprint,
    actor: MLP | null = null,
    opts: AIAgentOptions = {},
    model?: OpponentModel,
  ) {
    this.actor = actor;
    this.lambda = opts.lambda ?? (actor ? 1 : 0);
    this.riskBudget = opts.riskBudget ?? false;
    this.sampling = opts.sampling ?? PLAY_SAMPLING;
    this.name = opts.name ?? (actor ? 'Exploit AI' : 'GTO Blueprint');
    this.model = model ?? new OpponentModel();
  }

  beginHand(): void {
    this.buckets.clear();
  }

  endHand(s: HUNLState, seat: number): void {
    this.model.observeHand(s, seat);
    this.profitBB += s.payoffs()[seat] / s.config.bigBlind;
  }

  resetModel(): void {
    this.model.reset();
    this.profitBB = 0;
  }

  /** Effective exploitation gate after the optional risk budget. */
  effectiveLambda(): number {
    if (!this.actor) return 0;
    if (!this.riskBudget) return this.lambda;
    // Only risk (roughly) what has been won: start at 35% and scale with profit.
    const g = Math.max(0.15, Math.min(1, 0.35 + this.profitBB / 40));
    return this.lambda * g;
  }

  bucketFor(s: HUNLState, p: number, rng: Rng): number {
    let b = this.buckets.get(s.street);
    if (b === undefined) {
      const [h0, h1] = s.holes(p);
      b = this.blueprint.abstraction.bucket(s.street, h0, h1, s.board, this.sampling, rng);
      this.buckets.set(s.street, b);
    }
    return b;
  }

  /** Network input for the current decision. */
  actorInput(s: HUNLState, p: number, strength: number, lookup: StrategyLookup): number[] {
    const { Q } = groupMasses(lookup);
    return [...stateFeatures(s, p, strength, Q), ...this.model.features()];
  }

  computeDelta(input: number[]): number[] {
    if (!this.actor) return [0, 0, 0, 0];
    const out = this.actor.forward(input);
    return Array.from(out, (z) => DELTA_SCALE * Math.tanh(z));
  }

  /**
   * Gradient-times-input attribution of each opponent feature to each group
   * delta, relative to a perfectly balanced opponent (features = 0).
   */
  attributions(input: number[]): Array<{ feature: string; value: number; contrib: number[] }> {
    if (!this.actor) return [];
    const out = Array.from(this.actor.forward(input));
    const res = STAT_KEYS.map((k, i) => ({ feature: k as string, value: input[STATE_FEATURES + i], contrib: [0, 0, 0, 0] }));
    res.push({ feature: 'betSize', value: input[STATE_FEATURES + STAT_KEYS.length], contrib: [0, 0, 0, 0] });
    for (let g = 0; g < NUM_GROUPS; g++) {
      const gOut = [0, 0, 0, 0];
      // d(3 tanh z)/dz
      gOut[g] = DELTA_SCALE * (1 - Math.tanh(out[g]) ** 2);
      const gIn = this.actor.backward(gOut);
      for (let i = 0; i < res.length; i++) res[i].contrib[g] = gIn[STATE_FEATURES + i] * input[STATE_FEATURES + i];
    }
    this.actor.zeroGrad();
    return res;
  }

  /** Full policy at the current decision (no sampling). */
  policy(s: HUNLState, rng: Rng): { lookup: StrategyLookup; bucket: number; strength: number; input: number[]; result: ExploitPolicyResult; lambda: number } {
    const p = s.toAct;
    const bucket = this.bucketFor(s, p, rng);
    const lookup = this.blueprint.lookup(s, bucket);
    const strength = this.blueprint.abstraction.percentile(s.street, bucket);
    const input = this.actorInput(s, p, strength, lookup);
    const lambda = this.effectiveLambda();
    const delta = lambda > 0 ? this.computeDelta(input) : [0, 0, 0, 0];
    const result = lambda > 0 ? tiltPolicy(lookup, delta, lambda) : { probs: lookup.probs, groupP: groupMasses(lookup).Q, delta, base: groupMasses(lookup).Q };
    return { lookup, bucket, strength, input, result, lambda };
  }

  act(s: HUNLState, rng: Rng): Decision {
    const { lookup, bucket, strength, input, result, lambda } = this.policy(s, rng);
    const i = rng.choice(result.probs);
    const info: DecisionInfo = {
      street: s.street,
      key: lookup.key,
      bucket,
      strength,
      found: lookup.found,
      codes: lookup.codes,
      actions: lookup.actions,
      blueprint: lookup.probs,
      final: result.probs,
      delta: result.delta,
      lambda,
      chosen: i,
      groupBlueprint: groupMasses(lookup).Q,
      groupFinal: result.groupP,
      input,
    };
    this.lastInfo = info;
    return { action: lookup.actions[i].action, code: lookup.codes[i], info };
  }
}

// ------------------------------------------------------------- model file

export interface ArchetypeSignature {
  id: string;
  name: string;
  stats: Record<StatKey, number>;
  betSize: number;
}

export interface EvalRow {
  opponent: string;
  gto: number;
  gtoCI: number;
  exploit: number;
  exploitCI: number;
  hands: number;
}

export interface ExploitModelFile {
  version: number;
  actor: MLPJSON;
  baseline: Record<StatKey, number>;
  baselineBetSize: number;
  signatures: ArchetypeSignature[];
  trainingLog: Array<{ step: number; hands: number; meanReward: number; gtoBaseline?: number; kl: number; deltaMag: number; valueLoss: number }>;
  evaluation: EvalRow[];
  meta: { trainedAt: string; hands: number; seconds: number };
}

export function loadActor(file: ExploitModelFile): MLP {
  return MLP.fromJSON(file.actor);
}
