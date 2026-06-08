/**
 * Unit tests for mapStatusToLifecycle (F-401).
 */

import { describe, it, expect } from 'vitest';
import { mapStatusToLifecycle } from '../src/services/opportunities/unified-mirror.js';

describe('mapStatusToLifecycle', () => {
  it('maps "awarded" to awarded', () => {
    expect(mapStatusToLifecycle('awarded')).toBe('awarded');
  });

  it('maps "Awarded" (case-insensitive) to awarded', () => {
    expect(mapStatusToLifecycle('Awarded')).toBe('awarded');
  });

  it('maps "closed" to closed', () => {
    expect(mapStatusToLifecycle('closed')).toBe('closed');
  });

  it('maps "no_bid" to closed', () => {
    expect(mapStatusToLifecycle('no_bid')).toBe('closed');
  });

  it('maps "discovery" to pre_sol', () => {
    expect(mapStatusToLifecycle('discovery')).toBe('pre_sol');
  });

  it('maps "active" to pre_sol', () => {
    expect(mapStatusToLifecycle('active')).toBe('pre_sol');
  });

  it('maps "tracking" to pre_sol', () => {
    expect(mapStatusToLifecycle('tracking')).toBe('pre_sol');
  });

  it('maps null to pre_sol', () => {
    expect(mapStatusToLifecycle(null)).toBe('pre_sol');
  });

  it('maps undefined to pre_sol', () => {
    expect(mapStatusToLifecycle(undefined)).toBe('pre_sol');
  });

  it('maps empty string to pre_sol', () => {
    expect(mapStatusToLifecycle('')).toBe('pre_sol');
  });

  it('maps whitespace-padded "awarded" correctly', () => {
    expect(mapStatusToLifecycle('  awarded  ')).toBe('awarded');
  });
});
