<div align="center">

# ♠ Poker RL

**A heads-up no-limit hold'em AI that plays game-theory-optimal poker — then learns to exploit *you*.**

A Monte Carlo CFR equilibrium blueprint, a Bayesian opponent model, and a PPO-trained policy network that tilts the blueprint toward the plays that punish an opponent's leaks — all running live in the browser with an explainable "X-Ray" of every decision.

`TypeScript` · `React 19` · `Vite` · `Tailwind v4` · `Framer Motion` · `Web Workers` · `Node worker_threads` · `Vitest`

</div>

![Play](docs/screenshots/play.png)

**[▶ Play the live demo](https://slamduncaan747.github.io/Poker-rl/)** · or run it locally with `npm install && npm run dev`

---

## Highlights

| | |
|---|---|
| **GTO layer** | External-sampling **MCCFR** with linear-CFR discounting and regret-based pruning, trained in parallel on worker threads and merged by reach-weighted strategy sums. |
| **Abstraction** | 169 lossless preflop classes · 32 **E[HS²]** percentile buckets per postflop street · ⅓ / ½ / pot / all-in bets · imperfect-recall history keyed on SPR + initiative · **pseudo-harmonic** translation of off-tree human bets. |
| **Opponent model** | 16 **Beta-Bernoulli posteriors** (VPIP, 3-bet, c-bet, fold-to-c-bet, river folds, showdown bluff rate…) with priors centred on the blueprint's own frequencies, plus Bayesian archetype classification. |
| **Exploit layer** | A policy MLP outputs a bounded tilt Δ over four action groups; the final policy is `σ ∝ σ_GTO · exp(λΔ)`. Trained with **PPO**, an **asymmetric (privileged-information) critic**, **domain-randomised** opponent populations, and an L2 trust region to the blueprint. |
| **Safety** | λ = 0 is exactly GTO; with no evidence the opponent features are exactly zero; optional profit-based **risk budget** (safe exploitation). |
| **Explainability** | Gradient × input attribution turns every deviation into "*More big bets: 9% → 26% because you fold to bets 64% (GTO 41%)*". |
| **Player cloning** | Fits a playable clone of a human from the opponent model's posteriors and stress-tests it against both bots to measure how exploitable their style is. |
| **Evaluation** | **Duplicate** matches (seat-swapped replays of identical deals) with 95% CIs. |

## The demo

- **Play** — heads-up against **Otto**, the AI, at $1/$2 with $200 stacks. Cards are dealt from the deck and turn over, bets slide into the pot, and the pot goes to the winner. Hover Otto to see why it made its last play; its hand unlocks when the hand ends. When the hand is over, each of your decisions gets a chess-style mark — **Brilliant**, **Best**, **Good**, **Inaccuracy**, **Mistake** or **Blunder** — and hovering one shows what the solver plays.
- **Your style** — where you sit on a loose/tight × passive/aggressive map, the player type Otto reads you as, and the habits it is using against you. A **stress test** fits a clone of your style to Otto's read (a blend of the reference player types weighted by how well their measured statistics match yours) and plays it against the balanced blueprint and against Otto in a Web Worker, so you see how exploitable your style is in dollars per 100 hands.
- **Arena** — Otto and the balanced blueprint play the *same* deals against any archetype (or a custom opponent you design with sliders); watch the curves separate as Otto's read sharpens.
- **Strategy Lab** — 13×13 preflop range explorer across seven scenarios, and postflop strategy-by-hand-strength charts that show the polarised bet/check structure CFR discovers on its own.
- **How it works** — architecture diagram, convergence and RL training curves, evaluation results and references.

![Your style](docs/screenshots/style.png)

![Arena](docs/screenshots/arena.png)

![Strategy Lab](docs/screenshots/lab.png)

## Results

Win rates in **big blinds per 100 hands** (95% CI), duplicate format, 30,000 hands per cell. Both bots start each match knowing nothing about the opponent.

| Opponent | Balanced AI (GTO only) | Adaptive AI (GTO + RL) | Gain |
|---|---:|---:|---:|
| Calling Station | +53 ± 16 | **+381 ± 24** | +328 |
| Maniac | +83 ± 21 | **+183 ± 26** | +100 |
| Nit | +23 ± 7 | **+52 ± 7** | +28 |
| TAG Regular | +11 ± 11 | **+58 ± 12** | +47 |
| LAG Aggro | +34 ± 14 | **+88 ± 17** | +55 |
| Scared Money | +33 ± 6 | **+65 ± 7** | +32 |
| Passive Fish | +39 ± 10 | **+115 ± 14** | +76 |
| GTO Blueprint | -10 ± 12 | **+2 ± 13** | +12 |

- The blueprint (66M MCCFR iterations, 39,795 infosets) already beats every archetype.
- The RL layer (4.7M training hands) multiplies those win rates by 2–7× against every leaky style, with non-overlapping intervals.
- Against the blueprint itself it breaks even, so it doesn't invent leaks that aren't there.

## Fair play

- Both players start every hand with 100 big blinds and the button alternates.
- Live deals use the browser's cryptographic RNG (`crypto.getRandomValues`).
- At the table the AI uses only its own hole cards, the board dealt so far and the betting; it learns your cards only at showdown. [`fairness.test.ts`](packages/engine/test/fairness.test.ts) checks that its policy is identical whatever your cards and the undealt board are.
- The critic that sees both hands exists only in offline training. The "AI's thinking" panel keeps the bot's odds hidden until the hand ends.

## Architecture

```mermaid
flowchart LR
  subgraph GTO["GTO layer (offline MCCFR)"]
    S[Game state] --> A[Card abstraction<br/>169 + 32 E-HS² buckets] --> B[CFR blueprint<br/>σ_GTO]
  end
  subgraph EX["Exploit layer"]
    P[Public actions + showdowns] --> M[Bayesian opponent model<br/>16 Beta posteriors] --> N[Policy MLP<br/>36→64→64→4, PPO]
  end
  B --> T{{"σ ∝ σ_GTO · exp(λΔ)"}}
  B -- blueprint mix, state --> N
  N -- Δ --> T
  L[λ gate / risk budget] --> T
  T --> Act[Action]
```

### Repository layout

```
packages/engine     Dependency-free TS engine — runs in Node, workers and the browser
  src/game.ts         chip-accurate HUNL rules (min-raise, all-ins, refunds)
  src/evaluator.ts    bit-mask 7-card evaluator (~10M evals/s)
  src/equity.ts       Monte Carlo / exact equity, unbiased E[HS²]
  src/abstraction.ts  bet sizing, pseudo-harmonic translation, infoset keys, buckets
  src/cfr.ts          external-sampling MCCFR (+ linear CFR, pruning, merging)
  src/blueprint.ts    compact blueprint format + robust lookup
  src/opponentModel.ts Bayesian tendency tracking
  src/agents.ts       GTO / exploit agents, policy tilt, attributions
  src/nn.ts           tiny MLP with manual backprop + Adam
  src/archetypes.ts   parametric opponent styles + domain randomisation
  src/match.ts        duplicate evaluation
  src/coach.ts        decision grading, archetype classification
packages/training   Node training CLIs (worker_threads)
apps/web            React demo (Vite, Tailwind, Framer Motion, Web Worker arena)
```

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173 — trained models are committed
npm test               # engine unit tests
npm run typecheck
npm run build:artifact -w apps/web   # single-file build (inline JS/CSS, blob worker)
```

### Re-train from scratch

```bash
npm run train:blueprint -- --minutes 70 --workers 3 --buckets 32   # → apps/web/public/models/blueprint.json
npm run train:exploit   -- --minutes 45 --workers 4 --evalDeals 15000   # → apps/web/public/models/exploit.json
```

`train:exploit` also measures equilibrium baseline frequencies (blueprint self-play), archetype signatures, and runs the duplicate evaluation shown above.

## Design notes

- **Why tilt the blueprint instead of learning a policy from scratch?** A from-scratch RL policy is exploitable and data-hungry. Re-weighting an equilibrium keeps every within-group mix (bet sizes, bluff-to-value ratios) intact, makes λ = 0 a hard guarantee of GTO play, and reduces the RL problem to four interpretable numbers per decision.
- **Why a privileged critic?** Hand outcomes have a standard deviation of tens of big blinds, mostly card luck. Letting the value baseline see both hands (training only) removes most of that variance from the advantages.
- **Why Bayesian features?** Shrinkage toward the equilibrium prior means the network sees "balanced" until the data says otherwise, so the bot doesn't over-react to a handful of hands — and the same posteriors drive the credible-interval UI.
- **Imperfect recall.** Postflop infosets remember the current street exactly but compress earlier streets to SPR class + who had the initiative. This trades a little theoretical purity for a game small enough to converge in about an hour on a laptop.

## References

Zinkevich et al. 2007 (CFR) · Lanctot et al. 2009 (MCCFR) · Brown & Sandholm 2019 (Discounted CFR; Pluribus) · Ganzfried & Sandholm 2013 (action translation), 2015 (safe exploitation) · Johanson et al. 2013 (E[HS²] abstraction) · Schulman et al. 2017 (PPO) · Pinto et al. 2017 (asymmetric actor-critic) · Jacob et al. 2022 (piKL).

## License

MIT
