import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatValueCents,
  daysUntil,
  dueCountdownLabel,
} from '../format';

describe('F-421 list formatting helpers', () => {
  describe('formatDate', () => {
    it('returns em dash for null', () => {
      expect(formatDate(null)).toBe('—');
    });
    it('returns em dash for an invalid date', () => {
      expect(formatDate('not-a-date')).toBe('—');
    });
    it('formats an ISO date', () => {
      expect(formatDate('2026-07-04T12:00:00Z')).toMatch(/Jul/);
    });
  });

  describe('formatValueCents', () => {
    it('returns em dash for null', () => {
      expect(formatValueCents(null)).toBe('—');
    });
    it('formats millions', () => {
      expect(formatValueCents(1_250_000_00)).toBe('$1.3M');
    });
    it('formats thousands', () => {
      expect(formatValueCents(850_000_00)).toBe('$850K');
    });
    it('formats small values', () => {
      expect(formatValueCents(50_000)).toBe('$500');
    });
  });

  describe('daysUntil', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    it('returns null for null', () => {
      expect(daysUntil(null, now)).toBeNull();
    });
    it('returns positive days for a future date', () => {
      expect(daysUntil('2026-06-12T00:00:00Z', now)).toBe(10);
    });
    it('returns negative days for a past date', () => {
      expect(daysUntil('2026-05-28T00:00:00Z', now)).toBe(-5);
    });
  });

  describe('dueCountdownLabel', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    it('returns null for null', () => {
      expect(dueCountdownLabel(null, now)).toBeNull();
    });
    it('labels future days', () => {
      expect(dueCountdownLabel('2026-06-09T00:00:00Z', now)).toBe('7d left');
    });
    it('labels due today', () => {
      expect(dueCountdownLabel('2026-06-02T00:00:00Z', now)).toBe('Due today');
    });
    it('labels due tomorrow', () => {
      expect(dueCountdownLabel('2026-06-03T00:00:00Z', now)).toBe('Due tomorrow');
    });
    it('labels overdue', () => {
      expect(dueCountdownLabel('2026-05-30T00:00:00Z', now)).toBe('3d overdue');
    });
  });
});
