/**
 * Teaming flag evaluation — Envision-only scope.
 *
 * Evaluates an opportunity against Envision capabilities and partner
 * profiles (Riverstone, PD Systems) to surface teaming triggers.
 * No partner OUs as co-equals — partners are intel records only.
 */

import type { OpportunityRow, TeamingFlag } from './types.js';
import { ENVISION_PRIMARY_NAICS } from '../../constants/envision-naics.js';

// Set-asides Envision can prime on its own (self-cert SDB + small-business lanes).
// 8(a)/HUBZone/WOSB/SDVOSB are intentionally excluded: Envision holds no such
// SBA program cert, so those are teaming-only (see eligibility.ts).
const ENVISION_SET_ASIDES = new Set([
  'SDB',
  'Small Business',
  'SB',
  'Minority-Owned',
]);

const RIVERSTONE_CERTS = ['HUBZone', 'WOSB', 'SDB'];
const PD_SYSTEMS_CERTS = ['V3 Veteran', 'SDVOSB'];

const ENVISION_NAICS_SET = new Set<string>(ENVISION_PRIMARY_NAICS);

const PD_SYSTEMS_NAICS = new Set([
  '561210', '611430', '541715', '541330',
]);

const RIVERSTONE_NAICS = new Set([
  '541511', '541512', '541519', '541690', '518210',
]);

export function evaluateTeamingFlags(opp: OpportunityRow): TeamingFlag[] {
  const flags: TeamingFlag[] = [];
  let flagIdx = 0;

  if (opp.set_aside) {
    const sa = opp.set_aside.trim();

    if (sa.toLowerCase().includes('hubzone')) {
      flags.push({
        id: `tf_${opp.id}_${flagIdx++}`,
        reason: 'HUBZone set-aside',
        suggested_partner: 'riverstone',
        detail: 'Riverstone (HUBZone certified) unlocks the bid.',
      });
    }

    if (
      sa.toLowerCase().includes('sdvosb') ||
      sa.toLowerCase().includes('v3 veteran') ||
      sa.toLowerCase().includes('veteran')
    ) {
      flags.push({
        id: `tf_${opp.id}_${flagIdx++}`,
        reason: 'Veteran set-aside',
        suggested_partner: 'pd_systems',
        detail: 'PD Systems (V3 Veteran) strengthens the bid.',
      });
    }

    if (!ENVISION_SET_ASIDES.has(sa)) {
      for (const cert of RIVERSTONE_CERTS) {
        if (sa.toLowerCase().includes(cert.toLowerCase())) {
          const exists = flags.some(
            (f) => f.suggested_partner === 'riverstone' && f.reason.includes(cert),
          );
          if (!exists) {
            flags.push({
              id: `tf_${opp.id}_${flagIdx++}`,
              reason: `${cert} requirement`,
              suggested_partner: 'riverstone',
              detail: `Riverstone (${cert} certified) unlocks the bid.`,
            });
          }
        }
      }
      for (const cert of PD_SYSTEMS_CERTS) {
        if (sa.toLowerCase().includes(cert.toLowerCase())) {
          const exists = flags.some(
            (f) => f.suggested_partner === 'pd_systems' && f.reason.includes(cert),
          );
          if (!exists) {
            flags.push({
              id: `tf_${opp.id}_${flagIdx++}`,
              reason: `${cert} requirement`,
              suggested_partner: 'pd_systems',
              detail: `PD Systems (${cert}) strengthens the bid.`,
            });
          }
        }
      }
    }
  }

  if (opp.description) {
    const desc = opp.description.toLowerCase();

    if (
      (desc.includes('training') || desc.includes('simulation') || desc.includes('lvc')) &&
      !flags.some((f) => f.suggested_partner === 'pd_systems')
    ) {
      flags.push({
        id: `tf_${opp.id}_${flagIdx++}`,
        reason: 'Training / simulation scope',
        suggested_partner: 'pd_systems',
        detail: 'PD Systems (300+ heads, XR/AR/VR depth) is the natural sub for training scope.',
      });
    }

    if (
      (desc.includes('sigint') ||
        desc.includes('cyber') ||
        desc.includes('classified') ||
        desc.includes('ic clearance')) &&
      !flags.some((f) => f.suggested_partner === 'riverstone')
    ) {
      flags.push({
        id: `tf_${opp.id}_${flagIdx++}`,
        reason: 'IC / cyber scope',
        suggested_partner: 'riverstone',
        detail: 'Riverstone (IC customer base, classified DevSecOps) is the natural sub.',
      });
    }
  }

  if (opp.naics) {
    const n = opp.naics.trim();
    if (!ENVISION_NAICS_SET.has(n) && PD_SYSTEMS_NAICS.has(n)) {
      if (!flags.some((f) => f.suggested_partner === 'pd_systems')) {
        flags.push({
          id: `tf_${opp.id}_${flagIdx++}`,
          reason: `NAICS ${n} alignment`,
          suggested_partner: 'pd_systems',
          detail: `PD Systems has primary capability in NAICS ${n}.`,
        });
      }
    }
    if (!ENVISION_NAICS_SET.has(n) && RIVERSTONE_NAICS.has(n)) {
      if (!flags.some((f) => f.suggested_partner === 'riverstone')) {
        flags.push({
          id: `tf_${opp.id}_${flagIdx++}`,
          reason: `NAICS ${n} alignment`,
          suggested_partner: 'riverstone',
          detail: `Riverstone has primary capability in NAICS ${n}.`,
        });
      }
    }
  }

  return flags;
}
