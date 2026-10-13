import { GROUPS, STREET_NAMES } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { pct } from '../../lib/format';
import { type BotDecisionView, usePlay } from '../../lib/store';
import { StrategyCompare } from '../charts/StrategyCompare';
import { GROUP_COLORS } from '../table/ActionBar';
import { BotAvatar } from '../table/Table';
import { HandReview } from './HandReview';

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

  const handNo = usePlay((s) => s.handNo);
  const review = phase === 'over' && last && last.id === handNo ? <HandReview h={last} /> : null;

  if (!d) {
    if (review) return review;
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
        <BotAvatar thinking={phase === 'bot'} size={48} />
        <div className="font-mono text-[11px] tracking-[0.08em] text-ink-400">ITS REASONING SHOWS HERE</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {review}
      {review && <div className="mt-2 border-t border-ink-600 pt-3 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">ITS DECISIONS</div>}
      {decisions.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {decisions.map((x) => (
            <button
              key={x.id}
              onClick={() => setSel(x.id)}
              className={`min-h-[30px] border px-2 font-mono text-[10.5px] uppercase tracking-[0.06em] transition ${
                x.id === d.id ? 'border-ink-100 text-ink-100' : 'border-ink-600 text-ink-400 hover:text-ink-100'
              }`}
            >
              {STREET_NAMES[x.street]} · {x.label}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          <DecisionView d={d} revealed={revealed} fromLastHand={current.length === 0 && phase !== 'over' && phase !== 'idle'} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function DecisionView({ d, revealed, fromLastHand, compact }: { d: BotDecisionView; revealed: boolean; fromLastHand: boolean; compact?: boolean }) {
  const { info, explanation: ex } = d;
  const [details, setDetails] = useState(false);
  const adapting = ex.tone === 'exploit';
  return (
    <>
      <div>
        <div className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.08em]">
          <span className={adapting ? 'text-gold' : 'text-ink-400'}>
            {fromLastHand ? 'LAST HAND · ' : ''}
            {STREET_NAMES[info.street].toUpperCase()} · {adapting ? 'ADAPTING' : 'BALANCED'}
          </span>
        </div>
        <div className="mt-1 text-[22px] font-extrabold leading-tight">{d.label}</div>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-200">{ex.headline}</p>
        {ex.reasons.slice(0, 1).map((r) => (
          <p key={r.stat} className={`mt-2 border-l-2 pl-3 text-[13px] leading-snug ${adapting ? 'border-gold text-ink-300' : 'border-ink-500 text-ink-300'}`}>
            {r.sentence}
          </p>
        ))}
      </div>

      {revealed ? (
        <div className="border border-ink-600 p-3.5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="eyebrow">This spot</div>
            <div className="text-[12px] text-ink-300">
              Its hand: <span className="font-semibold text-ink-100">{strengthWord(info.strength)}</span>
            </div>
          </div>
          <MixBar label="Balanced" values={info.groupBlueprint} />
          {info.lambda > 0 && <MixBar label="Against you" values={info.groupFinal} />}
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-400">
            {GROUPS.map((g, i) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="h-2 w-2" style={{ background: GROUP_COLORS[i] }} />
                {g}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 border border-dashed border-ink-600 px-3 py-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          ITS HAND UNLOCKS AFTER THE HAND
        </div>
      )}

      {revealed && !compact && (
        <div>
          <button onClick={() => setDetails((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-400 hover:text-ink-200">
            <span className={`inline-block transition ${details ? 'rotate-90' : ''}`}>›</span> <span className="font-mono text-[10.5px] tracking-[0.08em]">DETAILS</span>
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
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-400">{label}</div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden">
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
