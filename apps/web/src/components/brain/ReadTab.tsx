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
      <div className="border border-ink-100 p-4">
        <div className="eyebrow">{early ? 'First read' : 'Reads you as'}</div>
        <div className="mt-1.5 text-[30px] font-extrabold leading-none text-gold">{snap.hands < 8 ? 'Reading…' : top.name}</div>
        <p className="mt-2 text-[13.5px] leading-snug text-ink-300">{snap.hands < 8 ? `Leaning ${top.name}.` : `${ARCHETYPE_BLURB[top.id].split('. ')[0].replace(/\.$/, '')}.`}</p>
        <div className="mt-3 flex items-center gap-3 font-mono text-[10.5px] tracking-[0.06em] text-ink-400">
          <div className="h-[2px] flex-1 bg-ink-600">
            <motion.div className="h-full bg-gold" animate={{ width: `${Math.min(100, (snap.hands / 60) * 100)}%` }} />
          </div>
          <span className="tabular">{snap.hands} HANDS</span>
        </div>
      </div>

      <Leaks />

      <div>
        <div className="eyebrow mb-1">You vs balanced</div>
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
      <button onClick={() => setOpen((v) => !v)} className="flex min-h-[32px] items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400 hover:text-ink-100">
        <span className={`inline-block transition ${open ? 'rotate-90' : ''}`}>›</span> ALL 16 STATS
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
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-600" />
                    <div className="absolute top-0 h-3 w-px bg-ink-100" style={{ left: `${s.baseline * 100}%` }} />
                    <div
                      className="absolute top-1/2 h-1.5 -translate-y-1/2"
                      style={{ left: `${s.lo * 100}%`, width: `${Math.max(1, (s.hi - s.lo) * 100)}%`, background: strong ? 'var(--color-exploit)' : 'var(--color-ink-500)', opacity: 0.55 }}
                    />
                    <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 ring-2 ring-ink-900" style={{ left: `${s.mean * 100}%`, background: strong ? 'var(--color-exploit)' : 'var(--color-ink-300)' }} />
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
              <span className="inline-block h-3 w-px bg-ink-100" /> balanced
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-exploit" /> clearly different
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
      <div className="eyebrow mb-2">Your leaks</div>
      {leaks.length === 0 ? (
        <div className="border border-dashed border-ink-600 px-3 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">NONE FOUND YET</div>
      ) : (
        <div className="flex flex-col border border-ink-600">
          {leaks.map((l, i) => (
            <div key={l.key} className={`px-3.5 py-3 ${i > 0 ? 'border-t border-ink-600' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink-100">{STAT_INFO[l.key].label}</span>
                <span className="tabular font-mono text-[11.5px] text-gold">
                  {pct(l.mean)} <span className="text-ink-400">vs {pct(l.baseline)}</span>
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
