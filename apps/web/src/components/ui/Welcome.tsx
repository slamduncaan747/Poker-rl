import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { usePlay } from '../../lib/store';

const STEPS = [
  {
    icon: '⚖️',
    title: 'It starts unexploitable',
    body: 'A Monte Carlo CFR blueprint — an approximate Nash equilibrium for heads-up no-limit hold’em — is the bot’s default strategy.',
  },
  {
    icon: '🔍',
    title: 'It studies you',
    body: 'Every hand updates a Bayesian model of 16 of your tendencies. Watch it form a read in the “Read on You” tab.',
  },
  {
    icon: '🎯',
    title: 'Then it exploits your leaks',
    body: 'A PPO-trained policy network tilts the blueprint toward the plays that punish your tendencies — and explains why in the AI X-Ray.',
  },
];

function seen(): boolean {
  try {
    return localStorage.getItem('pokerrl.welcome') === '1';
  } catch {
    return false;
  }
}

export function Welcome() {
  const [open, setOpen] = useState(() => !seen());
  const newHand = usePlay((s) => s.newHand);
  const close = (deal: boolean) => {
    try {
      localStorage.setItem('pokerrl.welcome', '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
    if (deal) newHand();
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div data-modal-open className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            className="glass w-full max-w-[640px] rounded-3xl p-6 sm:p-8"
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-ink-400">Heads-up No-Limit Hold’em</div>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight">
              Can you beat an AI that <span className="text-gradient">learns your weaknesses?</span>
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <motion.div key={s.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1 }} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/5">
                  <div className="text-2xl">{s.icon}</div>
                  <div className="mt-2 text-sm font-semibold text-ink-100">{s.title}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{s.body}</div>
                </motion.div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12px] text-ink-400">
                Keys: <span className="kbd">F</span> fold · <span className="kbd">C</span> check/call · <span className="kbd">R</span> raise · <span className="kbd">1-6</span> sizes ·{' '}
                <span className="kbd">Space</span> deal
              </div>
              <div className="flex gap-2">
                <a href="#how" onClick={() => close(false)} className="btn rounded-xl bg-white/5 px-4 py-2.5 text-sm text-ink-200 ring-1 ring-white/10 hover:bg-white/10">
                  How it works
                </a>
                <button onClick={() => close(true)} className="btn rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm text-amber-950 hover:from-amber-200">
                  Deal me in
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
