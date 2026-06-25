import { describe, it, expect } from 'vitest';
import {
  isCommoditySignal,
  COMMODITY_KEYWORDS,
  SUPPLY_PSC_PREFIXES,
  MAINTENANCE_PSC_PREFIXES,
} from '../../src/ingest/fastrac/commodity-filter.js';

describe('isCommoditySignal', () => {
  // ── Layer 1: FSC/PSC title pattern ────────────────────────────
  describe('FSC title pattern (NN--)', () => {
    const fscTitles = [
      '16--SCISSORS ASSEMBLY',
      '63--SENSOR CABLE,COAXIAL',
      '43--SEAL ASSEMBLY,SHAFT',
      '31--BUSHING,SLEEVE',
      '39--FRAME,HOIST',
      '5340--HARDWARE',
      '99--MISC SUPPLY ITEM',
    ];

    for (const title of fscTitles) {
      it(`rejects FSC-coded title: "${title}"`, () => {
        const result = isCommoditySignal(title);
        expect(result.rejected).toBe(true);
        expect(result.reason).toBe('fsc_title_pattern');
      });
    }

    it('rejects FSC title with leading whitespace', () => {
      const result = isCommoditySignal('  16--SCISSORS ASSEMBLY');
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe('fsc_title_pattern');
    });
  });

  // ── Layer 2: Commodity keyword matching ───────────────────────
  describe('commodity/facilities keyword matching', () => {
    const junkTitles = [
      'FCI Marion - Replace Summer Boiler #2',
      'Janitorial Services for Ranger District',
      'Herbicide/Pesticide Services',
      'Building Materials for Lava Beds National Monument',
      'Installation of Security Fence',
      'Gavins Point Powerhouse Drain Rehab',
      'HVAC Maintenance Services',
      'Snow Removal Services at Fort Liberty',
      'Elevator Maintenance - Building 500',
      'Carpet Replacement Phase III',
      'Fuel Delivery to Remote Stations',
      'Office Supplies - Q3 Restock',
      'Laundry Service Contract Renewal',
      'Pest Control - Quarterly Treatment',
      'Roofing Repair at Admin Building',
      'RING SEALS for Industrial Equipment',
    ];

    for (const title of junkTitles) {
      it(`rejects commodity title: "${title}"`, () => {
        const result = isCommoditySignal(title);
        expect(result.rejected).toBe(true);
        expect(result.reason).toMatch(/^keyword:/);
      });
    }

    it('rejects when keyword is in description, not title', () => {
      const result = isCommoditySignal(
        'General Maintenance Task Order',
        'This task order covers janitorial and custodial services for the facility.',
      );
      expect(result.rejected).toBe(true);
      expect(result.reason).toMatch(/^keyword:/);
    });
  });

  // ── Layer 3: PSC code matching ────────────────────────────────
  describe('PSC code rejection', () => {
    it('rejects supply PSC code 16xx (aircraft components)', () => {
      const result = isCommoditySignal('Unspecified Component Order', null, '1680');
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe('psc_supply:16');
    });

    it('rejects maintenance PSC code S2xx (housekeeping)', () => {
      const result = isCommoditySignal('Facility Services', null, 'S299');
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe('psc_maintenance:S2');
    });

    it('rejects construction PSC code Z1xx', () => {
      const result = isCommoditySignal('Minor Construction', null, 'Z1AB');
      expect(result.rejected).toBe(true);
      expect(result.reason).toBe('psc_maintenance:Z1');
    });

    it('handles lowercase PSC codes', () => {
      const result = isCommoditySignal('Something', null, 's299');
      expect(result.rejected).toBe(true);
    });
  });

  // ── Genuine innovation signals MUST pass ──────────────────────
  describe('allows genuine innovation signals', () => {
    const goodTitles = [
      'DARPA Proposers Day — Tactical Network Technology',
      'xTech Search 8 — Army Prize Competition',
      'AFWERX SBIR Phase II Direct to Phase II',
      'SpaceWERX Orbital Prime — On-Orbit Servicing',
      'DIU CSO — Autonomous Cyber Operations',
      'IARPA — Quantum Computing Research BAA',
      'Army Futures Command AI/ML Prototype OTA',
      'SOCOM Broad Agency Announcement for ISR Tech',
      'Naval Research Laboratory Open BAA for EW Research',
      'DEVCOM ARL Cooperative Research Agreement',
      'PEO IEW&S Rapid Prototyping for EW Capabilities',
      'Army Applications Laboratory — Counter-UAS Solutions',
    ];

    for (const title of goodTitles) {
      it(`accepts innovation signal: "${title}"`, () => {
        const result = isCommoditySignal(title);
        expect(result.rejected).toBe(false);
        expect(result.reason).toBeNull();
      });
    }

    it('accepts R&D PSC code (AC — R&D services)', () => {
      const result = isCommoditySignal('R&D Task Order', null, 'AC12');
      expect(result.rejected).toBe(false);
    });

    it('accepts professional services PSC code (R425)', () => {
      const result = isCommoditySignal('Engineering Support', null, 'R425');
      expect(result.rejected).toBe(false);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles empty title', () => {
      const result = isCommoditySignal('');
      expect(result.rejected).toBe(false);
    });

    it('handles null description and classificationCode', () => {
      const result = isCommoditySignal('DARPA BAA', null, null);
      expect(result.rejected).toBe(false);
    });

    it('handles undefined description and classificationCode', () => {
      const result = isCommoditySignal('DARPA BAA');
      expect(result.rejected).toBe(false);
    });
  });

  // ── Config-driven extensibility ───────────────────────────────
  describe('config arrays are non-empty and exported', () => {
    it('COMMODITY_KEYWORDS has entries', () => {
      expect(COMMODITY_KEYWORDS.length).toBeGreaterThan(30);
    });

    it('SUPPLY_PSC_PREFIXES has entries', () => {
      expect(SUPPLY_PSC_PREFIXES.length).toBeGreaterThan(20);
    });

    it('MAINTENANCE_PSC_PREFIXES has entries', () => {
      expect(MAINTENANCE_PSC_PREFIXES.length).toBeGreaterThan(0);
    });
  });
});
