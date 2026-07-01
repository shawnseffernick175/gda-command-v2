/**
 * Envision capability catalog seed — F-306.
 *
 * Seeds ≥15 capabilities from CEO-doc corpus + Envision's confirmed offerings.
 * Each capability is evidence-grade A or B, backed by past-performance scope.
 *
 * Categories: training_simulation, systems_engineering, logistics_sustainment,
 *             field_services, c5isr, digital_readiness, program_management
 *
 * OU1/OU2 (Riverstone, PD Systems) catalogs seeded as read-only teaming context.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

interface SeedCapability {
  ou: string;
  name: string;
  category: string;
  description: string;
  naics_codes: string[];
  psc_codes: string[];
  agencies_strong_in: string[];
  certifications: string[];
  evidence_grade: string;
}

const ENVISION_CAPABILITIES: SeedCapability[] = [
  {
    ou: 'envision',
    name: 'Logistics & Supply Chain Management',
    category: 'logistics_sustainment',
    description: 'End-to-end logistics support including warehouse management, distribution, transportation, and supply chain optimization for military and federal agencies.',
    naics_codes: ['541614', '541611', '561210'],
    psc_codes: ['R706', 'R408'],
    agencies_strong_in: ['DoD-Army', 'DLA', 'USCG'],
    certifications: ['ISO 9001:2015', 'CMMI-DEV ML3'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'Training Development & Delivery',
    category: 'training_simulation',
    description: 'Instructor-led and technology-enabled training program design, development, and delivery for military readiness and institutional training commands.',
    naics_codes: ['611512', '541715', '541611'],
    psc_codes: ['U008', 'U012'],
    agencies_strong_in: ['TRADOC', 'CASCOM', 'DoD-Army'],
    certifications: ['ISO 9001:2015', 'CMMI-DEV ML3'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'Systems Engineering & Integration',
    category: 'systems_engineering',
    description: 'Full lifecycle systems engineering including requirements analysis, design, integration, test and evaluation for complex defense programs.',
    naics_codes: ['541330', '541715', '541714'],
    psc_codes: ['R425', 'R408'],
    agencies_strong_in: ['PEO C3T', 'TACOM', 'DoD-Army'],
    certifications: ['CMMI-DEV ML3', 'ISO 9001:2015'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'C5ISR Support Services',
    category: 'c5isr',
    description: 'Command, Control, Communications, Computers, Cyber, Intelligence, Surveillance, and Reconnaissance systems support, maintenance, and operations.',
    naics_codes: ['541715', '541714', '541330'],
    psc_codes: ['D318', 'D316'],
    agencies_strong_in: ['PEO C3T', 'DoD-Army', 'CECOM'],
    certifications: ['CMMI-DEV ML3', 'CMMC ML2'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'Field Services & Maintenance',
    category: 'field_services',
    description: 'On-site technical support, equipment maintenance, repair, and sustainment services for deployed military systems and installations.',
    naics_codes: ['561210', '541614', '811310'],
    psc_codes: ['J998', 'J015'],
    agencies_strong_in: ['Army Sustainment Cmd', 'TACOM', 'DoD-Army'],
    certifications: ['ISO 9001:2015'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'Program & Project Management',
    category: 'program_management',
    description: 'Defense program management office support including schedule management, risk analysis, earned value management, and acquisition strategy advisory.',
    naics_codes: ['541611', '541618', '541690'],
    psc_codes: ['R408', 'R499'],
    agencies_strong_in: ['DoD-Army', 'DoD-Navy', 'VA'],
    certifications: ['CMMI-DEV ML3', 'ISO 9001:2015'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'IT Modernization & Cloud Services',
    category: 'digital_readiness',
    description: 'Legacy system modernization, cloud migration (AWS/Azure GovCloud), DevSecOps implementation, and enterprise IT service management.',
    naics_codes: ['541715', '541512', '541519'],
    psc_codes: ['D302', 'D308'],
    agencies_strong_in: ['DoD-Army', 'VA', 'DHS'],
    certifications: ['CMMC ML2', 'ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Acquisition & Procurement Support',
    category: 'program_management',
    description: 'Federal acquisition lifecycle support including market research, source selection, contract administration, and FAR/DFARS compliance advisory.',
    naics_codes: ['541611', '541618'],
    psc_codes: ['R408', 'R707'],
    agencies_strong_in: ['DoD-Army', 'DHS', 'FEMA'],
    certifications: ['ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Data Analytics & Decision Support',
    category: 'digital_readiness',
    description: 'Data engineering, analytics platform development, business intelligence dashboards, and AI/ML integration for mission data exploitation.',
    naics_codes: ['541715', '541720', '541990'],
    psc_codes: ['D307', 'D399'],
    agencies_strong_in: ['DoD-Army', 'VA', 'DHS'],
    certifications: ['CMMC ML2'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Test & Evaluation Services',
    category: 'systems_engineering',
    description: 'Developmental and operational test and evaluation for weapon systems, communications equipment, and software-intensive defense programs.',
    naics_codes: ['541715', '541380', '541714'],
    psc_codes: ['R425', 'T015'],
    agencies_strong_in: ['DoD-Army', 'PEO C3T', 'ATEC'],
    certifications: ['CMMI-DEV ML3', 'ISO 9001:2015'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'Facility Operations & Maintenance',
    category: 'field_services',
    description: 'Government facility operations, maintenance, janitorial, and grounds keeping services for military installations and federal buildings.',
    naics_codes: ['561210', '561720', '561790'],
    psc_codes: ['S206', 'S216'],
    agencies_strong_in: ['DoD-Army', 'VA', 'FEMA'],
    certifications: ['ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Cybersecurity & Information Assurance',
    category: 'c5isr',
    description: 'RMF assessment and authorization, vulnerability management, continuous monitoring, and cybersecurity operations for DoD networks.',
    naics_codes: ['541715', '541690', '541519'],
    psc_codes: ['D310', 'D316'],
    agencies_strong_in: ['DoD-Army', 'DISA', 'DHS'],
    certifications: ['CMMC ML2', 'CMMI-DEV ML3'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Instructional Systems Design',
    category: 'training_simulation',
    description: 'ADDIE-based curriculum development, training needs analysis, courseware development, and learning management system implementation.',
    naics_codes: ['611512', '611430', '541715'],
    psc_codes: ['U008', 'U099'],
    agencies_strong_in: ['TRADOC', 'CASCOM', 'DoD-USMC'],
    certifications: ['ISO 9001:2015'],
    evidence_grade: 'A',
  },
  {
    ou: 'envision',
    name: 'OCONUS Operations Support',
    category: 'logistics_sustainment',
    description: 'Overseas contingency operations logistics, base operations support, and deployed force sustainment services.',
    naics_codes: ['541614', '561210', '541690'],
    psc_codes: ['R706', 'S216'],
    agencies_strong_in: ['DoD-Army', 'DoD-SOCOM', 'USAID'],
    certifications: ['ISO 9001:2015', 'CMMI-DEV ML3'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Maritime & Coast Guard Services',
    category: 'field_services',
    description: 'Coast Guard cutter maintenance, maritime logistics, port security support, and vessel engineering services.',
    naics_codes: ['541614', '541330', '336611'],
    psc_codes: ['J998', 'R706'],
    agencies_strong_in: ['USCG', 'DoD-Navy', 'DHS'],
    certifications: ['ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'Special Operations Forces Support',
    category: 'field_services',
    description: 'SOF-peculiar equipment maintenance, training support, and mission planning assistance for USSOCOM components.',
    naics_codes: ['541715', '541614', '611512'],
    psc_codes: ['R408', 'U008'],
    agencies_strong_in: ['DoD-SOCOM', 'USN Special Warfare', 'DoD-Army'],
    certifications: ['CMMI-DEV ML3'],
    evidence_grade: 'B',
  },
  {
    ou: 'envision',
    name: 'RS3 Task Order Execution',
    category: 'logistics_sustainment',
    description: 'Army Responsive Strategic Sourcing for Services (RS3) task order execution spanning training, logistics, engineering, and facility support.',
    naics_codes: ['541611', '541614', '561210'],
    psc_codes: ['R408', 'R706'],
    agencies_strong_in: ['Army Sustainment Cmd', 'CASCOM', 'DoD-Army'],
    certifications: ['ISO 9001:2015', 'CMMI-DEV ML3'],
    evidence_grade: 'A',
  },
];

const PARTNER_CAPABILITIES: SeedCapability[] = [
  // Riverstone (OU2) — teaming context only
  {
    ou: 'riverstone',
    name: 'TechSIGINT & Signals Intelligence',
    category: 'intelligence',
    description: 'Technical signals intelligence collection, processing, and analysis for IC and DoD mission partners.',
    naics_codes: ['541715', '541714'],
    psc_codes: ['D310', 'D316'],
    agencies_strong_in: ['NSA', 'USCYBERCOM', 'NRO'],
    certifications: ['HUBZone', 'WOSB', 'SDB', 'CMMI-DEV ML3'],
    evidence_grade: 'B',
  },
  {
    ou: 'riverstone',
    name: 'Cyber Engineering & DevSecOps',
    category: 'cyber',
    description: 'Classified DevSecOps pipeline development, cyber tool integration, and mission software engineering for IC customers.',
    naics_codes: ['541715', '541519'],
    psc_codes: ['D302', 'D310'],
    agencies_strong_in: ['NSA', 'NGA', 'USCYBERCOM'],
    certifications: ['HUBZone', 'WOSB', 'CMMC RPO'],
    evidence_grade: 'B',
  },
  {
    ou: 'riverstone',
    name: 'Mission Software Development',
    category: 'software',
    description: 'Custom mission application development including Oxbow Security Platform and SecurScale CaaS products.',
    naics_codes: ['541715', '541511'],
    psc_codes: ['D302', 'D308'],
    agencies_strong_in: ['NSA', 'NRO', 'IC components'],
    certifications: ['HUBZone', 'WOSB', 'ISO 9001:2015'],
    evidence_grade: 'B',
  },
  // PD Systems (OU1) — teaming context only
  {
    ou: 'pd_systems',
    name: 'XR/AR/VR Immersive Training',
    category: 'training_simulation',
    description: 'Extended reality training environments, augmented reality maintenance aids, and virtual reality simulation for military readiness.',
    naics_codes: ['541715', '611512', '541714'],
    psc_codes: ['U008', 'U099'],
    agencies_strong_in: ['PEO STRI', 'TRADOC', 'Joint Training Centers'],
    certifications: ['V3 Veteran', 'ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'pd_systems',
    name: 'Digital Twin & LVC Integration',
    category: 'training_simulation',
    description: 'Digital twin development, live-virtual-constructive simulation integration, and distributed training architecture.',
    naics_codes: ['541715', '541714', '541330'],
    psc_codes: ['U008', 'R425'],
    agencies_strong_in: ['PEO STRI', 'TRADOC', 'DoD-SOCOM'],
    certifications: ['V3 Veteran', 'ISO 9001:2015'],
    evidence_grade: 'B',
  },
  {
    ou: 'pd_systems',
    name: 'Battlefield Effects & SERE Support',
    category: 'training_simulation',
    description: 'Battlefield effects simulation, SERE (Survival, Evasion, Resistance, Escape) training support, and force-on-force exercise management.',
    naics_codes: ['611512', '541715', '561210'],
    psc_codes: ['U008', 'U012'],
    agencies_strong_in: ['TRADOC', 'CASCOM', 'Special Operations'],
    certifications: ['V3 Veteran'],
    evidence_grade: 'B',
  },
];

export async function seedCapabilities(): Promise<{ inserted: number; skipped: number }> {
  const allCapabilities = [...ENVISION_CAPABILITIES, ...PARTNER_CAPABILITIES];
  let inserted = 0;
  let skipped = 0;

  for (const cap of allCapabilities) {
    const existing = await pool.query(
      `SELECT id FROM capabilities WHERE ou = $1 AND name = $2 LIMIT 1`,
      [cap.ou, cap.name],
    );
    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO capabilities (
        ou, name, category, description,
        naics_codes, psc_codes, agencies_strong_in,
        certifications, evidence_grade, last_reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        cap.ou,
        cap.name,
        cap.category,
        cap.description,
        cap.naics_codes,
        cap.psc_codes,
        cap.agencies_strong_in,
        cap.certifications,
        cap.evidence_grade,
      ],
    );
    inserted++;
  }

  logger.info({ inserted, skipped, total: allCapabilities.length }, 'Capability catalog seed complete');
  return { inserted, skipped };
}
