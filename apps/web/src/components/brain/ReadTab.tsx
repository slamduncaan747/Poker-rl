import { type OpponentSnapshot, STAT_INFO, type StatKey, matchArchetypes } from '@poker-rl/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
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

  const top = matches[0];
  const early = snap.hands < 12;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-b from-gold/[0.10] to-transparent p-5 ring-1 ring-gold/20">
        <div className="eyebrow">{early ? 'First impression' : 'The AI reads you as'}</div>
        <div className="mt-1 font-display text-[32px] font-semibold leading-none text-gold-hi">{early && snap.hands < 3 ? 'Unknown' : top.name}</div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-300">
          {snap.hands < 3 ? 'Play a few hands. The AI starts by assuming you play perfectly balanced poker and updates as it watches.' : ARCHETYPE_BLURB[top.id]}
        </p>
        <div className="mt-4 flex items-center gap-3 text-[11.5px] text-ink-400">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <motion.div className="h-full rounded-full bg-gold" animate={{ width: `${Math.min(100, (snap.hands / 60) * 100)}%` }} />
          </div>
          <span>
            {snap.hands} hands observed · {early ? 'early read' : snap.hands < 60 ? 'firming up' : 'confident'}
          </span>
        </div>
      </div>

      <Leaks />

      <div>
        <div className="eyebrow mb-1">Your style vs balanced play</div>
        <RadarChart axes={axes} baseName="Balanced" />
      </div>

      <AllStats snap={snap} />
    </div>
  );
}

function AllStats({ snap }: { snap: OpponentSnapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-400 hover:text-ink-200">
        <span className={`inline-block transition ${open ? 'rotate-90' : ''}`}>›</span> All 16 statistics
      </button>
      {open && (
        <div className="mt-3">
          <div className="flex flex-col gap-1">
            {snap.stats.map((s) => {
              const dev = s.mean - s.baseline;
              const strong = s.lo > s.baseline || s.hi < s.baseline;
              return (
                <div key={s.key} className="grid grid-cols-[104px_1fr_76px] items-center gap-2 text-[11.5px]" title={STAT_INFO[s.key].description}>
                  <span className="truncate text-ink-300">{STAT_INFO[s.key].label}</span>
                  <div className="relative h-3">
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
                    <div className="absolute top-0 h-3 w-px bg-gto" style={{ left: `${s.baseline * 100}%` }} />
                    <div
                      className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                      style={{ left: `${s.lo * 100}%`, width: `${Math.max(1, (s.hi - s.lo) * 100)}%`, background: strong ? 'var(--color-exploit)' : 'var(--color-ink-500)', opacity: 0.55 }}
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
              <span className="inline-block h-3 w-px bg-gto" /> balanced frequency
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-exploit" /> clearly different (95% interval)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Leaks() {
  const bot = usePlay((s) => s.bot);
  usePlay((s) => s.history.length);
  if (!bot) return null;
  const leaks = findLeaks(bot.model.snapshot()).slice(0, 3);
  return (
    <div>
      <div className="eyebrow mb-2">What it has noticed</div>
      {leaks.length === 0 ? (
        <div className="rounded-xl bg-white/[0.03] p-3 text-[12px] text-ink-400 ring-1 ring-white/5">
          Nothing yet. A habit shows up here once the AI is confident it differs from balanced play.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {leaks.map((l) => (
            <div key={l.key} className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.07]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-100">{STAT_INFO[l.key].label}</span>
                <span className={`text-[11.5px] font-semibold ${l.direction === 'high' ? 'text-exploit-hi' : 'text-gto-hi'}`}>
                  {pct(l.mean)} <span className="font-normal text-ink-400">vs {pct(l.baseline)} balanced</span>
                </span>
              </div>
              <div className="mt-1 text-[12.5px] leading-snug text-ink-300">{l.advice}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
