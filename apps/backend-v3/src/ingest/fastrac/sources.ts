/**
 * FasTrac Tier 1 source registry — authoritative config for each
 * innovation org adapter, derived from:
 * docs/dev-notes/2026-06-15_research_dod_innovation_factories.md
 *
 * Quick-reference table at end of research file is the canonical Tier 1 list.
 */

import type { SourceConfig } from './types.js';

export const TIER1_SOURCES: SourceConfig[] = [
  {
    name: 'AFWERX',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'SBIR/TACFI/STRATFI',
    samKeywords: ['AFWERX'],
    scrapeUrls: ['https://afwerx.com'],
    govDeliveryAccount: 'USAFAFWERX',
  },
  {
    name: 'SpaceWERX',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'SBIR/TACFI/STRATFI',
    samKeywords: ['SpaceWERX'],
    scrapeUrls: ['https://spacewerx.us'],
  },
  {
    name: 'AAL',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'SBIR/OTA',
    samKeywords: ['Army Applications Laboratory'],
    scrapeUrls: ['https://aal.mil'],
  },
  {
    name: 'xTech',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'Prize Challenge',
    samKeywords: ['xTech'],
    scrapeUrls: ['https://xtech.army.mil'],
  },
  {
    name: 'SOFWERX',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'SBIR/OT Agreement',
    samKeywords: ['SOFWERX', 'USSOCOM SBIR'],
    scrapeUrls: ['https://sofwerx.org'],
  },
  {
    name: 'DIU',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'INNOVATION FACTORY',
    fundingMechanism: 'CSO',
    samKeywords: ['Defense Innovation Unit', 'DIU CSO'],
    scrapeUrls: ['https://www.diu.mil/work-with-us/open-solicitations'],
  },
  {
    name: 'DARPA',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'AGENCY',
    fundingMechanism: 'BAA',
    samKeywords: ['DARPA'],
    scrapeUrls: ['https://www.darpa.mil/work-with-us/opportunities'],
  },
  {
    name: 'IARPA',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'AGENCY',
    fundingMechanism: 'BAA',
    samKeywords: ['IARPA'],
    scrapeUrls: ['https://www.iarpa.gov/research-programs'],
  },
  {
    name: 'NSWC Crane',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'COMMAND',
    fundingMechanism: 'BAA/CSO/OT Agreement',
    samKeywords: ['NSWC Crane', 'N0016424SNB35', 'N00164-25-S-C001'],
  },
  {
    name: 'MIT Lincoln Lab',
    enabled: true,
    pattern: 'html_scrape',
    institutionType: 'FFRDC',
    fundingMechanism: 'CSO',
    scrapeUrls: ['https://www.ll.mit.edu/partner-us/small-business-industry/commercial-solutions-opening'],
  },
  {
    name: 'NRL',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'AGENCY',
    fundingMechanism: 'BAA',
    samKeywords: ['Naval Research Laboratory', 'N00173-24-S-BA01'],
    scrapeUrls: ['https://www.nrl.navy.mil/Doing-Business/Contracts/Broad-Agency-Announcements/'],
  },
  {
    name: 'AFC/AI2C',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'COMMAND',
    fundingMechanism: 'BAA',
    samKeywords: ['Army Futures Command', 'AI2C', 'W911QX-24-S-1001'],
  },
  {
    name: 'DEVCOM ARL',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'COMMAND',
    fundingMechanism: 'BAA',
    samKeywords: ['DEVCOM ARL', 'Army Research Laboratory'],
  },
  {
    name: 'PEO IEW&S',
    enabled: true,
    pattern: 'sam_keyword',
    institutionType: 'COMMAND',
    fundingMechanism: 'BAA',
    samKeywords: ['PEO IEW&S', 'PEO IEW'],
  },
];
