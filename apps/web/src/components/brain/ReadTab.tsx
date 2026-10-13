import { STAT_INFO, type StatKey, matchArchetypes } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { pct } from '../../lib/format';
import { findLeaks } from '../../lib/leaks';
import { usePlay } from '../../lib/store';
import { RadarChart } from '../charts/RadarChart';

const RADAR_KEYS: StatKey[] = ['vpip', 'pfr', 'threeBet', 'cbet', 'postBet', 'raiseVsBet', 'foldToBet', 'wtsd'];

export const ARCHETYPE_BLURB: Record<string, string> = {
  gto: 'Balanced and hard to exploit — the bot stays near equilibrium.',
  station: 'Calls too much. The bot value-bets thinner and bluffs less.',
  maniac: 'Bets and raises relentlessly. The bot calls down lighter and traps.',
  nit: 'Plays very few hands and folds under pressure. The bot steals and bluffs more.',
  tag: 'Solid and aggressive. Few leaks — the bot makes small adjustments.',
  lag: 'Loose and aggressive. The bot widens its calling and 3-betting ranges.',
  scared: 'Folds too often to aggression. The bot applies maximum pressure.',
  fish: 'Loose and passive. The bot isolates and value-bets relentlessly.',
};

/** What the bot believes about the human: Bayesian posteriors and archetype match. */
export function ReadTab() {
  const bot = usePlay((s) => s.bot);
  const models = usePlay((s) => s.models);
  usePlay((s) => s.history.length);
  if (!bot || !models) return null;
  const snap = bot.model.snapshot();
  const matches = matchArchetypes(bot.model, models.exploit.signatures).slice(0, 4);
  const axes = RADAR_KEYS.map((k) => {
    const s = snap.stats.find((x) => x.key === k)!;
    return {
      label: STAT_INFO[k].short,
      value: s.mean,
      baseline: s.baseline,
      lo: s.lo,
      hi: s.hi,
      detail: `${STAT_INFO[k].description} · n=${s.opps}`,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Bayesian read on you</div>
        <div className="text-xs text-ink-400">{snap.hands} hands observed</div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold text-ink-100">
          You play like…{' '}
          {snap.hands < 10 && <span className="text-xs font-normal text-ink-400">(early read — play more hands)</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          {matches.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-[12px]">
              <span className={i === 0 ? 'font-semibold text-ink-100' : 'text-ink-300'}>{m.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: i === 0 ? 'var(--color-exploit)' : 'var(--color-ink-500)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${m.prob * 100}%` }}
                />
              </div>
              <span className="tabular text-right font-mono text-ink-300">{pct(m.prob)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[12px] text-ink-400">{ARCHETYPE_BLURB[matches[0].id]}</div>
      </div>

      <RadarChart axes={axes} />

      <Leaks />

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Posterior tendencies (95% credible interval)</div>
        <div className="flex flex-col gap-1">
          {snap.stats.map((s) => {
            const dev = s.mean - s.baseline;
            const strong = s.lo > s.baseline || s.hi < s.baseline;
            return (
              <div key={s.key} className="grid grid-cols-[104px_1fr_76px] items-center gap-2 text-[11.5px]" title={STAT_INFO[s.key].description}>
                <span className="truncate text-ink-300">{STAT_INFO[s.key].label}</span>
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                  <div className="absolute top-0 h-3 w-px bg-gto" style={{ left: `${s.baseline * 100}%` }} title="GTO baseline" />
                  <div
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${s.lo * 100}%`,
                      width: `${Math.max(1, (s.hi - s.lo) * 100)}%`,
                      background: strong ? 'var(--color-exploit)' : 'var(--color-ink-500)',
                      opacity: 0.55,
                    }}
                  />
                  <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-900" style={{ left: `${s.mean * 100}%`, background: strong ? 'var(--color-exploit)' : 'var(--color-ink-300)' }} />
                </div>
                <span className={`tabular text-right font-mono ${strong ? (dev > 0 ? 'text-exploit-hi' : 'text-gto-hi') : 'text-ink-400'}`}>
                  {pct(s.mean)} <span className="text-ink-500">n{s.opps}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10.5px] text-ink-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-px bg-gto" /> GTO baseline
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-exploit" /> credibly different from GTO
          </span>
        </div>
      </div>
    </div>
  );
}

function Leaks() {
  const bot = usePlay((s) => s.bot);
  usePlay((s) => s.history.length);
  if (!bot) return null;
  const leaks = findLeaks(bot.model.snapshot()).slice(0, 4);
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Leaks the bot is targeting</div>
      {leaks.length === 0 ? (
        <div className="rounded-xl bg-white/[0.03] p-3 text-[12px] text-ink-400 ring-1 ring-white/5">
          No statistically credible leaks yet. A tendency appears here once its 95% credible interval excludes the GTO frequency.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leaks.map((l) => (
            <div key={l.key} className="rounded-xl bg-exploit/[0.07] p-3 ring-1 ring-exploit/20">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="font-semibold text-ink-100">
                  {STAT_INFO[l.key].label} {l.direction === 'high' ? '↑' : '↓'}
                </span>
                <span className="tabular font-mono text-ink-400">
                  {pct(l.mean)} vs {pct(l.baseline)} · n{l.opps}
                </span>
              </div>
              <div className="mt-1 text-[12px] leading-snug text-ink-300">{l.advice}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
