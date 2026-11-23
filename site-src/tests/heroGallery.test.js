import { describe, it, expect } from 'vitest';
import { FRAME, frameWidth, fitCount, sagFor, swayFor } from '../src/utils/heroGallery';

describe('hero gallery layout', () => {
  it('sizes frames 60px tall on desktop and 35px on phones (4:5 photo + white border)', () => {
    expect(FRAME.desktop.height).toBe(60);
    expect(FRAME.mobile.height).toBe(35);
    expect(frameWidth(FRAME.desktop)).toBe(44); // (60-4-11)*0.8 + 8
    expect(frameWidth(FRAME.mobile)).toBe(25); // (35-2-7)*0.8 + 4 = 24.8
  });

  it('fits as many frames as one row holds, never more than there are photos', () => {
    expect(fitCount(1344, 44, 14, 50)).toBe(23); // wide desktop row
    expect(fitCount(358, 25, 8, 50)).toBe(11); // 390px phone minus gutters
    expect(fitCount(1344, 44, 14, 6)).toBe(6); // only 6 photos
    expect(fitCount(0, 44, 14, 6)).toBe(0);
    expect(fitCount(1344, 44, 14, 0)).toBe(0);
  });

  it('sags most in the middle and least at the ends', () => {
    expect(sagFor(0, 5, 9)).toBe(0);
    expect(sagFor(4, 5, 9)).toBe(0);
    expect(sagFor(2, 5, 9)).toBe(9);
    expect(sagFor(1, 5, 9)).toBeCloseTo(6.8, 1);
    expect(sagFor(0, 1, 9)).toBe(9);
  });

  it('gives each frame a small steady tilt', () => {
    expect(swayFor(0)).toBe(swayFor(12));
    for (let i = 0; i < 12; i++) expect(Math.abs(swayFor(i))).toBeLessThanOrEqual(2);
  });
});
