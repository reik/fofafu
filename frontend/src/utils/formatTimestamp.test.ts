import { describe, expect, it } from 'vitest';
import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  it('formats an afternoon timestamp as date and time with lowercase pm', () => {
    const iso = new Date(2026, 5, 14, 20, 36).toISOString();
    expect(formatTimestamp(iso)).toBe('6/14/2026 8:36pm');
  });

  it('formats a morning timestamp with lowercase am', () => {
    const iso = new Date(2026, 0, 2, 9, 5).toISOString();
    expect(formatTimestamp(iso)).toBe('1/2/2026 9:05am');
  });
});
