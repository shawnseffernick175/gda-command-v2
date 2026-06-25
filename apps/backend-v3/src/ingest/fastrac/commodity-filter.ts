/**
 * FasTrac commodity / supply-procurement filter — F-631.
 *
 * Rejects SAM.gov records that are commodity buys, facilities maintenance,
 * or raw supply purchases rather than genuine innovation / R&D / early-need
 * signals.  Config-driven so new junk patterns self-heal without code changes.
 *
 * Three rejection layers:
 *  1. Title matches a leading FSC/PSC supply-code pattern (e.g. "16--SCISSORS ASSEMBLY")
 *  2. Title or description contains commodity/facilities keywords
 *  3. PSC (classificationCode) falls in a supply/maintenance product class
 */

/** Leading FSC/PSC code pattern: 2-4 digits followed by "--" */
const FSC_PATTERN = /^\d{2,4}--/;

/**
 * Commodity / facilities / supply keywords.  Matched case-insensitively
 * against title + description.  Each entry is a word-boundary-aware regex
 * fragment compiled once at module load.
 */
export const COMMODITY_KEYWORDS: string[] = [
  // Mechanical parts / hardware
  'assembly',
  'bushing',
  'seal',
  'cable',
  'valve',
  'fitting',
  'gasket',
  'hose',
  'clamp',
  'bracket',
  'coupling',
  'bearing',
  'flange',
  'bolt',
  'nut',
  'washer',
  'screw',
  'rivet',
  'spring',
  'shim',
  'spacer',
  'ring seal',
  'frame,hoist',
  'sensor cable',
  'scissors assembly',

  // Facilities / maintenance
  'janitorial',
  'custodial',
  'boiler',
  'hvac',
  'plumbing',
  'roofing',
  'paving',
  'mowing',
  'landscaping',
  'groundskeeping',
  'snow removal',
  'trash removal',
  'waste removal',
  'pest control',
  'herbicide',
  'pesticide',
  'fence installation',
  'security fence',
  'building materials',
  'elevator maintenance',
  'fire suppression',
  'fire alarm',
  'drain rehab',
  'powerhouse drain',
  'replace boiler',
  'replace chiller',
  'window replacement',
  'floor replacement',
  'carpet replacement',

  // Supply / commodity procurement signals
  'office supplies',
  'cleaning supplies',
  'paper products',
  'toner cartridge',
  'printer cartridge',
  'fuel delivery',
  'fuel supply',
  'food service',
  'laundry service',
  'linen service',
  'uniform supply',
];

/**
 * Compiled commodity keyword regexes — built once, reused per signal.
 * Each keyword is wrapped in a case-insensitive regex.
 */
const COMMODITY_REGEXES: RegExp[] = COMMODITY_KEYWORDS.map(
  (kw) => kw.includes(' ') ? new RegExp(`\\b${kw}`, 'i') : new RegExp(`\\b${kw}\\b`, 'i'),
);

/**
 * PSC (Product Service Code) prefixes that indicate supply / maintenance
 * rather than R&D / professional services.  Two-character prefixes cover
 * entire FSC groups; four-character prefixes are specific sub-classes.
 *
 * Reference: https://www.acquisition.gov/PSC_Manual
 */
export const SUPPLY_PSC_PREFIXES: string[] = [
  // FSC supply groups (first two digits)
  '10', // Weapons
  '12', // Fire control equipment
  '13', // Ammunition & explosives (commodity)
  '14', // Guided missiles (commodity hardware)
  '15', // Aircraft & airframe structural components (parts)
  '16', // Aircraft components & accessories
  '17', // Aircraft launch/landing/ground handling equip
  '19', // Ships, small craft, pontoons, floating docks
  '20', // Ship & marine equipment
  '22', // Railway equipment
  '23', // Ground effect vehicles, motor vehicles, trailers
  '24', // Tractors
  '25', // Vehicular equipment components
  '26', // Tires & tubes
  '28', // Engines, turbines & components
  '29', // Engine accessories
  '30', // Mechanical power transmission equipment
  '31', // Bearings
  '32', // Woodworking machinery & equipment
  '34', // Metalworking machinery
  '35', // Service & trade equipment
  '36', // Special industry machinery
  '37', // Agricultural machinery & equipment
  '38', // Construction, mining, excavating, highway equipment
  '39', // Materials handling equipment
  '40', // Rope, cable, chain, fittings
  '41', // Refrigeration, AC, air circulation equip
  '42', // Fire fighting, rescue, safety equipment
  '43', // Pumps & compressors
  '44', // Furnace, steam plant, drying equip
  '46', // Water purification & sewage treatment equip
  '47', // Pipe, tubing, hose, fittings
  '48', // Valves
  '49', // Maintenance & repair shop equipment
  '51', // Hand tools
  '52', // Measuring tools
  '53', // Hardware & abrasives
  '54', // Prefab structures & scaffolding
  '55', // Lumber, millwork, plywood, veneer
  '56', // Construction & building materials
  '61', // Electric wire, power & distribution equip
  '62', // Lighting fixtures & lamps
  '63', // Alarm, signal, security detection systems
  '65', // Medical, dental, veterinary equip & supplies
  '66', // Instruments & laboratory equipment
  '67', // Photographic equipment
  '68', // Chemicals & chemical products
  '69', // Training aids & devices
  '71', // Furniture
  '72', // Household & commercial furnishings
  '73', // Food preparation & serving equipment
  '74', // Office machines, text processing, visible record equip
  '75', // Office supplies & devices
  '76', // Books, maps, other published materials
  '77', // Musical instruments, phonographs, radios
  '78', // Recreational & athletic equipment
  '79', // Cleaning equipment & supplies
  '80', // Brushes, paints, sealers, adhesives
  '81', // Containers, packaging, packing supplies
  '83', // Textiles, leather, furs, apparel, shoes, tents, flags
  '84', // Clothing, individual equipment, insignia
  '85', // Toiletries
  '87', // Agricultural supplies
  '88', // Live animals
  '89', // Subsistence (food)
  '91', // Fuels, lubricants, oils, waxes
  '93', // Nonmetallic fabricated materials
  '94', // Nonmetallic crude materials
  '95', // Metal bars, sheets, shapes
  '96', // Ores, minerals, primary products
  '99', // Miscellaneous
];

/**
 * Facilities maintenance service PSC codes (letter-based).
 */
export const MAINTENANCE_PSC_PREFIXES: string[] = [
  'S2', // Housekeeping services
  'Z1', // Maintenance, repair, alteration of real property
  'Z2', // Maintenance, repair, alteration of real property
  'J0', // Maintenance, repair of equipment
  'Y1', // Construction of structures & facilities
];

export interface CommodityFilterResult {
  rejected: boolean;
  reason: string | null;
}

/**
 * Test whether a signal is commodity/supply/facilities junk that
 * should NOT enter FasTrac.
 *
 * @param title - Signal title (required)
 * @param description - Signal description/summary (optional)
 * @param classificationCode - PSC / product service code (optional)
 * @returns { rejected, reason } — if rejected is true, the signal should be excluded
 */
export function isCommoditySignal(
  title: string,
  description?: string | null,
  classificationCode?: string | null,
): CommodityFilterResult {
  // Layer 1: FSC/PSC supply-code title pattern (e.g. "16--SCISSORS ASSEMBLY")
  if (FSC_PATTERN.test(title.trim())) {
    return { rejected: true, reason: 'fsc_title_pattern' };
  }

  // Layer 2: Commodity / facilities keyword match in title + description
  const textBlob = `${title} ${description ?? ''}`;
  for (const regex of COMMODITY_REGEXES) {
    if (regex.test(textBlob)) {
      return { rejected: true, reason: `keyword:${regex.source}` };
    }
  }

  // Layer 3: PSC-based rejection
  if (classificationCode) {
    const code = classificationCode.trim().toUpperCase();

    for (const prefix of SUPPLY_PSC_PREFIXES) {
      if (code.startsWith(prefix)) {
        return { rejected: true, reason: `psc_supply:${prefix}` };
      }
    }

    for (const prefix of MAINTENANCE_PSC_PREFIXES) {
      if (code.startsWith(prefix)) {
        return { rejected: true, reason: `psc_maintenance:${prefix}` };
      }
    }
  }

  return { rejected: false, reason: null };
}
