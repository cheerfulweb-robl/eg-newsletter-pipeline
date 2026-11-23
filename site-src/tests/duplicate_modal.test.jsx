import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import DuplicateWarningModal from '../src/components/submission/DuplicateWarningModal';

describe('DuplicateWarningModal', () => {
  const sampleListing = {
    id: 'test-evt-1',
    title: "Jackson's Point Holiday Craft Market",
    event_date_label: 'Sat, Dec 12, 2026',
    location: 'The ROC',
    community: 'Keswick',
    link: 'https://example.com/market',
    status: 'approved'
  };

  const sampleReasons = ['Same event date (Dec 12, 2026)', '92% title match'];

  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      <DuplicateWarningModal
        isOpen={false}
        matchedListing={sampleListing}
        onCancel={() => {}}
        onBypass={() => {}}
      />
    );
    expect(html).toBe('');
  });

  it('renders title, date, location, and match reasons when open', () => {
    const html = renderToString(
      <DuplicateWarningModal
        isOpen={true}
        matchedListing={sampleListing}
        matchReasons={sampleReasons}
        score={85}
        onCancel={() => {}}
        onBypass={() => {}}
      />
    );

    expect(html).toContain('Possible Duplicate Listing Found');
    expect(html).toContain("Jackson&#x27;s Point Holiday Craft Market");
    expect(html).toContain('Sat, Dec 12, 2026');
    expect(html).toContain('92% title match');
    expect(html).toContain('Live on Website');
    expect(html).toContain('Never Mind, Cancel Submission');
    expect(html).toContain('Submit Anyway (Request Review)');
  });

  it('renders pending status badge when matched listing is pending', () => {
    const pendingListing = { ...sampleListing, status: 'pending' };
    const html = renderToString(
      <DuplicateWarningModal
        isOpen={true}
        matchedListing={pendingListing}
        matchReasons={sampleReasons}
        score={75}
        onCancel={() => {}}
        onBypass={() => {}}
      />
    );

    expect(html).toContain('Under Staff Review');
  });
});
