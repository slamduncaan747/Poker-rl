import { useEffect } from 'react';

/**
 * Otto is built to live as a section of a larger site, in an iframe:
 *
 *   <iframe src="https://slamduncaan747.github.io/Poker-rl/?embed" style="width:100%;height:100vh;border:0"></iframe>
 *
 * Embedded (inside a frame, or with `?embed`), it drops the footer credits.
 * By default the frame is a fixed-height window that scrolls inside, like a
 * page of its own. With `?embed=auto` it instead reports its content height
 * to the host with `postMessage({ type: 'otto:height', height })` so the
 * frame can grow to fit and the host page does the scrolling.
 */
export const embedded = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top || new URLSearchParams(window.location.search).has('embed');
  } catch {
    return true;
  }
})();

/** Embedded with `?embed=auto`: the host sizes the frame to the content. */
export const autosize = (() => {
  if (typeof window === 'undefined') return false;
  return embedded && new URLSearchParams(window.location.search).get('embed') === 'auto';
})();

export function useReportHeight() {
  useEffect(() => {
    if (!autosize || window.parent === window) return;
    // measure the app itself: the document never reports less than the frame's current height, so it could only grow
    const root = document.getElementById('root');
    if (!root) return;
    const post = () => window.parent.postMessage({ type: 'otto:height', height: Math.ceil(root.getBoundingClientRect().height) }, '*');
    const ro = new ResizeObserver(post);
    ro.observe(root);
    post();
    return () => ro.disconnect();
  }, []);
}
