import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format-date';

describe('formatDateTime', () => {
  const iso = '2026-03-01T22:30:00.000Z';

  it('gives the same text on server and browser for the same zone (no hydration mismatch)', () => {
    expect(formatDateTime(iso, 'en-GB', 'Asia/Karachi')).toBe('2 Mar 2026, 03:30');
  });

  it("shows the user's zone, not the server's", () => {
    expect(formatDateTime(iso, 'en-GB', 'UTC')).toBe('1 Mar 2026, 22:30');
  });
});
