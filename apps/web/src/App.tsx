import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { usePlay } from './lib/store';
import { PlayPage } from './pages/PlayPage';

const ArenaPage = lazy(() => import('./pages/ArenaPage').then((m) => ({ default: m.ArenaPage })));
const LabPage = lazy(() => import('./pages/LabPage').then((m) => ({ default: m.LabPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));

type Route = 'play' | 'arena' | 'lab' | 'how';
const ROUTES: Array<{ id: Route; label: string; short: string }> = [
  { id: 'play', label: 'Play', short: 'Play' },
  { id: 'arena', label: 'Arena', short: 'Arena' },
  { id: 'lab', label: 'Strategy Lab', short: 'Lab' },
  { id: 'how', label: 'How it works', short: 'How' },
];

function readRoute(): Route {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.some((r) => r.id === h) ? h : 'play';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const init = usePlay((s) => s.init);
  const phase = usePlay((s) => s.phase);
  useEffect(() => {
    void init();
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [init]);

  return (
    <div className="app-bg min-h-screen">
      <Header route={route} />
      {phase === 'loading' || phase === 'error' ? (
        <Loading />
      ) : (
        <AnimatePresence mode="wait">
          <motion.main key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Suspense fallback={<div className="p-10 text-center text-ink-400">Loading…</div>}>
              {route === 'play' && <PlayPage />}
              {route === 'arena' && <ArenaPage />}
              {route === 'lab' && <LabPage />}
              {route === 'how' && <AboutPage />}
            </Suspense>
          </motion.main>
        </AnimatePresence>
      )}
    </div>
  );
}

function Header({ route }: { route: Route }) {
  return (
    <header style={{ top: 'env(safe-area-inset-top, 0px)' }} className="sticky z-30 border-b border-gold/10 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-[1500px] items-center gap-4 px-4 lg:px-6">
        <a href="#play" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-full text-[17px] text-gold-hi ring-1 ring-gold/50" style={{ background: 'radial-gradient(circle at 35% 30%, #2a2418, #0c0e0d)' }}>
            ♠
          </div>
          <div className="leading-tight">
            <div className="whitespace-nowrap font-display text-[21px] font-semibold tracking-tight text-ink-100">
              Poker <span className="text-gradient">RL</span>
            </div>
            <div className="hidden text-[10.5px] text-ink-400 sm:block">Game theory meets reinforcement learning</div>
          </div>
        </a>
        <nav className="ml-auto flex gap-1 overflow-x-auto">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] font-semibold transition ${route === r.id ? 'text-gold-hi' : 'text-ink-400 hover:text-ink-200'}`}
            >
              {route === r.id && <motion.span layoutId="nav-pill" className="absolute inset-x-2 -bottom-[13px] h-[2px] rounded-full bg-gold" />}
              <span className="relative hidden sm:inline">{r.label}</span>
              <span className="relative sm:hidden">{r.short}</span>
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Loading() {
  const p = usePlay((s) => s.loadProgress);
  const error = usePlay((s) => s.error);
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <div className="font-display text-3xl font-semibold">
          Poker <span className="text-gradient">RL</span>
        </div>
        {error ? (
          <div className="text-sm text-loss">Couldn't load the models: {error}</div>
        ) : (
          <>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <motion.div className="h-full rounded-full bg-gold" animate={{ width: `${Math.max(6, p * 100)}%` }} />
            </div>
            <div className="text-xs text-ink-400">Shuffling up and loading the AI…</div>
          </>
        )}
      </div>
    </div>
  );
}
