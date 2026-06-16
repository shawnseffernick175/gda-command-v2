-- F-832: Update regulatory tracker URLs to canonical authoritative sources.
-- Aligns with CEO-reviewed Digest page layout: every Regulatory Tracker row
-- must link to the best authoritative destination for that regulation.

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-12'
WHERE title = 'Acquisition of Commercial Products and Services';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-15'
WHERE title = 'Contracting by Negotiation';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-16'
WHERE title = 'Types of Contracts';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-19'
WHERE title = 'Small Business Programs';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-52'
WHERE title = 'Solicitation Provisions and Contract Clauses';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/dfars/subpart-204.73-safeguarding-covered-defense-information-and-cyber-incident-reporting'
WHERE title = 'Safeguarding Covered Defense Information';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/dfars/252.204-7019-notice-nist-sp-800-171-dod-assessment-requirements'
WHERE title = 'NIST SP 800-171 DoD Assessment Requirements';

UPDATE vault_regulatory_catalog SET url = 'https://csrc.nist.gov/pubs/sp/800/171/r2/final'
WHERE title = 'NIST SP 800-171 DoD Assessment Methodology';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-15#FAR_15_403_3'
WHERE title = 'Only One Offer';

UPDATE vault_regulatory_catalog SET url = 'https://www.acquisition.gov/far/part-9'
WHERE title = 'Contractor Qualifications';
