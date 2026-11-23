import React from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from 'framer-motion';

// Home background shimmer: a soft diagonal band of light that sweeps down the screen
// as the page scrolls (one pass about every 1.6 screens). It is scroll-linked, so it
// only moves while the visitor scrolls. Transform-only, pointer-events none, sits
// under the sticky header (z-50) and mobile tab bar (z-40). Off under reduced motion.
export default function ScrollSheen() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, (v) => {
    const vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800;
    const period = vh * 1.6;
    const progress = (v % period) / period;
    return -0.6 * vh + progress * 2.2 * vh;
  });
  if (reduce) return null;
  return (
    <LazyMotion features={domAnimation}>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        <m.div
          style={{ y, rotate: -12 }}
          className="absolute -left-1/4 top-0 w-[150%] h-[32vh] will-change-transform bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.07)_28%,rgba(255,255,255,0.26)_47%,rgba(255,224,140,0.22)_56%,rgba(255,255,255,0.06)_74%,transparent_100%)]"
        />
      </div>
    </LazyMotion>
  );
}
