import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Stat } from '../Stat/Stat';
import { Metric } from '../Metric/Metric';
import { Field } from '../Field/Field';
import { SourceUrlChip } from '../SourceUrlChip/SourceUrlChip';

const FIXTURE_URL = 'https://sam.gov/opp/r1-test-fixture';

/**
 * R1 DOM-level contract test per D5 §4.1
 *
 * For each component that takes sourceUrl: render with a fixture URL, assert
 * the rendered DOM contains <a href={sourceUrl} target="_blank" rel="noopener noreferrer">.
 */
describe('[R1] Source URL enforcement — DOM level', () => {
  const R1_COMPONENTS = [
    { name: 'Stat', Component: () => <Stat label="Test" value="42" sourceUrl={FIXTURE_URL} />, testId: 'data-point-stat' },
    { name: 'Metric', Component: () => <Metric label="Test" value="42" sourceUrl={FIXTURE_URL} />, testId: 'data-point-metric' },
    { name: 'Field', Component: () => <Field label="Test" value="Value" sourceUrl={FIXTURE_URL} />, testId: 'data-point-field' },
    { name: 'SourceUrlChip', Component: () => <SourceUrlChip url={FIXTURE_URL} source_kind="sam_gov" retrieved_at={new Date().toISOString()} />, testId: 'data-point-source-url-chip' },
  ];

  R1_COMPONENTS.forEach(({ name, Component, testId }) => {
    it(`${name} renders a clickable <a> with valid href`, () => {
      render(<Component />);
      const dataPoint = screen.getByTestId(testId);
      const anchor = dataPoint.tagName === 'A' ? dataPoint : dataPoint.querySelector('a[href]');
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute('href')).toBe(FIXTURE_URL);
      expect(anchor!.getAttribute('target')).toBe('_blank');
      expect(anchor!.getAttribute('rel')).toContain('noopener');
    });
  });

  it('all R1-binding data points render anchors', () => {
    const { container } = render(
      <>
        <Stat label="Pipeline" value="$12M" sourceUrl={FIXTURE_URL} />
        <Metric label="Win Rate" value="68%" sourceUrl={FIXTURE_URL} />
        <Field label="Agency" value="DOD" sourceUrl={FIXTURE_URL} />
        <SourceUrlChip url={FIXTURE_URL} source_kind="sam_gov" retrieved_at={new Date().toISOString()} />
      </>
    );

    const dataPoints = container.querySelectorAll('[data-testid^="data-point-"]');
    expect(dataPoints.length).toBeGreaterThanOrEqual(4);

    dataPoints.forEach((el) => {
      const anchor = el.tagName === 'A' ? el : el.querySelector('a[href]');
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute('href')).toMatch(/^https?:\/\//);
      expect(anchor!.getAttribute('target')).toBe('_blank');
      expect(anchor!.getAttribute('rel')).toContain('noopener');
    });
  });
});
