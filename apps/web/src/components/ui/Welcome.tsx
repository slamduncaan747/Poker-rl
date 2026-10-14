import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { usePlay } from '../../lib/store';

const STEPS = [
  { n: 1, title: 'Play Otto', body: 'Heads-up poker against an AI.' },
  { n: 2, title: 'It reads you', body: 'Otto learns your habits as you play.' },
  { n: 3, title: 'See your style', body: 'Find out how exploitable you are.' },
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
        <motion.div data-modal-open className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            className="glass my-auto w-full max-w-[640px] p-5 sm:p-8"
          >
            <div className="eyebrow">Heads-up no-limit hold’em · $1/$2</div>
            <h2 className="mt-3 text-[30px] font-extrabold leading-[1.08] sm:text-[38px]">
              Beat Otto. <span className="text-gold">It learns your habits.</span>
            </h2>
            <div className="mt-6 grid border border-ink-600 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className={`flex gap-3 p-4 ${i > 0 ? 'border-t border-ink-600 sm:border-l sm:border-t-0' : ''}`}
                >
                  <span className={`balloon ${i === 2 ? 'text-gold' : ''}`}>{s.n}</span>
                  <div>
                    <div className="text-sm font-bold">{s.title}</div>
                    <div className="mt-0.5 text-[13px] text-ink-400">{s.body}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div />
              <div className="flex gap-2">
                <a href="#how" onClick={() => close(false)} className="btn min-h-[46px] border border-ink-100 px-5 text-sm hover:bg-ink-800">
                  How it works
                </a>
                <button onClick={() => close(true)} className="btn btn-gold min-h-[46px] px-8 text-sm">
                  Deal
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
