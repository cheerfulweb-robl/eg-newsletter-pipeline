import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop component for React Router
 * Ensures navigating from page to page immediately resets the scroll position
 * to the very top across all desktop, tablet, and mobile browsers (including iOS Safari).
 */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    // Disable automatic browser scroll restoration so it doesn't restore previous scroll position
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // If navigating to an anchor hash (e.g. #faq), scroll to that element
    if (hash) {
      const targetId = hash.replace('#', '');
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    const scrollToTopImmediate = () => {
      try {
        window.scrollTo(0, 0);
      } catch (_) {}
      if (document.documentElement) {
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
      }
      if (document.body) {
        document.body.scrollTop = 0;
        document.body.scrollLeft = 0;
      }
      const root = document.getElementById('root');
      if (root) {
        root.scrollTop = 0;
        root.scrollLeft = 0;
      }
    };

    // 1. Immediate reset
    scrollToTopImmediate();

    // 2. Next animation frame (after React reconciliation)
    const rafId = requestAnimationFrame(scrollToTopImmediate);

    // 3. Short timeouts to handle async layout shifts on iOS Safari / iPad
    const t1 = setTimeout(scrollToTopImmediate, 50);
    const t2 = setTimeout(scrollToTopImmediate, 150);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname, search, hash]);

  return null;
}
