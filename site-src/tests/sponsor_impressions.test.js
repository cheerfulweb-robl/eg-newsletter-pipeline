import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSponsorClick, recordSponsorImpressions, isUuid } from '../src/utils/links';

describe('sponsor impressions & click tracking', () => {
  beforeEach(() => {
    const store = {};
    globalThis.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };
  });

  it('validates UUIDs correctly', () => {
    expect(isUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
    expect(isUuid('invalid-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it('safely handles missing client or invalid parameters', () => {
    expect(() => recordSponsorImpressions(null, ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'])).not.toThrow();
    expect(() => recordSponsorImpressions({}, [])).not.toThrow();
    expect(() => recordSponsorImpressions({}, ['invalid-id'])).not.toThrow();
    expect(() => recordSponsorClick(null, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).not.toThrow();
  });

  it('calls wg_record_sponsor_impressions with valid UUIDs and page', () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: 2, error: null });
    const mockClient = { rpc: rpcMock };

    const validId1 = '11111111-1111-4111-8111-111111111111';
    const validId2 = '22222222-2222-4222-8222-222222222222';
    const invalidId = 'not-a-uuid';

    recordSponsorImpressions(mockClient, [validId1, invalidId, validId2], 'home-search');

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('wg_record_sponsor_impressions', {
      ids_input: [validId1, validId2],
      page_input: 'home-search',
      visitor_input: expect.any(String),
    });
  });

  it('does not throw when RPC call rejects', async () => {
    const rpcMock = vi.fn().mockRejectedValue(new Error('Network error'));
    const mockClient = { rpc: rpcMock };
    const validId = '11111111-1111-4111-8111-111111111111';

    expect(() => recordSponsorImpressions(mockClient, [validId])).not.toThrow();
  });
});
