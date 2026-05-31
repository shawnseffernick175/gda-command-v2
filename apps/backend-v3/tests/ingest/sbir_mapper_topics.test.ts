import { describe, it, expect } from 'vitest';
import { mapSBIRTopic } from '../../src/ingest/sbir/mapper_topics.js';
import type { SBIRTopicRaw } from '../../src/ingest/sbir/client.js';
import openTopic from '../fixtures/sbir/open_topic.json';
import preReleaseTopic from '../fixtures/sbir/pre_release_topic.json';
import closedTopic from '../fixtures/sbir/closed_topic.json';

function asRaw(fixture: Record<string, unknown>): SBIRTopicRaw {
  return fixture as unknown as SBIRTopicRaw;
}

describe('mapSBIRTopic', () => {
  it('maps an open topic with all fields', () => {
    const result = mapSBIRTopic(asRaw(openTopic));
    expect(result).not.toBeNull();
    const { topic } = result!;

    expect(topic.topic_code).toBe('AF26A-D016');
    expect(topic.solicitation_number).toBe('DOD_SBIR_2026.3');
    expect(topic.program).toBe('SBIR');
    expect(topic.phase).toBe('Phase I');
    expect(topic.agency).toBe('DOD');
    expect(topic.branch).toBe('Air Force');
    expect(topic.title).toBe('Autonomous Drone Swarm Coordination for ISR Missions');
    expect(topic.description).toContain('50+ UAVs');
    expect(topic.technology_areas).toEqual(['Autonomy', 'AI/ML', 'ISR']);
    expect(topic.open_date).toBe('2026-06-01');
    expect(topic.close_date).toBe('2026-08-15');
    expect(topic.pre_release_date).toBe('2026-05-15');
    expect(topic.topic_url).toBe('https://www.sbir.gov/topic/AF26A-D016');
    expect(topic.status).toBe('Open');
  });

  it('maps a pre-release topic', () => {
    const result = mapSBIRTopic(asRaw(preReleaseTopic));
    expect(result).not.toBeNull();
    const { topic } = result!;

    expect(topic.topic_code).toBe('N26B-T042');
    expect(topic.program).toBe('STTR');
    expect(topic.branch).toBe('Navy');
    expect(topic.status).toBe('Pre-Release');
    expect(topic.pre_release_date).toBe('2026-07-01');
  });

  it('maps a closed topic', () => {
    const result = mapSBIRTopic(asRaw(closedTopic));
    expect(result).not.toBeNull();
    const { topic } = result!;

    expect(topic.topic_code).toBe('A25C-T099');
    expect(topic.program).toBe('SBIR');
    expect(topic.phase).toBe('Phase II');
    expect(topic.branch).toBe('Army');
    expect(topic.status).toBe('Closed');
    expect(topic.close_date).toBe('2025-08-30');
  });

  it('generates per-field source citations (R1)', () => {
    const result = mapSBIRTopic(asRaw(openTopic));
    expect(result).not.toBeNull();
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('title');
    expect(fields).toContain('close_date');
    expect(citations).toHaveLength(2);

    for (const c of citations) {
      expect(c.source_url).toContain('sbir.gov');
    }
  });

  it('omits close_date citation when close_date is missing', () => {
    const raw = { ...openTopic, close_date: null } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).not.toBeNull();
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('title');
    expect(fields).not.toContain('close_date');
    expect(citations).toHaveLength(1);
  });

  it('returns null for records with no topic_number', () => {
    const raw = { ...openTopic, topic_number: null } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no solicitation_number', () => {
    const raw = { ...openTopic, solicitation_number: null } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with no title', () => {
    const raw = { ...openTopic, topic_title: null } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).toBeNull();
  });

  it('returns null for records with empty topic_number', () => {
    const raw = { ...openTopic, topic_number: '' } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).toBeNull();
  });

  it('handles empty technology_areas array', () => {
    const raw = { ...openTopic, technology_areas: [] } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).not.toBeNull();
    expect(result!.topic.technology_areas).toEqual([]);
  });

  it('handles missing technology_areas gracefully', () => {
    const raw = { ...openTopic, technology_areas: undefined } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).not.toBeNull();
    expect(result!.topic.technology_areas).toEqual([]);
  });

  it('generates a fallback topic_url when none provided', () => {
    const raw = { ...openTopic, url: null } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).not.toBeNull();
    expect(result!.topic.topic_url).toContain('sbir.gov');
  });

  it('handles malformed dates without crashing', () => {
    const raw = {
      ...openTopic,
      open_date: 'not-a-date',
      close_date: '2026/13/45',
      pre_release_date: '',
    } as unknown as SBIRTopicRaw;
    const result = mapSBIRTopic(raw);
    expect(result).not.toBeNull();
    expect(result!.topic.open_date).toBeNull();
    expect(result!.topic.close_date).toBeNull();
    expect(result!.topic.pre_release_date).toBeNull();
  });

  it('parses Navy branch from "Naval Research Laboratory"', () => {
    const result = mapSBIRTopic(asRaw(preReleaseTopic));
    expect(result).not.toBeNull();
    expect(result!.topic.branch).toBe('Navy');
  });
});
