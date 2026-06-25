import { describe, it, expect } from 'vitest';
import {
  FY_START_MONTH,
  fiscalMonthIndex,
  fiscalQuarter,
  calendarQuarter,
  getMonthsForMode,
  parseCalendarMode,
  quarterForMode,
} from '../../src/lib/fiscal-calendar.js';

describe('fiscal-calendar', () => {
  it('FY starts in October', () => {
    expect(FY_START_MONTH).toBe(10);
  });

  describe('fiscalMonthIndex (Oct-start)', () => {
    it('Oct = fiscal month 1', () => {
      expect(fiscalMonthIndex('Oct')).toBe(1);
    });

    it('Nov = fiscal month 2', () => {
      expect(fiscalMonthIndex('Nov')).toBe(2);
    });

    it('Dec = fiscal month 3', () => {
      expect(fiscalMonthIndex('Dec')).toBe(3);
    });

    it('Jan = fiscal month 4', () => {
      expect(fiscalMonthIndex('Jan')).toBe(4);
    });

    it('Sep = fiscal month 12', () => {
      expect(fiscalMonthIndex('Sep')).toBe(12);
    });

    it('returns 0 for invalid input', () => {
      expect(fiscalMonthIndex('Foo')).toBe(0);
    });
  });

  describe('fiscalQuarter', () => {
    it('Oct = FY Q1', () => {
      expect(fiscalQuarter('Oct')).toBe(1);
    });

    it('Dec = FY Q1', () => {
      expect(fiscalQuarter('Dec')).toBe(1);
    });

    it('Jan = FY Q2', () => {
      expect(fiscalQuarter('Jan')).toBe(2);
    });

    it('Mar = FY Q2', () => {
      expect(fiscalQuarter('Mar')).toBe(2);
    });

    it('Apr = FY Q3', () => {
      expect(fiscalQuarter('Apr')).toBe(3);
    });

    it('Jul = FY Q4', () => {
      expect(fiscalQuarter('Jul')).toBe(4);
    });

    it('Sep = FY Q4', () => {
      expect(fiscalQuarter('Sep')).toBe(4);
    });
  });

  describe('calendarQuarter', () => {
    it('Jan = CY Q1', () => {
      expect(calendarQuarter('Jan')).toBe(1);
    });

    it('Apr = CY Q2', () => {
      expect(calendarQuarter('Apr')).toBe(2);
    });

    it('Oct = CY Q4', () => {
      expect(calendarQuarter('Oct')).toBe(4);
    });
  });

  describe('getMonthsForMode', () => {
    it('FY mode starts with Oct and ends with Sep', () => {
      const months = getMonthsForMode('FY');
      expect(months).toHaveLength(12);
      expect(months[0]).toEqual({ mon: 'Oct', quarter: 1 });
      expect(months[11]).toEqual({ mon: 'Sep', quarter: 4 });
    });

    it('CY mode starts with Jan and ends with Dec', () => {
      const months = getMonthsForMode('CY');
      expect(months).toHaveLength(12);
      expect(months[0]).toEqual({ mon: 'Jan', quarter: 1 });
      expect(months[11]).toEqual({ mon: 'Dec', quarter: 4 });
    });

    it('FY Q1 = Oct-Dec, Q2 = Jan-Mar, Q3 = Apr-Jun, Q4 = Jul-Sep', () => {
      const months = getMonthsForMode('FY');
      const q1 = months.filter((m) => m.quarter === 1).map((m) => m.mon);
      const q2 = months.filter((m) => m.quarter === 2).map((m) => m.mon);
      const q3 = months.filter((m) => m.quarter === 3).map((m) => m.mon);
      const q4 = months.filter((m) => m.quarter === 4).map((m) => m.mon);
      expect(q1).toEqual(['Oct', 'Nov', 'Dec']);
      expect(q2).toEqual(['Jan', 'Feb', 'Mar']);
      expect(q3).toEqual(['Apr', 'May', 'Jun']);
      expect(q4).toEqual(['Jul', 'Aug', 'Sep']);
    });
  });

  describe('parseCalendarMode', () => {
    it('extracts FY from "FY26"', () => {
      expect(parseCalendarMode('FY26')).toBe('FY');
    });

    it('extracts CY from "CY26"', () => {
      expect(parseCalendarMode('CY26')).toBe('CY');
    });

    it('defaults to FY for bare number', () => {
      expect(parseCalendarMode('2026')).toBe('FY');
    });

    it('is case-insensitive', () => {
      expect(parseCalendarMode('cy26')).toBe('CY');
      expect(parseCalendarMode('fy26')).toBe('FY');
    });
  });

  describe('quarterForMode', () => {
    it('Jan in FY mode = Q2', () => {
      expect(quarterForMode('Jan', 'FY')).toBe(2);
    });

    it('Jan in CY mode = Q1', () => {
      expect(quarterForMode('Jan', 'CY')).toBe(1);
    });

    it('Oct in FY mode = Q1', () => {
      expect(quarterForMode('Oct', 'FY')).toBe(1);
    });

    it('Oct in CY mode = Q4', () => {
      expect(quarterForMode('Oct', 'CY')).toBe(4);
    });
  });
});
