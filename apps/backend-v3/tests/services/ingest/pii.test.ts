/**
 * PII detection and redaction tests — F-304.
 */

import { describe, it, expect } from 'vitest';
import { detectPii, redactPii, fullRedact } from '../../../src/services/ingest/pii.js';

describe('PII Detection', () => {
  it('detects SSN patterns', () => {
    expect(detectPii('SSN: 123-45-6789')).toBe(true);
    expect(detectPii('social security 987-65-4321')).toBe(true);
  });

  it('does not false-positive on phone numbers', () => {
    expect(detectPii('Call 555-0100 for info')).toBe(false);
  });

  it('detects clearance holder names', () => {
    expect(detectPii('TS/SCI clearance holder: John Smith')).toBe(true);
    expect(detectPii('TOP SECRET holder James Wilson')).toBe(true);
  });

  it('detects DOB patterns', () => {
    expect(detectPii('Date of birth: 01/15/1990')).toBe(true);
    expect(detectPii('DOB: 3/22/1985')).toBe(true);
  });

  it('returns false for clean text', () => {
    expect(detectPii('This is a normal RFP document about logistics.')).toBe(false);
    expect(detectPii('NAICS 541715 set-aside opportunity')).toBe(false);
  });
});

describe('PII Redaction', () => {
  it('redacts SSN patterns', () => {
    const result = redactPii('Employee SSN: 123-45-6789 on file.');
    expect(result).toContain('[REDACTED-SSN]');
    expect(result).not.toContain('123-45-6789');
  });

  it('redacts clearance holder names', () => {
    const result = redactPii('TS/SCI clearance holder: John Smith assigned to project.');
    expect(result).toContain('[REDACTED-NAME]');
    expect(result).not.toContain('John Smith');
  });

  it('preserves non-PII text', () => {
    const text = 'RFP for logistics support services under NAICS 541715.';
    expect(redactPii(text)).toBe(text);
  });

  it('handles multiple PII instances', () => {
    const text = 'SSN: 123-45-6789. Also SSN: 987-65-4321. TS/SCI clearance holder: Jane Doe.';
    const result = redactPii(text);
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('987-65-4321');
    expect(result).not.toContain('Jane Doe');
    expect(result.match(/\[REDACTED-SSN\]/g)?.length).toBe(2);
  });
});

describe('Full Redaction', () => {
  it('redacts email addresses', () => {
    const result = fullRedact('Contact john.doe@example.com for details.');
    expect(result).toContain('[REDACTED-EMAIL]');
    expect(result).not.toContain('john.doe@example.com');
  });

  it('redacts phone numbers', () => {
    const result = fullRedact('Call (555) 123-4567 or 555-987-6543.');
    expect(result).toContain('[REDACTED-PHONE]');
  });
});
