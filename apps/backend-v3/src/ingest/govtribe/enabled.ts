export function isGovTribeEnabled(): boolean {
  return process.env['GOVTRIBE_ENABLED'] === 'true';
}
