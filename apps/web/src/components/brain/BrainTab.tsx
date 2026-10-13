import { GROUPS, STREET_NAMES } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { pct } from '../../lib/format';
import { type BotDecisionView, usePlay } from '../../lib/store';
import { StrategyCompare } from '../charts/StrategyCompare';
import { GROUP_COLORS } from '../table/ActionBar';
import { BotAvatar } from '../table/Table';

/** Words for the bot's hand-strength percentile, shown only after the hand. */
function strengthWord(p: number) {
  if (p >= 0.9) return 'Very strong';
  if (p >= 0.7) return 'Strong';
  if (p >= 0.45) return 'Medium';
  if (p >= 0.2) return 'Weak';
  return 'Very weak';
}

export function BrainTab() {
  const current = usePlay((s) => s.botDecisions);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const phase = usePlay((s) => s.phase);
  const showBotCards = usePlay((s) => s.settings.showBotCards);
  const decisions = current.length > 0 ? current : (last?.botDecisions ?? []);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [decisions.length]);
  const d = sel !== null ? decisions.find((x) => x.id === sel) : decisions[decisions.length - 1];
  // Revealing the bot's odds mid-hand would leak its cards; unlock once the hand is over.
  const revealed = phase === 'over' || phase === 'idle' || showBotCards || current.length === 0;

  if (!d) {
    return (
      <div className="flex flex-col items-center gap-5 px-4 py-12 text-center">
        <BotAvatar thinking={phase === 'bot'} size={64} />
        <div className="font-display text-2xl font-semibold text-ink-100">The AI's reasoning appears here</div>
        <p className="max-w-[300px] text-[13.5px] leading-relaxed text-ink-300">
          After each of its moves you'll see what it decided, whether it's playing the balanced strategy or adapting to you, and which of your habits
          it's reacting to.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {decisions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {decisions.map((x) => (
            <button
              key={x.id}
              onClick={() => setSel(x.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] ring-1 transition ${
                x.id === d.id ? 'bg-gold/15 text-gold-hi ring-gold/40' : 'text-ink-400 ring-white/10 hover:text-ink-200'
              }`}
            >
              {STREET_NAMES[x.street]} · {x.label}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          <DecisionView d={d} revealed={revealed} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function DecisionView({ d, revealed }: { d: BotDecisionView; revealed: boolean }) {
  const { info, explanation: ex } = d;
  const [details, setDetails] = useState(false);
  const adapting = ex.tone === 'exploit';
  return (
    <>
      <div className="flex items-center gap-3">
        <BotAvatar thinking={false} size={40} />
        <div>
          <div className="eyebrow">{STREET_NAMES[info.street]} decision</div>
          <div className="font-display text-[26px] font-semibold leading-tight text-ink-100">{d.label}</div>
        </div>
      </div>

      <div className={`rounded-2xl p-4 ring-1 ${adapting ? 'bg-exploit/[0.07] ring-exploit/25' : 'bg-white/[0.03] ring-white/10'}`}>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${adapting ? 'bg-exploit/20 text-exploit-hi' : 'bg-gto/15 text-gto-hi'}`}>
            {adapting ? 'Adapting to you' : 'Balanced play'}
          </span>
        </div>
        <p className="mt-2.5 text-[15px] font-medium leading-snug text-ink-100">{ex.headline}</p>
        {ex.reasons.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {ex.reasons.map((r) => (
              <li key={r.stat} className="flex gap-2.5 text-[13px] leading-snug text-ink-300">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-exploit" />
                {r.sentence}
              </li>
            ))}
          </ul>
        )}
      </div>

      {revealed ? (
        <div className="rounded-2xl bg-white/[0.02] p-4 ring-1 ring-white/[0.06]">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="eyebrow">How it played this spot</div>
            <div className="text-[12px] text-ink-300">
              Its hand: <span className="font-semibold text-ink-100">{strengthWord(info.strength)}</span>
            </div>
          </div>
          <MixBar label="Balanced strategy" values={info.groupBlueprint} />
          {info.lambda > 0 && <MixBar label="Against you" values={info.groupFinal} />}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-400">
            {GROUPS.map((g, i) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: GROUP_COLORS[i] }} />
                {g}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl bg-white/[0.02] p-4 text-[12.5px] leading-relaxed text-ink-400 ring-1 ring-white/[0.06]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 shrink-0 text-gold">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Its hand strength and exact odds unlock when the hand ends, so this panel never gives its cards away.
        </div>
      )}

      {revealed && (
        <div>
          <button onClick={() => setDetails((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-400 hover:text-ink-200">
            <span className={`inline-block transition ${details ? 'rotate-90' : ''}`}>›</span> Technical details
          </button>
          <AnimatePresence>
            {details && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 flex flex-col gap-4">
                  <StrategyCompare
                    rows={info.codes.map((c, i) => ({ code: c, to: info.actions[i].action.to, gto: info.blueprint[i], final: info.final[i], chosen: i === info.chosen }))}
                    showFinal={info.lambda > 0}
                  />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
                    <dt className="text-ink-400">Hand-strength percentile</dt>
                    <dd className="tabular text-right font-mono text-ink-200">{pct(info.strength)}</dd>
                    <dt className="text-ink-400">Card bucket</dt>
                    <dd className="tabular text-right font-mono text-ink-200">{info.street === 0 ? 'preflop class' : `${info.bucket + 1} / 32`}</dd>
                    <dt className="text-ink-400">Exploit gate λ</dt>
                    <dd className="tabular text-right font-mono text-ink-200">{info.lambda.toFixed(2)}</dd>
                    {GROUPS.map((g, i) => (
                      <div key={g} className="contents">
                        <dt className="text-ink-400">Tilt · {g}</dt>
                        <dd className="tabular text-right font-mono text-ink-200">×{Math.exp(info.delta[i] * info.lambda).toFixed(2)}</dd>
                      </div>
                    ))}
                    <dt className="text-ink-400">Infoset</dt>
                    <dd className="truncate text-right font-mono text-ink-300" title={info.key}>
                      {info.key}
                    </dd>
                  </dl>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

/** One stacked bar of the four action groups. */
function MixBar({ label, values }: { label: string; values: number[] }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11.5px] text-ink-300">{label}</div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {values.map((v, i) =>
          v > 0.004 ? (
            <motion.div
              key={i}
              title={`${GROUPS[i]} ${pct(v)}`}
              initial={{ width: 0 }}
              animate={{ width: `${v * 100}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 22 }}
              style={{ background: GROUP_COLORS[i] }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
