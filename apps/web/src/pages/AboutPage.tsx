import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ArchitectureDiagram } from '../components/charts/ArchitectureDiagram';
import { LineChart } from '../components/charts/LineChart';
import { Scatter } from '../components/charts/Scatter';
import { Footer } from '../components/ui/Footer';
import research from '../data/research.json';
import { usePlay } from '../lib/store';

const NAMES: Record<string, string> = {
  'Calling Station': 'Calling station',
  Maniac: 'Maniac',
  Nit: 'Rock',
  'TAG Regular': 'Solid regular',
  'LAG Aggro': 'Loose-aggressive',
  'Scared Money': 'Scared money',
  'Passive Fish': 'Passive player',
  'GTO Blueprint': 'Balanced bot (control)',
};

const sign = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;
const ema = (xs: number[], a: number) => {
  let m = xs[0] ?? 0;
  return xs.map((x) => (m = a * x + (1 - a) * m));
};

/**
 * "How it works", written as a short research report. Every number comes from
 * the trained model files or from `npm run research` (src/data/research.json).
 */
export function AboutPage() {
  const models = usePlay((s) => s.models);
  const bp = models?.blueprint.file;
  const ex = models?.exploit;
  const R = research;

  const evalRows = ex?.evaluation ?? [];
  const versus = evalRows.filter((r) => r.opponent !== 'GTO Blueprint');
  const control = evalRows.find((r) => r.opponent === 'GTO Blueprint');
  const avgGain = versus.length ? versus.reduce((a, r) => a + r.exploit - r.gto, 0) / versus.length : 0;
  const reg = bp?.trainingLog ?? [];
  const regretDrop = reg.length ? 1 - reg[reg.length - 1].avgRegret / reg[0].avgRegret : 0;
  const params = ex ? ex.actor.layers.reduce((a, l) => a + l.in * l.out + l.out, 0) : 0;
  const rl = useMemo(() => ex?.trainingLog ?? [], [ex]);
  const reward = useMemo(() => ema(rl.map((p) => p.meanReward * 100), 0.05), [rl]);
  const id20 = R.identification.points.find((p) => p.hands === 20)!;
  const id40 = R.identification.points.find((p) => p.hands === 40)!;
  const full = R.identification.points.find((p) => p.accuracy >= 1)!;
  const g = R.generalisation;
  const c = R.cloneFidelity;
  const perf = R.performance;
  const loc = perf.loc.engine + perf.loc.training + perf.loc.web + perf.loc.tests;

  return (
    <>
      <article className="mx-auto max-w-[780px] px-4 pb-20 pt-10 lg:px-6">
        <header>
          <div className="eyebrow">Research write-up</div>
          <h1 className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-tight sm:text-[42px]">
            Otto: exploiting human poker players <span className="text-gold">without becoming exploitable</span>
          </h1>
          <p className="mt-4 font-mono text-[11px] tracking-[0.08em] text-ink-400">DUNCAN LARZELERE · 2026 · TYPESCRIPT, FROM SCRATCH</p>
        </header>

        <Abstract>
          Most poker AIs aim for <em>balanced</em> play — a strategy no one can beat in the long run. But balanced play leaves money on the table against real people, who have habits. Otto starts from a balanced strategy it learned by playing itself, builds a statistical picture of your habits as you play, and uses a small neural network trained with reinforcement learning to lean its strategy toward the plays that punish those habits. Against seven simulated player types it wins <b>{sign(avgGain)} big blinds per 100 hands more</b> than the balanced strategy alone, it does better against <b>{g.wins} of {g.opponents}</b> opponents it never trained on, and against a perfectly balanced opponent it still breaks even. Everything — the game engine, both training pipelines and the app — is written from scratch in TypeScript and runs in the browser.
        </Abstract>

        <div className="mt-8 grid grid-cols-2 border border-ink-600 sm:grid-cols-3">
          <Tile value={`${sign(avgGain)}`} unit="bb/100" label="extra won by adapting, avg. of 7 player types" accent />
          <Tile value={`${g.wins}/${g.opponents}`} label="unseen opponents where adapting won more" />
          <Tile value={`${Math.round(id20.accuracy * 100)}%`} label={`player types identified after ${id20.hands} hands`} />
          <Tile value={`r = ${c.correlation.toFixed(2)}`} label="stress-test prediction vs. actual result" />
          <Tile value={control ? `${sign(control.exploit)} ± ${control.exploitCI.toFixed(0)}` : '—'} unit="bb/100" label="vs. a perfectly balanced opponent: break-even, as intended" />
          <Tile value={`${(perf.evalsPerSec / 1e6).toFixed(1)}M`} label="poker hands evaluated per second" />
        </div>
        <Note>
          Win rates are in <b>big blinds per 100 hands (bb/100)</b>, the standard poker unit. At the table's $1/$2 stakes, +100 bb/100 means winning $200 per 100 hands.
        </Note>

        <Sec n={1} title="The problem" lead="Unbeatable and profitable are different goals.">
          <p>
            In two-player poker a <b>Nash equilibrium</b> strategy is guaranteed not to lose on average, whatever the opponent does. That safety comes at a price: it treats every opponent the same, so it wins only a little from people who make big, obvious mistakes. A strategy that <em>exploits</em> those mistakes wins much more — but a naïve one can be exploited right back, or chase patterns that are really just luck.
          </p>
          <p>Otto's design goal was to get the upside of exploitation while keeping the safety of equilibrium. Concretely, it should:</p>
          <ul>
            <li>play balanced poker when it knows nothing about you;</li>
            <li>move away from balanced play only as far as the evidence about you justifies;</li>
            <li>never be worse than balanced against an opponent with no habits to exploit;</li>
            <li>explain every adjustment in terms of something you actually did.</li>
          </ul>
        </Sec>

        <Sec n={2} title="How it fits together" lead="Three layers combine into every decision.">
          <p>
            A <b>balanced strategy</b>, learned offline, says how often to fold, call or raise in each situation. An <b>opponent model</b> keeps running estimates of your habits. A <b>policy network</b> reads both and outputs a small tilt that shifts probability between folding, calling, small bets and big bets. A single dial, λ, scales the tilt: at λ = 0 Otto is exactly the balanced strategy.
          </p>
          <Figure n={1} caption="System architecture. The top lane is trained offline by self-play; the bottom lane runs live as you play.">
            <ArchitectureDiagram />
          </Figure>
        </Sec>

        <Sec n={3} title="Making the game small enough to solve" lead="Group similar hands and bet sizes so the strategy fits in a browser.">
          <p>
            Heads-up no-limit hold'em has more situations than atoms in the universe, so the game is <b>abstracted</b>: strategically similar hands share one strategy, and bets are limited to a few sizes. Bets you make that don't fit the menu are mapped onto the nearest sizes with a randomised rule (pseudo-harmonic translation) that is hard to game.
          </p>
          <Table
            head={['Component', 'Choice']}
            rows={[
              ['Starting hands', '169 classes (lossless: suits only matter when equal)'],
              ['Later streets', '32 buckets per street by expected hand strength squared, E[HS²], which separates draws from made hands'],
              ['Bet sizes', '⅓ pot, ½ pot, pot, all-in'],
              ['Off-menu bets', 'Pseudo-harmonic action translation'],
              ['Decision points in the final strategy', bp ? bp.meta.infosets.toLocaleString() : '—'],
              ['Strategy file (gzipped)', `${perf.modelKB.blueprint} KB`],
            ]}
          />
        </Sec>

        <Sec n={4} title="Learning balanced poker by self-play" lead="Counterfactual regret minimisation: play yourself, regret what you didn't do, repeat.">
          <p>
            <b>Counterfactual Regret Minimisation (CFR)</b> plays the game against itself. At every decision it records how much better each alternative would have done — its <em>regret</em> — and plays actions in proportion to their positive regret. Averaged over many iterations, this provably converges to an equilibrium. Otto uses the sampled variant (external-sampling Monte Carlo CFR) with two accelerations from the Libratus and Pluribus systems: later iterations count more (linear CFR), and actions with very negative regret are temporarily skipped (pruning). Training ran on parallel threads whose results are merged at the end.
          </p>
          <Figure n={2} caption="Average positive regret over training. Lower means closer to equilibrium.">
            <LineChart
              series={[{ name: 'Average regret', color: 'var(--color-gto)', points: reg.map((p) => [p.iteration, p.avgRegret] as [number, number]) }]}
              height={200}
              xLabel="self-play iterations"
              formatX={(v) => `${(v / 1e6).toFixed(0)}M`}
              formatY={(v) => v.toFixed(2)}
              zeroLine={false}
            />
          </Figure>
          <Table
            head={['Measure', 'Value']}
            rows={[
              ['Self-play iterations', bp ? `${(bp.meta.iterations / 1e6).toFixed(1)} million` : '—'],
              ['Training time', bp ? `${Math.round(bp.meta.seconds / 60)} min on ${bp.meta.workers} CPU threads` : '—'],
              ['Throughput', bp ? `${Math.round(bp.meta.iterations / bp.meta.seconds).toLocaleString()} iterations / s` : '—'],
              ['Reduction in average regret', `${Math.round(regretDrop * 100)}%`],
              ['Strategy change at the last checkpoint', reg.length ? reg[reg.length - 1].strategyDelta.toFixed(5) : '—'],
            ]}
          />
        </Sec>

        <Sec n={5} title="Reading the opponent" lead="Sixteen habits, each a probability that sharpens with every hand.">
          <p>
            Otto tracks sixteen habits — how often you play a hand, raise before the flop, fold to a bet, bluff on the river, and so on. Each is a <b>Beta–Bernoulli</b> estimate: it starts at what balanced play does and moves toward your actual frequency as the situation keeps coming up. With little evidence the estimate stays near balanced, which is what keeps early play safe. Otto uses only what a person at the table would see: the betting, and your cards when a hand reaches showdown.
          </p>
          <Formula>estimate = (times you did it + k · typical) / (times it came up + k)</Formula>
          <p>
            The same counts also say which of seven reference player types you most resemble (Bayes' rule over each type's measured habits). To test how fast this works, Otto watched each type for {R.identification.points[R.identification.points.length - 1].hands} hands, {R.identification.sessions / R.identification.types} times per type.
          </p>
          <Figure n={3} caption={`Share of ${R.identification.sessions} sessions in which Otto's best guess was the right player type, by hands observed.`}>
            <LineChart
              series={[
                { name: 'Correct type', color: 'var(--color-exploit)', points: R.identification.points.map((p) => [p.hands, p.accuracy * 100] as [number, number]) },
                { name: 'Confidence in the right type', color: 'var(--color-gto)', dashed: true, points: R.identification.points.map((p) => [p.hands, p.prob * 100] as [number, number]) },
              ]}
              height={210}
              xLabel="hands observed"
              logX
              formatY={(v) => `${v.toFixed(0)}%`}
              zeroLine={false}
            />
          </Figure>
          <Result>
            {Math.round(id20.accuracy * 100)}% correct after {id20.hands} hands, {Math.round(id40.accuracy * 100)}% after {id40.hands}, and 100% from {full.hands} hands on.
          </Result>
        </Sec>

        <Sec n={6} title="Learning to exploit" lead="A small network learns, by trial and error, which way to lean against each kind of player.">
          <p>
            The policy network sees the situation (street, position, hand strength, pot odds, what the balanced strategy recommends) and the sixteen habit estimates. It outputs four numbers, one per action group, that tilt the balanced strategy:
          </p>
          <Formula>P(action group) ∝ balanced probability × exp(λ · Δ),   Δ = 3 · tanh(network output)</Formula>
          <p>
            Because the tilt is bounded and multiplies the balanced strategy, Otto can lean but never invent a play the balanced strategy rules out. It was trained with <b>Proximal Policy Optimisation (PPO)</b> against a large population of randomly generated opponents, so it learns a general skill instead of memorising a few types. Three choices made training stable:
          </p>
          <ul>
            <li>
              <b>Privileged critic.</b> During training only, the value estimate may see both players' cards. That removes most of the card luck from the learning signal; the shipped bot never sees your cards.
            </li>
            <li>
              <b>Trust region.</b> PPO's clipping plus a penalty on the size of the tilt keeps the policy close to balanced unless deviating clearly pays.
            </li>
            <li>
              <b>Varied evidence.</b> Each training episode lasts 20–300 hands, so the network learns to act at every level of certainty about its opponent.
            </li>
          </ul>
          <Table
            head={['Setting', 'Value']}
            rows={[
              ['Network', ex ? `${ex.actor.layers.map((l) => l.in).join(' → ')} → ${ex.actor.layers[ex.actor.layers.length - 1].out} (${params.toLocaleString()} parameters)` : '—'],
              ['Optimiser', 'Adam, learning rate 3·10⁻⁴'],
              ['PPO', 'clip 0.2 · 3 epochs per batch · tilt penalty 0.003'],
              ['Training hands', ex ? `${(ex.meta.hands / 1e6).toFixed(2)} million in ${Math.round(ex.meta.seconds / 60)} min (${rl.length} updates)` : '—'],
              ['Reward, start → end', rl.length ? `${sign(reward[0])} → ${sign(reward[reward.length - 1])} bb/100` : '—'],
            ]}
          />
          <Figure n={4} caption="Training reward (bb/100, smoothed) against the randomised opponent population.">
            <LineChart
              series={[{ name: 'Reward', color: 'var(--color-exploit)', points: rl.map((p, i) => [p.hands, reward[i]] as [number, number]) }]}
              height={200}
              xLabel="training hands"
              formatX={(v) => `${(v / 1e6).toFixed(1)}M`}
              formatY={(v) => v.toFixed(0)}
            />
          </Figure>
        </Sec>

        <Sec n={7} title="Results" lead="Adapting wins more against every human-like style, and costs nothing against a balanced one.">
          <p>
            Poker results are dominated by luck, so every match uses <b>duplicate format</b>: each deal is played twice with the seats swapped, which cancels most of the card luck. Both bots start every match knowing nothing about the opponent. Intervals are 95% confidence; n.s. means the difference is not statistically significant.
          </p>
          <Table
            caption={`Table 1 — ${versus[0]?.hands.toLocaleString() ?? '30,000'} hands per matchup, bb/100.`}
            head={['Opponent', 'Balanced', 'Otto', 'Gain']}
            rows={evalRows.map((r) => [
              NAMES[r.opponent] ?? r.opponent,
              `${sign(r.gto)} ± ${r.gtoCI.toFixed(0)}`,
              `${sign(r.exploit)} ± ${r.exploitCI.toFixed(0)}`,
              r.opponent === 'GTO Blueprint' ? (
                <span key="g" className="text-ink-400">
                  n.s.
                </span>
              ) : (
                <b key="g" className="text-gold">
                  {sign(r.exploit - r.gto)}
                </b>
              ),
            ])}
          />
          <h3 className="mt-6 text-[17px] font-bold text-ink-100">Does it hold up on players it has never seen?</h3>
          <p>
            The seven types above were part of training. To check that Otto learned a general skill, both bots played {g.opponents} new randomly generated opponents ({g.deals.toLocaleString()} duplicate deals each).
          </p>
          <Figure n={5} caption="Each dot is one unseen opponent. Above the dashed line, Otto won more than the balanced strategy.">
            <Scatter points={g.rows.map((r) => ({ x: r.gto, y: r.otto, accent: r.otto > r.gto }))} xLabel="Balanced strategy, bb/100" yLabel="Otto, bb/100" />
          </Figure>
          <Result>
            Otto won more against {g.wins} of {g.opponents} unseen opponents, by {sign(g.meanGain)} ± {(1.96 * g.seGain).toFixed(0)} bb/100 on average.
          </Result>
          <h3 className="mt-6 text-[17px] font-bold text-ink-100">How quickly does adapting pay off?</h3>
          <p>Gain over the balanced strategy by hand number within a session, across {R.learningCurve.sessions} sessions:</p>
          <Figure n={6} caption="Otto's extra win rate (bb/100) by stage of the session, with 95% intervals.">
            <Bars points={R.learningCurve.points.map((p) => ({ label: `${p.from}–${p.to}`, value: p.gain, err: 1.96 * p.se }))} />
          </Figure>
          <Result>The edge appears within the first 25 hands — the biggest leaks show up in the first few situations — and holds at about +100 bb/100 as the read firms up.</Result>
        </Sec>

        <Sec n={8} title="Measuring how exploitable you are" lead="Clone the player, then let both bots play the clone.">
          <p>
            The <a href="#you">Your style</a> page answers a question people actually have: <em>how much would a strong opponent win from me?</em> It fits a playable copy of you from Otto's read — a blend of the reference types, weighted by how closely each matches your habits — and plays the copy against both bots in a background thread.
          </p>
          <p>
            To check the method, {c.subjects} players (the 7 reference types and 12 random ones) were each observed for {c.readHands} hands and cloned. Each clone's habits matched the original's to within {c.meanStatError.toFixed(1)} percentage points on average, and the clone of each reference type was identified as that type in {c.identified} of {c.identifiable} cases.
          </p>
          <Figure n={7} caption="How much Otto wins against each clone (predicted) and against the original player (actual), bb/100. Orange: the seven reference types.">
            <Scatter points={c.rows.map((r) => ({ x: r.actual, y: r.predicted, accent: !r.id.startsWith('random') }))} xLabel="Actual, vs. the real player" yLabel="Predicted, vs. the clone" />
          </Figure>
          <Result>
            Predicted and actual exploitability correlate at r = {c.correlation.toFixed(2)}. The clone is conservative for the most extreme styles: for the maniac it predicts about half of what Otto really wins.
          </Result>
        </Sec>

        <Sec n={9} title="Engineering" lead="One engine, three runtimes, no server.">
          <p>
            The same dependency-free TypeScript engine — rules, hand evaluator, abstraction, CFR, neural network and PPO maths — runs in Node worker threads for training, in Web Workers for the Arena and the stress test, and on the main thread when you play. The app is React 19 with Vite, Tailwind and Framer Motion. Unit tests cover the rules, payouts and side-pot refunds, minimum raises, the hand evaluator, action translation, gradient checks for the network, and the cloning method.
          </p>
          <Table
            head={['Measure', 'Value']}
            rows={[
              ['Hand evaluator', `${(perf.evalsPerSec / 1e6).toFixed(1)} million 7-card hands / s`],
              ['Equity estimation', `${(perf.equitySamplesPerSec / 1e6).toFixed(1)} million Monte Carlo samples / s`],
              ['Full hands simulated, Otto vs. balanced', `${perf.handsPerSec.toLocaleString()} / s, single thread`],
              ['Code', `${loc.toLocaleString()} lines (engine ${perf.loc.engine.toLocaleString()}, training ${perf.loc.training.toLocaleString()}, app ${perf.loc.web.toLocaleString()}, tests ${perf.loc.tests.toLocaleString()})`],
              ['Tests', `${perf.tests} passing`],
              ['Models shipped to the browser', `${perf.modelKB.blueprint + perf.modelKB.exploit} KB gzipped`],
            ]}
          />
          <Formula>{`npm run train:blueprint   # self-play CFR
npm run train:exploit     # PPO exploitation layer
npm run research          # every number on this page
npm test`}</Formula>
        </Sec>

        <Sec n={10} title="Limitations" lead="What these results do and don't show.">
          <ul>
            <li>The opponents are simulated. Real people are less consistent than rule-based players, so gains against humans are likely smaller and noisier.</li>
            <li>The abstraction is coarse (four bet sizes, 32 hand buckets), so the balanced strategy is close to, but not exactly, an equilibrium of the full game. Its exact exploitability was not measured.</li>
            <li>The clone can only express styles that are blends of the seven reference types, which is why it under-predicts the most extreme players.</li>
          </ul>
        </Sec>

        <Sec n={11} title="References">
          <ol className="flex flex-col gap-1.5 pl-5 text-[13.5px] text-ink-400 [&_li]:list-decimal">
            <li>Zinkevich et al. — Regret Minimization in Games with Incomplete Information (2007)</li>
            <li>Lanctot et al. — Monte Carlo Sampling for Regret Minimization (2009)</li>
            <li>Brown &amp; Sandholm — Solving Imperfect-Information Games via Discounted Regret Minimization (2019)</li>
            <li>Brown &amp; Sandholm — Superhuman AI for multiplayer poker / Pluribus (2019)</li>
            <li>Ganzfried &amp; Sandholm — Action Translation in Extensive-Form Games (2013)</li>
            <li>Ganzfried &amp; Sandholm — Safe Opponent Exploitation (2015)</li>
            <li>Johanson et al. — Evaluating State-Space Abstractions in Extensive-Form Games (2013)</li>
            <li>Schulman et al. — Proximal Policy Optimization Algorithms (2017)</li>
            <li>Pinto et al. — Asymmetric Actor Critic for Image-Based Robot Learning (2017)</li>
          </ol>
        </Sec>
      </article>
      <Footer />
    </>
  );
}

function Abstract({ children }: { children: ReactNode }) {
  return (
    <section className="mt-8 border-l-2 border-gold pl-5">
      <div className="eyebrow">Abstract</div>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-200 [&_b]:text-ink-100">{children}</p>
    </section>
  );
}

function Tile({ value, unit, label, accent }: { value: string; unit?: string; label: string; accent?: boolean }) {
  return (
    <div className="border-ink-600 p-4 max-sm:[&:nth-child(even)]:border-l max-sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+4)]:border-t sm:[&:not(:nth-child(3n+1))]:border-l">
      <div className={`tabular font-mono text-[24px] font-bold leading-none ${accent ? 'text-gold' : ''}`}>
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal text-ink-400">{unit}</span>}
      </div>
      <div className="mt-2 text-[12.5px] leading-snug text-ink-400">{label}</div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[13px] leading-relaxed text-ink-400 [&_b]:text-ink-200">{children}</p>;
}

function Sec({ n, title, lead, children }: { n: number; title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="mt-14" id={`s${n}`}>
      <div className="flex items-baseline gap-3 border-b border-ink-600 pb-2">
        <span className="font-mono text-[13px] text-ink-500">{n}</span>
        <h2 className="text-[23px] font-extrabold leading-tight">{title}</h2>
      </div>
      {lead && <p className="mt-4 text-[17px] font-semibold leading-snug text-ink-100">{lead}</p>}
      <div className="mt-3 flex flex-col gap-4 text-[15.5px] leading-relaxed text-ink-300 [&_a]:text-ink-100 [&_a]:underline [&_a]:decoration-ink-500 [&_a]:underline-offset-4 [&_b]:text-ink-100 [&_ul>li]:ml-5 [&_ul>li]:list-[square] [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </section>
  );
}

function Figure({ n, caption, children }: { n: number; caption: string; children: ReactNode }) {
  return (
    <figure className="my-2 border border-ink-600 p-4 sm:p-5">
      {children}
      <figcaption className="mt-3 text-[13px] leading-snug text-ink-400">
        <span className="font-mono text-[11px] tracking-[0.06em] text-ink-300">FIG. {n} — </span>
        {caption}
      </figcaption>
    </figure>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="overflow-x-auto border border-ink-600 bg-ink-900 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-100">{children}</pre>;
}

function Result({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-gold bg-ink-900/60 px-4 py-3 text-[15px] text-ink-100">
      <span className="mr-2 font-mono text-[10.5px] tracking-[0.08em] text-gold">RESULT</span>
      {children}
    </p>
  );
}

function Table({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  const numeric = head.length > 2;
  return (
    <div className="my-1 overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        {caption && <caption className="mb-2 caption-top text-left font-mono text-[11px] tracking-[0.06em] text-ink-400">{caption}</caption>}
        <thead>
          <tr className="border-b border-ink-100 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-normal ${i > 0 && numeric ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-ink-700 align-top">
              {r.map((cell, j) => (
                <td key={j} className={`py-2.5 pr-3 ${j === 0 ? 'text-ink-200' : numeric ? 'tabular whitespace-nowrap text-right font-mono text-[13px]' : 'text-ink-300'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vertical bars with error whiskers. */
function Bars({ points }: { points: Array<{ label: string; value: number; err: number }> }) {
  const max = Math.max(...points.map((p) => p.value + p.err)) * 1.1;
  return (
    <div>
      <div className="flex h-[180px] items-end gap-3 border-b border-ink-500 pt-6">
        {points.map((p) => (
          <div key={p.label} className="relative flex h-full flex-1 flex-col justify-end">
            <div className="relative bg-exploit/80" style={{ height: `${(p.value / max) * 100}%` }} />
            <span className="absolute left-1/2 w-px bg-ink-100" style={{ bottom: `${((p.value - p.err) / max) * 100}%`, height: `${((2 * p.err) / max) * 100}%` }} />
            <span className="tabular absolute left-1/2 -translate-x-1/2 font-mono text-[11px] text-ink-200" style={{ bottom: `calc(${((p.value + p.err) / max) * 100}% + 4px)` }}>
              {sign(p.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {points.map((p) => (
          <span key={p.label} className="flex-1 text-center font-mono text-[10.5px] text-ink-400">
            {p.label}
          </span>
        ))}
      </div>
      <div className="mt-1 text-center font-mono text-[10px] tracking-[0.06em] text-ink-500">HAND NUMBER IN THE SESSION</div>
    </div>
  );
}
