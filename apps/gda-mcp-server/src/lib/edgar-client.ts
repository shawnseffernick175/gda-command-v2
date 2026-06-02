/**
 * Thin fetch wrapper for the SEC EDGAR API (F-509).
 * Free, no API key — SEC only requires a descriptive User-Agent header.
 * Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */

const EDGAR_SUBMISSIONS = 'https://data.sec.gov/submissions/';
const EDGAR_COMPANY_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const TIMEOUT_MS = 10_000;

// SEC requires a User-Agent identifying the requester.
const USER_AGENT =
  process.env['SEC_EDGAR_USER_AGENT'] ?? 'GDA Command (gda-mcp@csr-llc.tech)';

export interface EdgarFiling {
  accession_number: string;
  form: string;
  filing_date: string;
  report_date: string;
  primary_document: string;
  primary_doc_description: string;
  url: string;
}

export interface EdgarCompany {
  cik: string;
  name: string;
  ticker: string | null;
  sic: string | null;
  sic_description: string | null;
  fiscal_year_end: string | null;
  recent_filings: EdgarFiling[];
}

export class EdgarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EdgarError';
  }
}

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  tickers?: string[];
  sic?: string;
  sicDescription?: string;
  fiscalYearEnd?: string;
  filings?: {
    recent?: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

/** Zero-pad a CIK to the 10-digit form EDGAR uses for submissions. */
function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

/**
 * Resolve a ticker symbol or company name to a 10-digit CIK using SEC's
 * public company_tickers.json index.
 */
export async function resolveCik(query: string): Promise<{ cik: string; name: string; ticker: string } | null> {
  const res = await fetchEdgar(EDGAR_COMPANY_TICKERS);
  const data = (await res.json()) as Record<string, CompanyTickerEntry>;

  const q = query.trim().toLowerCase();
  const entries = Object.values(data);

  // Exact ticker match first
  const byTicker = entries.find((e) => e.ticker.toLowerCase() === q);
  if (byTicker) {
    return { cik: padCik(byTicker.cik_str), name: byTicker.title, ticker: byTicker.ticker };
  }
  // Exact name match
  const byNameExact = entries.find((e) => e.title.toLowerCase() === q);
  if (byNameExact) {
    return { cik: padCik(byNameExact.cik_str), name: byNameExact.title, ticker: byNameExact.ticker };
  }
  // Substring name match
  const byNamePartial = entries.find((e) => e.title.toLowerCase().includes(q));
  if (byNamePartial) {
    return { cik: padCik(byNamePartial.cik_str), name: byNamePartial.title, ticker: byNamePartial.ticker };
  }
  return null;
}

/**
 * Fetch a company's profile + recent filings from SEC EDGAR.
 * Accepts a ticker (e.g. "LMT"), a CIK (e.g. "0000936468" or "936468"),
 * or a company name. Returns the most recent filings, optionally filtered
 * by form type (e.g. "10-K", "8-K").
 */
export async function getCompanyFilings(params: {
  query: string;
  formType?: string;
  limit: number;
}): Promise<EdgarCompany> {
  let cik: string;
  let resolvedTicker: string | null = null;
  let resolvedName: string | null = null;

  // If the query looks like a CIK (all digits), use it directly.
  if (/^\d+$/.test(params.query.trim())) {
    cik = padCik(params.query);
  } else {
    const resolved = await resolveCik(params.query);
    if (!resolved) {
      throw new EdgarError(`No SEC-registered company found for "${params.query}"`);
    }
    cik = resolved.cik;
    resolvedTicker = resolved.ticker;
    resolvedName = resolved.name;
  }

  const res = await fetchEdgar(`${EDGAR_SUBMISSIONS}CIK${cik}.json`);
  if (res.status === 404) {
    throw new EdgarError(`No SEC submissions found for CIK ${cik}`);
  }
  const data = (await res.json()) as SubmissionsResponse;

  const recent = data.filings?.recent;
  const filings: EdgarFiling[] = [];
  if (recent) {
    const count = recent.accessionNumber.length;
    for (let i = 0; i < count; i++) {
      const form = recent.form[i] ?? '';
      if (params.formType && form.toUpperCase() !== params.formType.toUpperCase()) continue;
      const accession = recent.accessionNumber[i] ?? '';
      const accessionNoDashes = accession.replace(/-/g, '');
      const primaryDoc = recent.primaryDocument[i] ?? '';
      const cikNoPad = String(Number(cik));
      filings.push({
        accession_number: accession,
        form,
        filing_date: recent.filingDate[i] ?? '',
        report_date: recent.reportDate[i] ?? '',
        primary_document: primaryDoc,
        primary_doc_description: recent.primaryDocDescription[i] ?? '',
        url: `https://www.sec.gov/Archives/edgar/data/${cikNoPad}/${accessionNoDashes}/${primaryDoc}`,
      });
      if (filings.length >= params.limit) break;
    }
  }

  return {
    cik,
    name: data.name ?? resolvedName ?? '',
    ticker: data.tickers?.[0] ?? resolvedTicker,
    sic: data.sic ?? null,
    sic_description: data.sicDescription ?? null,
    fiscal_year_end: data.fiscalYearEnd ?? null,
    recent_filings: filings,
  };
}

async function fetchEdgar(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
