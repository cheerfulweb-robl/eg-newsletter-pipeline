import React from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

// Design B motion primitives. Short (200–300ms) fade/slide reveals on scroll.
// Under prefers-reduced-motion everything renders statically (no initial hidden state).
// Uses LazyMotion + `m` so only the DOM animation feature set is bundled, not full `motion`.

const EASE = [0.22, 1, 0.36, 1];

// Reveal as soon as any part is on screen. A share of the element's own size (0.1, 0.15) never
// triggers for a row or section many times larger than the screen, e.g. the weekend carousel on a phone.
const IN_VIEW = { once: true, amount: 'some', margin: '0px 0px -40px 0px' };

export function Reveal({ as = 'div', delay = 0, y = 18, className = '', children, ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className} {...rest}>{children}</Tag>;
  }
  const MotionTag = m[as] || m.div;
  return (
    <LazyMotion features={domAnimation}>
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={IN_VIEW}
      transition={{ duration: 0.28, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </MotionTag>
    </LazyMotion>
  );
}

const groupVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
};

export function Stagger({ as = 'div', className = '', children, ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className} {...rest}>{children}</Tag>;
  }
  const MotionTag = m[as] || m.div;
  return (
    <LazyMotion features={domAnimation}>
    <MotionTag
      className={className}
      variants={groupVariants}
      initial="hidden"
      whileInView="show"
      viewport={IN_VIEW}
      {...rest}
    >
      {children}
    </MotionTag>
    </LazyMotion>
  );
}

export function StaggerItem({ as = 'div', className = '', children, ...rest }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className} {...rest}>{children}</Tag>;
  }
  const MotionTag = m[as] || m.div;
  return (
    <LazyMotion features={domAnimation}>
    <MotionTag className={className} variants={itemVariants} {...rest}>
      {children}
    </MotionTag>
    </LazyMotion>
  );
}
