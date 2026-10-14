import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { usePlay } from './lib/store';
import { OttoFace } from './components/table/Otto';
import { autosize, hostNav, postRoute, useReportHeight } from './lib/embed';
import { PlayPage } from './pages/PlayPage';

const ArenaPage = lazy(() => import('./pages/ArenaPage').then((m) => ({ default: m.ArenaPage })));
const StylePage = lazy(() => import('./pages/StylePage').then((m) => ({ default: m.StylePage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));

type Route = 'play' | 'you' | 'arena' | 'how';
const ROUTES: Array<{ id: Route; label: string; short: string }> = [
  { id: 'play', label: 'Play', short: 'Play' },
  { id: 'you', label: 'Your style', short: 'You' },
  { id: 'arena', label: 'Arena', short: 'Arena' },
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
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    // the host page can switch views
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'otto:navigate' && ROUTES.some((r) => r.id === e.data.route)) window.location.hash = e.data.route;
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('message', onMessage);
    };
  }, [init]);

  useEffect(() => postRoute(route), [route]);

  useReportHeight();

  return (
    <div className={`app-bg ${autosize ? '' : 'min-h-screen'}`}>
      {!hostNav && <Header route={route} />}
      {phase === 'loading' || phase === 'error' ? (
        <Loading />
      ) : (
        <AnimatePresence mode="wait">
          <motion.main key={route} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <Suspense fallback={<div className="p-10 text-center text-ink-400">Loading…</div>}>
              {route === 'play' && <PlayPage />}
              {route === 'you' && <StylePage />}
              {route === 'arena' && <ArenaPage />}
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
    <header style={{ top: 'env(safe-area-inset-top, 0px)' }} className={`${autosize ? '' : 'sticky'} z-30 border-b border-ink-600 bg-ink-950`}>
      <div className="mx-auto flex h-[54px] max-w-[1400px] items-center gap-4 px-4 lg:px-6">
        <a href="#play" className="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-extrabold text-ink-100" aria-label="Otto">
          <OttoFace mood="idle" size={26} />
          <span className="hidden sm:inline">Otto</span>
        </a>
        <nav className="ml-auto flex gap-0.5 overflow-x-auto font-mono text-[12px] tracking-[0.08em] sm:ml-6">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              aria-current={route === r.id ? 'page' : undefined}
              className={`relative whitespace-nowrap px-2.5 py-[17px] uppercase transition ${route === r.id ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100'}`}
            >
              {route === r.id && <motion.span layoutId="nav-pill" className="absolute inset-x-2 bottom-0 h-[2px] bg-gold" />}
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
        <OttoFace mood="thinking" size={48} />
        {error ? (
          <div className="text-sm text-loss">Couldn't load the models: {error}</div>
        ) : (
          <>
            <div className="h-[2px] w-full overflow-hidden bg-ink-600">
              <motion.div className="h-full bg-gold" animate={{ width: `${Math.max(6, p * 100)}%` }} />
            </div>
            <div className="font-mono text-[11px] tracking-[0.08em] text-ink-400">LOADING THE AI</div>
          </>
        )}
      </div>
    </div>
  );
}
