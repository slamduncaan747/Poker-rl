import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { usePlay } from '../../lib/store';

const STEPS = [
  {
    icon: 'I',
    title: 'It starts balanced',
    body: 'Its default strategy is a game-theory equilibrium computed by self-play. Nobody can beat it in the long run.',
  },
  {
    icon: 'II',
    title: 'It watches you',
    body: 'Every hand, it updates its read on your habits: how often you fold, bluff, or call. See it in “Your profile”.',
  },
  {
    icon: 'III',
    title: 'It adapts',
    body: 'A reinforcement-learned layer shifts its play to punish your habits, and tells you why in “AI’s thinking”.',
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
            <div className="eyebrow">Heads-up No-Limit Hold’em · 100 big blinds deep</div>
            <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.05]">
              Can you beat an AI that <span className="text-gradient italic">learns your weaknesses?</span>
            </h2>
            <p className="mt-3 max-w-[520px] text-[14px] leading-relaxed text-ink-300">
              A fair game: both players get the same blinds and stacks, the deck is shuffled with cryptographic randomness, and the AI only sees its own two cards
              and the board.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <motion.div key={s.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1 }} className="rounded-2xl bg-white/[0.025] p-4 ring-1 ring-gold/10">
                  <div className="font-display text-2xl font-semibold text-gold">{s.icon}</div>
                  <div className="mt-2 text-sm font-semibold text-ink-100">{s.title}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{s.body}</div>
                </motion.div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="hidden text-[12px] text-ink-500 sm:block">Tip: keys F, C and R fold, call and raise; Space deals.</div>
              <div className="flex gap-2">
                <a href="#how" onClick={() => close(false)} className="btn rounded-xl bg-white/5 px-4 py-2.5 text-sm text-ink-200 ring-1 ring-white/10 hover:bg-white/10">
                  How it works
                </a>
                <button onClick={() => close(true)} className="btn btn-gold rounded-xl px-6 py-2.5 text-sm">
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
