import { type ReactNode, useMemo } from 'react';
import { ArchitectureDiagram } from '../components/charts/ArchitectureDiagram';
import { EvalChart } from '../components/charts/EvalChart';
import { LineChart } from '../components/charts/LineChart';
import { Panel } from '../components/ui/Controls';
import { Footer } from '../components/ui/Footer';
import { per100 } from '../lib/format';
import { usePlay } from '../lib/store';

function ema(values: number[], alpha: number) {
  let m = values[0] ?? 0;
  return values.map((v) => (m = alpha * v + (1 - alpha) * m));
}

export function AboutPage() {
  const models = usePlay((s) => s.models);
  const bp = models?.blueprint.file;
  const ex = models?.exploit;

  const cfrRegret = useMemo(() => (bp?.trainingLog ?? []).map((p) => [p.iteration, p.avgRegret] as [number, number]), [bp]);
  const cfrDelta = useMemo(() => (bp?.trainingLog ?? []).map((p) => [p.iteration, p.strategyDelta] as [number, number]), [bp]);
  const rl = ex?.trainingLog ?? [];
  const rlReward = useMemo(() => {
    const sm = ema(rl.map((p) => p.meanReward * 100), 0.05);
    return rl.map((p, i) => [p.hands, sm[i]] as [number, number]);
  }, [rl]);
  const rlDev = useMemo(() => rl.map((p) => [p.hands, p.kl] as [number, number]), [rl]);
  const avgGain = ex?.evaluation.length
    ? ex.evaluation.filter((r) => r.opponent !== 'GTO Blueprint').reduce((a, r) => a + (r.exploit - r.gto), 0) / ex.evaluation.filter((r) => r.opponent !== 'GTO Blueprint').length
    : 0;

  return (
    <>
      <div className="mx-auto max-w-[1200px] px-4 pb-16 lg:px-6">
        <section className="relative mb-10 mt-8 overflow-hidden border border-ink-100 bg-ink-900 p-8 sm:p-12">
          <div className="eyebrow">How it works</div>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Play the equilibrium. <span className="text-gradient">Then exploit the human.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-300">Two layers: an unbeatable equilibrium, and a learned layer that bends it toward your leaks.</p>
          <div className="mt-8 grid grid-cols-2 border border-ink-600 sm:grid-cols-4">
            <Kpi label="CFR iterations" value={bp ? `${(bp.meta.iterations / 1e6).toFixed(1)}M` : '—'} />
            <Kpi label="Information sets" value={bp ? bp.meta.infosets.toLocaleString() : '—'} />
            <Kpi label="RL training hands" value={ex ? `${(ex.meta.hands / 1e6).toFixed(1)}M` : '—'} />
            <Kpi label="Extra won by adapting" value={ex?.evaluation.length ? `${per100(avgGain / 100)}/100` : '—'} accent />
          </div>
        </section>

        <Panel title="Architecture" className="mb-6">
          <ArchitectureDiagram />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section n="1" tone="gto" title="The GTO blueprint — Monte Carlo CFR">
            <p>
              Counterfactual Regret Minimization repeatedly plays the game against itself, tracking for every decision how much it <em>regrets</em> not
              having taken each action. Regret-matching drives the average strategy to a Nash equilibrium: a strategy that no opponent can exploit.
            </p>
            <ul>
              <li>
                <b>External-sampling MCCFR</b> — samples chance and opponent actions, explores all of the traverser's.
              </li>
              <li>
                <b>Linear CFR</b> discounting and <b>regret-based pruning</b>, as in Libratus/Pluribus.
              </li>
              <li>
                <b>Card abstraction</b>: 169 lossless preflop classes; postflop hands bucketed by percentile of <b>E[HS²]</b>, which separates draws
                from made hands of equal equity.
              </li>
              <li>
                <b>Action abstraction</b>: ⅓, ½, pot and all-in; human off-tree bets are mapped with the <b>pseudo-harmonic</b> translation.
              </li>
              <li>
                <b>Parallel training</b> on worker threads; runs are merged by summing reach-weighted strategy sums — a mixture of equilibria in a
                two-player zero-sum game is still an equilibrium.
              </li>
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">Average positive regret ↓</div>
                <LineChart series={[{ name: 'avg regret', color: 'var(--color-gto)', points: cfrRegret }]} height={150} xLabel="iterations" formatX={(v) => `${(v / 1e6).toFixed(0)}M`} formatY={(v) => v.toFixed(3)} zeroLine={false} />
              </div>
              <div>
                <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">Average-strategy change per checkpoint ↓</div>
                <LineChart series={[{ name: 'Δσ', color: 'var(--color-gto)', points: cfrDelta }]} height={150} xLabel="iterations" formatX={(v) => `${(v / 1e6).toFixed(0)}M`} formatY={(v) => v.toFixed(3)} zeroLine={false} />
              </div>
            </div>
          </Section>

          <Section n="2" tone="exploit" title="Reading the opponent — Bayesian modelling">
            <p>
              Otto tracks 16 tendencies — VPIP, 3-bet, c-bet, fold-to-c-bet, aggression, river folds, showdown bluff rate and more — each as a
              Beta-Bernoulli posterior whose prior is centred on what the blueprint itself does.
            </p>
            <div className="my-4 border border-dashed border-ink-500 p-4 text-center font-mono text-[13px] text-ink-200">
              p(stat | data) = Beta(α₀ + hits, β₀ + misses), &nbsp; α₀ / (α₀+β₀) = GTO frequency
            </div>
            <p>
              With no data every posterior equals the equilibrium baseline, so the network's opponent features are exactly zero and Otto plays GTO.
              As evidence accumulates the posterior means — and therefore the exploitation — move only as far as the data justifies. The model uses only
              information a human would have: public actions and cards shown down.
            </p>
            <p>
              The same posteriors classify you against the archetype library (Bayes' rule over the measured frequencies of each style) — that's the
              "You play like…" read on the Your style page.
            </p>
          </Section>

          <Section n="3" tone="exploit" title="The exploit layer — PPO with an asymmetric critic">
            <p>
              A small policy network takes 18 state features (street, position, hand strength, pot odds, SPR, the blueprint's own action mix) plus the
              18 opponent features, and outputs a bounded tilt Δ over four action groups. The final policy re-weights the blueprint:
            </p>
            <div className="my-4 border border-dashed border-ink-500 p-4 text-center font-mono text-[13px] text-ink-200">
              P(g) ∝ (Q_g + ε·λ) · exp(λ · 3·tanh(f_θ(x))_g)
            </div>
            <ul>
              <li>
                <b>PPO</b> (clipped surrogate) on hand-level returns, with an <b>L2 trust region</b> keeping Δ near zero unless deviating pays.
              </li>
              <li>
                <b>Asymmetric actor-critic</b>: the value baseline sees <em>both</em> players' cards during training — privileged information that
                strips most card luck from the advantage estimates. The actor never sees it.
              </li>
              <li>
                <b>Domain randomisation</b>: each episode samples a random blend of player archetypes (or the blueprint itself) and a fresh opponent
                model, for 20–300 hands, so the policy learns to act at every level of evidence — and to leave balanced players alone.
              </li>
              <li>
                <b>Explainable</b>: gradient × input attribution of Δ onto the opponent features powers the "because you…" explanations.
              </li>
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">Training reward (bb/100, smoothed)</div>
                <LineChart series={[{ name: 'reward', color: 'var(--color-exploit)', points: rlReward }]} height={150} xLabel="training hands" formatX={(v) => `${(v / 1e6).toFixed(1)}M`} formatY={(v) => v.toFixed(0)} />
              </div>
              <div>
                <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">KL(policy ‖ blueprint) — how far it deviates</div>
                <LineChart series={[{ name: 'KL', color: 'var(--color-exploit)', points: rlDev }]} height={150} xLabel="training hands" formatX={(v) => `${(v / 1e6).toFixed(1)}M`} formatY={(v) => v.toFixed(3)} zeroLine={false} />
              </div>
            </div>
          </Section>

          <Section n="4" tone="gold" title="Results — duplicate evaluation">
            <p>
              Every deal is played twice with seats swapped, cancelling most of the card luck (the format of the Annual Computer Poker Competition).
              Win rates in big blinds per 100 hands with 95% confidence intervals, both bots starting each match with an empty opponent model.
            </p>
            <div className="mt-4">{ex?.evaluation.length ? <EvalChart rows={ex.evaluation} /> : <div className="text-sm text-ink-500">Evaluation not available.</div>}</div>
            <p className="mt-4 text-[13px] text-ink-400">
              Against the blueprint itself Otto should break even — evidence that the safety mechanisms keep it from inventing leaks that
              aren't there. Re-run any of these live in the Arena.
            </p>
          </Section>
        </div>

        <Panel title="Fair play" className="mt-6">
          <div className="grid gap-6 text-[14px] leading-relaxed text-ink-300 md:grid-cols-3">
            <div>
              <div className="mb-2 font-bold text-ink-100">Same game, same odds</div>
              Both players start every hand with 100 big blinds and the dealer button alternates, so blinds and position are shared equally. Cards are
              shuffled with the browser's cryptographic random number generator.
            </div>
            <div>
              <div className="mb-2 font-bold text-ink-100">The AI never peeks</div>
              At the table it uses only its own two cards, the board dealt so far and the betting. It learns your cards only when you show them down. A
              unit test checks that its decisions are identical whatever your cards or the undealt board are.
            </div>
            <div>
              <div className="mb-2 font-bold text-ink-100">Training-only information stays in training</div>
              The critic that sees both hands exists only in offline simulation to reduce variance; it is not part of the shipped bot. Otto's reasoning
              card also hides its hand until the hand is over.
            </div>
          </div>
        </Panel>

        <Panel title="Engineering" className="mt-6">
          <div className="grid gap-6 text-[14px] text-ink-300 md:grid-cols-3">
            <div>
              <div className="mb-2 font-bold text-ink-100">One engine, three runtimes</div>
              A dependency-free TypeScript engine (rules, evaluator, abstraction, CFR, neural net, PPO maths) runs in Node worker threads for
              training, in a Web Worker for the Arena, and on the main thread for live play.
            </div>
            <div>
              <div className="mb-2 font-bold text-ink-100">Fast & tested</div>
              Bit-mask 7-card evaluator (~10M evals/s), unit tests for rules, payouts, side-pot refunds, min-raise logic, action translation and hand
              ranking; zero-sum invariants fuzzed over thousands of random hands.
            </div>
            <div>
              <div className="mb-2 font-bold text-ink-100">Reproducible</div>
              <code className="block whitespace-pre border border-ink-600 bg-ink-950 p-3 font-mono text-[12px] text-ink-200">
                {'npm run train:blueprint\nnpm run train:exploit\nnpm test && npm run dev'}
              </code>
            </div>
          </div>
        </Panel>

        <Panel title="References" className="mt-6">
          <ul className="grid gap-1.5 text-[13px] text-ink-300 md:grid-cols-2">
            <li>Zinkevich et al. — Regret Minimization in Games with Incomplete Information (2007)</li>
            <li>Lanctot et al. — Monte Carlo Sampling for Regret Minimization (2009)</li>
            <li>Brown & Sandholm — Solving Imperfect-Information Games via Discounted Regret Minimization (2019)</li>
            <li>Brown & Sandholm — Superhuman AI for multiplayer poker / Pluribus (2019)</li>
            <li>Ganzfried & Sandholm — Action Translation in Extensive-Form Games (2013)</li>
            <li>Ganzfried & Sandholm — Safe Opponent Exploitation (2015)</li>
            <li>Johanson et al. — Evaluating State-Space Abstractions in Extensive-Form Games (2013)</li>
            <li>Schulman et al. — Proximal Policy Optimization Algorithms (2017)</li>
            <li>Pinto et al. — Asymmetric Actor Critic for Image-Based Robot Learning (2017)</li>
            <li>Jacob et al. — Modeling Strong and Human-Like Gameplay with KL-Regularized Search (piKL, 2022)</li>
          </ul>
        </Panel>
      </div>
      <Footer />
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-ink-600 px-4 py-3 [&:nth-child(n+2)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">{label}</div>
      <div className={`tabular mt-1 font-mono text-2xl font-bold ${accent ? 'text-gold' : 'text-ink-100'}`}>{value}</div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; tone: 'gto' | 'exploit' | 'gold'; children: ReactNode }) {
  return (
    <section className="glass p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="balloon" style={{ width: 26, height: 26, fontSize: 12 }}>
          {n}
        </span>
        <h2 className="text-xl font-extrabold text-ink-100">{title}</h2>
      </div>
      <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-300 [&_b]:text-ink-100 [&_li]:ml-4 [&_li]:list-[square] [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">{children}</div>
    </section>
  );
}
