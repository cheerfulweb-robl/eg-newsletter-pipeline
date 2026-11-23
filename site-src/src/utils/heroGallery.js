// Layout math for the Home "clothesline" photo strip (components/HeroGallery.jsx).
// Frames are white polaroids: 60px tall on tablet/desktop, 35px on phones, one row that holds
// as many frames as fit, spaced evenly.

export const FRAME = {
  desktop: { height: 60, pad: 4, chin: 11, minGap: 14, sag: 9 },
  mobile: { height: 35, pad: 2, chin: 7, minGap: 8, sag: 6 },
};

// Frame width for a 4:5 portrait photo inside the white border.
export function frameWidth({ height, pad, chin }) {
  return Math.round((height - pad - chin) * 0.8 + 2 * pad);
}

// How many frames fit in one row of `width` px with at least `minGap` between them.
export function fitCount(width, frameW, minGap, available) {
  if (!(width > 0) || !(frameW > 0) || !(available > 0)) return 0;
  const n = Math.floor((width + minGap) / (frameW + minGap));
  return Math.max(0, Math.min(available, n));
}

// Drop below the line for frame i of n: deepest in the middle, like a real sagging line.
export function sagFor(i, n, depth) {
  if (n <= 1) return depth;
  const t = i / (n - 1);
  return +(depth * (1 - Math.pow(2 * t - 1, 2))).toFixed(1);
}

// Small fixed tilt per frame so the row looks hand-hung but stays the same on every visit.
const SWAYS = [-1.4, 1.1, -0.7, 1.8, -1.1, 0.7, -1.8, 1.4, -0.4, 1.1, -1.4, 0.7];
export function swayFor(i) {
  return SWAYS[i % SWAYS.length];
}

export const DEFAULT_HOVER_TEXT = 'Send us your images!';
