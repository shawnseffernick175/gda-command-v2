import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isArxivIngestEnabled,
  isNsfIngestEnabled,
} from '../../src/ingest/framework/research-feeds.js';

const ARXIV = 'ENABLE_ARXIV_INGEST';
const NSF = 'ENABLE_NSF_INGEST';

describe('per-feed research-feed gates', () => {
  let prevArxiv: string | undefined;
  let prevNsf: string | undefined;

  beforeEach(() => {
    prevArxiv = process.env[ARXIV];
    prevNsf = process.env[NSF];
  });

  afterEach(() => {
    if (prevArxiv === undefined) delete process.env[ARXIV];
    else process.env[ARXIV] = prevArxiv;
    if (prevNsf === undefined) delete process.env[NSF];
    else process.env[NSF] = prevNsf;
  });

  describe('arXiv (default ON)', () => {
    it('is on when unset', () => {
      delete process.env[ARXIV];
      expect(isArxivIngestEnabled()).toBe(true);
    });
    it('is on for any value except "false"', () => {
      process.env[ARXIV] = 'true';
      expect(isArxivIngestEnabled()).toBe(true);
    });
    it('is off only for exactly "false"', () => {
      process.env[ARXIV] = 'false';
      expect(isArxivIngestEnabled()).toBe(false);
    });
  });

  describe('NSF (default ON)', () => {
    it('is on when unset', () => {
      delete process.env[NSF];
      expect(isNsfIngestEnabled()).toBe(true);
    });
    it('is on for any value except "false"', () => {
      process.env[NSF] = 'true';
      expect(isNsfIngestEnabled()).toBe(true);
    });
    it('is off only for exactly "false"', () => {
      process.env[NSF] = 'false';
      expect(isNsfIngestEnabled()).toBe(false);
    });
  });
});
