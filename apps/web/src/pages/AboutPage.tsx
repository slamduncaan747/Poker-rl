import { type ReactNode, useMemo } from 'react';
import { ArchitectureDiagram } from '../components/charts/ArchitectureDiagram';
import { EvalChart } from '../components/charts/EvalChart';
import { LineChart } from '../components/charts/LineChart';
import { Panel } from '../components/ui/Controls';
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
    <div className="mx-auto max-w-[1200px] px-4 pb-16 lg:px-6">
      <section className="relative mb-10 mt-4 overflow-hidden rounded-3xl border border-white/5 p-8 sm:p-12" style={{ background: 'radial-gradient(800px 300px at 0% 0%, rgba(59,143,240,0.18), transparent 60%), radial-gradient(800px 300px at 100% 100%, rgba(232,95,42,0.16), transparent 60%), #0a0e17' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-400">How it works</div>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Play the equilibrium. <span className="text-gradient">Then exploit the human.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-300">
          Poker RL is a heads-up no-limit hold'em AI in two layers: a game-theory-optimal blueprint that can't be beaten in the long run, and a
          reinforcement-learned layer that reads its opponent and deviates from equilibrium exactly where the opponent leaks chips.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="CFR iterations" value={bp ? `${(bp.meta.iterations / 1e6).toFixed(1)}M` : '—'} />
          <Kpi label="Information sets" value={bp ? bp.meta.infosets.toLocaleString() : '—'} />
          <Kpi label="RL training hands" value={ex ? `${(ex.meta.hands / 1e6).toFixed(1)}M` : '—'} />
          <Kpi label="Avg. RL edge vs archetypes" value={ex?.evaluation.length ? `+${avgGain.toFixed(0)} bb/100` : '—'} accent />
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
              <div className="mb-1 text-[11px] text-ink-400">Average positive regret ↓</div>
              <LineChart series={[{ name: 'avg regret', color: 'var(--color-gto)', points: cfrRegret }]} height={150} xLabel="iterations" formatX={(v) => `${(v / 1e6).toFixed(0)}M`} formatY={(v) => v.toFixed(3)} zeroLine={false} />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-ink-400">Average-strategy change per checkpoint ↓</div>
              <LineChart series={[{ name: 'Δσ', color: 'var(--color-gto)', points: cfrDelta }]} height={150} xLabel="iterations" formatX={(v) => `${(v / 1e6).toFixed(0)}M`} formatY={(v) => v.toFixed(3)} zeroLine={false} />
            </div>
          </div>
        </Section>

        <Section n="2" tone="exploit" title="Reading the opponent — Bayesian modelling">
          <p>
            The bot tracks 16 tendencies — VPIP, 3-bet, c-bet, fold-to-c-bet, aggression, river folds, showdown bluff rate and more — each as a
            Beta-Bernoulli posterior whose prior is centred on what the blueprint itself does.
          </p>
          <div className="my-4 rounded-xl bg-black/30 p-4 text-center font-mono text-[13px] text-ink-200 ring-1 ring-white/5">
            p(stat | data) = Beta(α₀ + hits, β₀ + misses), &nbsp; α₀ / (α₀+β₀) = GTO frequency
          </div>
          <p>
            With no data every posterior equals the equilibrium baseline, so the network's opponent features are exactly zero and the bot plays GTO.
            As evidence accumulates the posterior means — and therefore the exploitation — move only as far as the data justifies. The model uses only
            information a human would have: public actions and cards shown down.
          </p>
          <p>
            The same posteriors classify you against the archetype library (Bayes' rule over the measured frequencies of each style) — that's the
            "You play like…" read in the X-Ray panel.
          </p>
        </Section>

        <Section n="3" tone="exploit" title="The exploit layer — PPO with an asymmetric critic">
          <p>
            A small policy network takes 18 state features (street, position, hand strength, pot odds, SPR, the blueprint's own action mix) plus the
            18 opponent features, and outputs a bounded tilt Δ over four action groups. The final policy re-weights the blueprint:
          </p>
          <div className="my-4 rounded-xl bg-black/30 p-4 text-center font-mono text-[13px] text-ink-200 ring-1 ring-white/5">
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
              <div className="mb-1 text-[11px] text-ink-400">Training reward (bb/100, smoothed)</div>
              <LineChart series={[{ name: 'reward', color: 'var(--color-exploit)', points: rlReward }]} height={150} xLabel="training hands" formatX={(v) => `${(v / 1e6).toFixed(1)}M`} formatY={(v) => v.toFixed(0)} />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-ink-400">KL(policy ‖ blueprint) — how far it deviates</div>
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
            Against the blueprint itself the exploit bot should break even — evidence that the safety mechanisms keep it from inventing leaks that
            aren't there. Re-run any of these live in the Arena.
          </p>
        </Section>
      </div>

      <Panel title="Engineering" className="mt-6">
        <div className="grid gap-6 text-[14px] text-ink-300 md:grid-cols-3">
          <div>
            <div className="mb-2 font-semibold text-ink-100">One engine, three runtimes</div>
            A dependency-free TypeScript engine (rules, evaluator, abstraction, CFR, neural net, PPO maths) runs in Node worker threads for
            training, in a Web Worker for the Arena, and on the main thread for live play.
          </div>
          <div>
            <div className="mb-2 font-semibold text-ink-100">Fast & tested</div>
            Bit-mask 7-card evaluator (~10M evals/s), unit tests for rules, payouts, side-pot refunds, min-raise logic, action translation and hand
            ranking; zero-sum invariants fuzzed over thousands of random hands.
          </div>
          <div>
            <div className="mb-2 font-semibold text-ink-100">Reproducible</div>
            <code className="block whitespace-pre rounded-lg bg-black/30 p-3 font-mono text-[12px] text-ink-200 ring-1 ring-white/5">
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
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-soft rounded-2xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-ink-400">{label}</div>
      <div className={`tabular mt-1 font-display text-2xl font-bold ${accent ? 'text-win' : 'text-ink-100'}`}>{value}</div>
    </div>
  );
}

function Section({ n, title, tone, children }: { n: string; title: string; tone: 'gto' | 'exploit' | 'gold'; children: ReactNode }) {
  const c = tone === 'gto' ? 'from-gto/30 text-gto-hi' : tone === 'exploit' ? 'from-exploit/30 text-exploit-hi' : 'from-gold/30 text-amber-300';
  return (
    <section className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br to-transparent font-display text-lg font-bold ${c}`}>{n}</span>
        <h2 className="font-display text-xl font-semibold text-ink-100">{title}</h2>
      </div>
      <div className="prose-sm flex flex-col gap-3 text-[14px] leading-relaxed text-ink-300 [&_b]:text-ink-100 [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">{children}</div>
    </section>
  );
}
