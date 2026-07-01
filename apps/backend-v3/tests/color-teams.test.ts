/**
 * Unit tests for F-Color-Team-Reviews types, prompts, and validation.
 */

import { describe, it, expect } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const { isValidColor, COLOR_TEAM_COLORS } = await import(
  '../src/services/color-teams/types.js'
);
const { COLOR_PROMPTS, DOCTRINE_PRINCIPLES } = await import(
  '../src/services/color-teams/prompts.js'
);

describe('Color Team Colors', () => {
  it('has exactly 6 colors (no Gold)', () => {
    expect(COLOR_TEAM_COLORS).toHaveLength(6);
    expect(COLOR_TEAM_COLORS).toEqual(['pink', 'red', 'black', 'blue', 'white', 'green']);
    expect(COLOR_TEAM_COLORS).not.toContain('gold');
  });

  it('isValidColor accepts valid colors', () => {
    for (const color of COLOR_TEAM_COLORS) {
      expect(isValidColor(color)).toBe(true);
    }
  });

  it('isValidColor rejects Gold', () => {
    expect(isValidColor('gold')).toBe(false);
  });

  it('isValidColor rejects unknown colors', () => {
    expect(isValidColor('purple')).toBe(false);
    expect(isValidColor('')).toBe(false);
    expect(isValidColor('Gold')).toBe(false);
  });
});

describe('Color Prompts', () => {
  it('has a prompt for each color', () => {
    for (const color of COLOR_TEAM_COLORS) {
      expect(COLOR_PROMPTS[color]).toBeDefined();
      expect(COLOR_PROMPTS[color].color).toBe(color);
      expect(COLOR_PROMPTS[color].role).toBeTruthy();
      expect(COLOR_PROMPTS[color].description).toBeTruthy();
      expect(COLOR_PROMPTS[color].tools.length).toBeGreaterThan(0);
    }
  });

  it('has no Gold prompt', () => {
    expect(COLOR_PROMPTS).not.toHaveProperty('gold');
  });

  it('green prompt includes doctrine_check, pricing_lookup, exclusion_check tools', () => {
    const greenPrompt = COLOR_PROMPTS['green'];
    expect(greenPrompt.tools).toContain('doctrine_check');
    expect(greenPrompt.tools).toContain('pricing_lookup');
    expect(greenPrompt.tools).toContain('exclusion_check');
  });

  it('green output schema includes doctrine_score, exclusion_hits, margin_check', () => {
    const greenPrompt = COLOR_PROMPTS['green'];
    expect(greenPrompt.outputSchema).toContain('doctrine_score');
    expect(greenPrompt.outputSchema).toContain('exclusion_hits');
    expect(greenPrompt.outputSchema).toContain('margin_check');
  });
});

describe('Doctrine Principles', () => {
  it('has exactly 8 principles', () => {
    expect(DOCTRINE_PRINCIPLES).toHaveLength(8);
  });

  it('includes all required principle names from F-303', () => {
    expect(DOCTRINE_PRINCIPLES).toContain('Alignment');
    expect(DOCTRINE_PRINCIPLES).toContain('Ethics Always');
    expect(DOCTRINE_PRINCIPLES).toContain('Teamwork');
    expect(DOCTRINE_PRINCIPLES).toContain('Data First, Then Debate');
    expect(DOCTRINE_PRINCIPLES).toContain('Relentless Execution');
    expect(DOCTRINE_PRINCIPLES).toContain('Relationships');
    expect(DOCTRINE_PRINCIPLES).toContain('Market, Mission, Brand Focus');
    expect(DOCTRINE_PRINCIPLES).toContain('Decision Filter Compliance');
  });
});
