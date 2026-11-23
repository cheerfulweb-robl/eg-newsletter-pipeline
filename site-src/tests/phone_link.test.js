import { describe, it, expect } from 'vitest';
import { phoneProblem } from '../src/utils/phone.js';
import { normalizeLink } from '../src/utils/links.js';

describe('phone rule', () => {
  it('accepts real numbers', () => {
    expect(phoneProblem('(647) 990-4482')).toBe('');
    expect(phoneProblem('289-409-8448')).toBe('');
    expect(phoneProblem('1 905 728 4196')).toBe('');
  });
  it('rejects fake or incomplete numbers', () => {
    expect(phoneProblem('(905')).not.toBe('');
    expect(phoneProblem('905-555-1234')).not.toBe('');   // run 1234
    expect(phoneProblem('905-555-4321')).not.toBe('');   // run 4321
    expect(phoneProblem('905-333-3301')).not.toBe('');   // 3333
    expect(phoneProblem('(905) 999-9999')).not.toBe(''); // 9999
    expect(phoneProblem('123-456-7890')).not.toBe('');
    expect(phoneProblem('012-555-8264')).not.toBe('');   // area code starts with 0
  });
});

describe('link rule', () => {
  it('cleans and accepts real links', () => {
    expect(normalizeLink('')).toBe('');
    expect(normalizeLink('route48.ca')).toBe('https://route48.ca/');
    expect(normalizeLink('https://route48.ca/menu')).toBe('https://route48.ca/menu');
    expect(normalizeLink('http://example.org')).toBe('http://example.org/');
  });
  it('rejects unusable links', () => {
    expect(normalizeLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLink('not a link')).toBeNull();
    expect(normalizeLink('localhost')).toBeNull();
  });
});
