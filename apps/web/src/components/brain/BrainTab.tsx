import { GROUPS, STREET_NAMES } from '@poker-rl/engine';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { pct } from '../../lib/format';
import { type BotDecisionView, usePlay } from '../../lib/store';
import { StrategyCompare } from '../charts/StrategyCompare';
import { GROUP_COLORS } from '../table/ActionBar';
import { BotAvatar } from '../table/Table';

export function BrainTab() {
  const current = usePlay((s) => s.botDecisions);
  const last = usePlay((s) => s.history[s.history.length - 1]);
  const phase = usePlay((s) => s.phase);
  const decisions = current.length > 0 ? current : (last?.botDecisions ?? []);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [decisions.length]);
  const d = sel !== null ? decisions.find((x) => x.id === sel) : decisions[decisions.length - 1];

  if (!d) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
        <BotAvatar thinking={phase === 'bot'} size={64} />
        <div className="max-w-[300px] text-sm text-ink-300">
          Every time Poker RL acts, its reasoning appears here: the <span className="text-gto-hi">GTO blueprint</span> mix, how the{' '}
          <span className="text-exploit-hi">RL exploit layer</span> tilts it based on its read of you, and which of your tendencies drove the change.
        </div>
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
              className={`rounded-lg px-2 py-1 text-[11px] ring-1 transition ${
                x.id === d.id ? 'bg-white/10 text-ink-100 ring-white/20' : 'text-ink-400 ring-white/5 hover:text-ink-200'
              }`}
            >
              {STREET_NAMES[x.street]} · {x.label}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          <DecisionView d={d} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function DecisionView({ d }: { d: BotDecisionView }) {
  const { info, explanation: ex } = d;
  const nBuckets = info.street === 0 ? 169 : 32;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Street" value={STREET_NAMES[info.street]} />
        <Stat label="Hand strength" value={`${pct(info.strength)}`} sub={info.street === 0 ? 'preflop class' : `bucket ${info.bucket + 1}/${nBuckets}`} />
        <Stat label="Exploit gate λ" value={info.lambda.toFixed(2)} sub={info.found ? 'infoset found' : 'nearest infoset'} accent={info.lambda > 0} />
      </div>

      <div
        className={`rounded-xl p-3 ring-1 ${
          ex.tone === 'exploit' ? 'bg-exploit/10 ring-exploit/30' : ex.tone === 'gto' ? 'bg-gto/10 ring-gto/30' : 'bg-white/[0.03] ring-white/10'
        }`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-widest text-ink-400">Decision · {d.label}</div>
        <div className={`mt-1 font-display text-[15px] font-semibold ${ex.tone === 'exploit' ? 'text-exploit-hi' : ex.tone === 'gto' ? 'text-gto-hi' : 'text-ink-100'}`}>
          {ex.headline}
        </div>
        {ex.reasons.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="text-[10px] uppercase tracking-widest text-ink-400">Because your tendencies show</div>
            {ex.reasons.map((r) => (
              <div key={r.stat} className="flex items-center gap-2 text-[12px]">
                <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-exploit" style={{ width: `${Math.min(100, (r.weight / ex.reasons[0].weight) * 100)}%` }} />
                </div>
                <span className="font-semibold text-ink-100">{r.label}</span>
                <span className="truncate text-ink-400">{r.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Action probabilities</div>
        <StrategyCompare
          rows={info.codes.map((c, i) => ({ code: c, to: info.actions[i].action.to, gto: info.blueprint[i], final: info.final[i], chosen: i === info.chosen }))}
          showFinal={info.lambda > 0}
        />
      </div>

      {info.lambda > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">Policy-network tilt Δ by action group</div>
          <div className="grid grid-cols-4 gap-1.5">
            {GROUPS.map((g, i) => {
              const avail = info.groupBlueprint[i] > 0 || info.codes.some((c) => groupIdx(c) === i);
              const delta = info.delta[i] * info.lambda;
              return (
                <div key={g} className={`rounded-lg bg-white/[0.03] p-2 text-center ring-1 ring-white/5 ${avail ? '' : 'opacity-30'}`}>
                  <div className="flex items-center justify-center gap-1 text-[10px] text-ink-400">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GROUP_COLORS[i] }} />
                    {g}
                  </div>
                  <div className={`tabular font-mono text-sm font-semibold ${delta > 0.05 ? 'text-exploit-hi' : delta < -0.05 ? 'text-gto-hi' : 'text-ink-300'}`}>
                    ×{Math.exp(delta).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="truncate font-mono text-[10px] text-ink-500" title="Blueprint infoset key">
        infoset {info.key}
      </div>
    </>
  );
}

function groupIdx(c: string) {
  return c === 'f' ? 0 : c === 'k' || c === 'c' ? 1 : c === 't' || c === 'h' ? 2 : 3;
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-2 ring-1 ring-white/5">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`tabular font-display text-[15px] font-semibold ${accent ? 'text-exploit-hi' : 'text-ink-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-500">{sub}</div>}
    </div>
  );
}
