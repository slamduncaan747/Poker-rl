import { useEffect } from 'react';

/**
 * Otto is built to live as a section of a larger site, in an iframe:
 *
 *   <iframe src="https://slamduncaan747.github.io/Poker-rl/?embed" style="width:100%;border:0"></iframe>
 *
 * When embedded (inside a frame, or with `?embed`), it drops the full-page
 * chrome, leaves the host's scroll alone and reports its height to the host
 * with `postMessage({ type: 'otto:height', height })` so the frame can size
 * itself to the content.
 */
export const embedded = (() => {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top || new URLSearchParams(window.location.search).has('embed');
  } catch {
    return true;
  }
})();

export function useReportHeight() {
  useEffect(() => {
    if (!embedded || window.parent === window) return;
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
