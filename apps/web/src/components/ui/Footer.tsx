/** Quiet credits: who built it and where to find the code. */
export const AUTHOR = {
  name: 'Duncan Larzelere',
  github: 'https://github.com/slamduncaan747',
  repo: 'https://github.com/slamduncaan747/Poker-rl',
  x: 'https://x.com/duncanlarz',
  email: 'duncan.larzelere@gmail.com',
};

export function Footer() {
  return (
    <footer className="border-t border-ink-600">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 font-mono text-[11px] tracking-[0.06em] text-ink-500 lg:px-6">
        <span>
          BUILT BY <span className="text-ink-300">{AUTHOR.name.toUpperCase()}</span>
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Links">
          <a href={AUTHOR.repo} target="_blank" rel="noreferrer" className="hover:text-ink-100">
            SOURCE
          </a>
          <a href={AUTHOR.github} target="_blank" rel="noreferrer" className="hover:text-ink-100">
            GITHUB
          </a>
          <a href={AUTHOR.x} target="_blank" rel="noreferrer" className="hover:text-ink-100">
            X
          </a>
          <a href={`mailto:${AUTHOR.email}`} className="hover:text-ink-100">
            EMAIL
          </a>
        </nav>
      </div>
    </footer>
  );
}
