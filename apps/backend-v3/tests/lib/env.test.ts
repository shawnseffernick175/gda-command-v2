import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envStr, envFirst, envInt } from '../../src/lib/env.js';

const KEY = 'GDA_TEST_ENV_VAR';
const KEY2 = 'GDA_TEST_ENV_VAR_2';

describe('env helpers — blank-safe reads', () => {
  beforeEach(() => {
    delete process.env[KEY];
    delete process.env[KEY2];
  });
  afterEach(() => {
    delete process.env[KEY];
    delete process.env[KEY2];
  });

  describe('envStr', () => {
    it('returns the value when set and non-blank', () => {
      process.env[KEY] = 'hello';
      expect(envStr(KEY, 'fallback')).toBe('hello');
    });
    it('falls back when unset', () => {
      expect(envStr(KEY, 'fallback')).toBe('fallback');
    });
    it('falls back when set but blank or whitespace-only', () => {
      process.env[KEY] = '';
      expect(envStr(KEY, 'fallback')).toBe('fallback');
      process.env[KEY] = '   ';
      expect(envStr(KEY, 'fallback')).toBe('fallback');
    });
    it('does not trim the returned value', () => {
      process.env[KEY] = '  padded  ';
      expect(envStr(KEY, 'fallback')).toBe('  padded  ');
    });
  });

  describe('envFirst', () => {
    it('returns the first non-blank value', () => {
      process.env[KEY] = '';
      process.env[KEY2] = 'secondary';
      expect(envFirst([KEY, KEY2])).toBe('secondary');
    });
    it('does not let a blank primary shadow a populated secondary', () => {
      process.env[KEY] = '   ';
      process.env[KEY2] = 'real-key';
      expect(envFirst([KEY, KEY2], '')).toBe('real-key');
    });
    it('returns fallback when none set', () => {
      expect(envFirst([KEY, KEY2], 'none')).toBe('none');
      expect(envFirst([KEY, KEY2])).toBe('');
    });
  });

  describe('envInt', () => {
    it('parses an integer value', () => {
      process.env[KEY] = '120000';
      expect(envInt(KEY, 60000)).toBe(120000);
    });
    it('falls back when unset', () => {
      expect(envInt(KEY, 60000)).toBe(60000);
    });
    it('falls back on blank instead of producing NaN', () => {
      process.env[KEY] = '';
      expect(envInt(KEY, 60000)).toBe(60000);
      process.env[KEY] = '  ';
      expect(envInt(KEY, 60000)).toBe(60000);
    });
    it('throws on a non-numeric value', () => {
      process.env[KEY] = 'abc';
      expect(() => envInt(KEY, 60000)).toThrow(/must be an integer/);
    });
  });
});
