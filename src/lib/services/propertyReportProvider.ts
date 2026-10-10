/**
 * Property Report (RapidAPI, by IgorMicrobilt / MicroBilt) — tax assessment,
 * deed, mortgage, and notice-of-default (NOD) records filed in 3,100+ counties.
 * Free-tier (Basic $0/mo) subscription. Notably, NOD records are a genuine
 * financial-distress signal (pre-foreclosure) not available from any of this
 * app's other property providers.
 *
 * SECURITY: RAPIDAPI_KEY_* are read server-side only, never exposed to the client.
 * Reuses the same account-level RapidAPI key rotation as rapidApiRealEstateService.ts.
 *
 * Real request/response shapes confirmed via MicroBilt's own public OpenAPI spec
 * (https://developer.microbilt.com/sites/default/files/apidoc_specs/PropertySearch_2.yaml,
 * NOT Cloudflare-blocked) — the RapidAPI marketplace listing's own docs only
 * expose a generic "body: object" with no field list, so the vendor's own spec
 * was needed to find the real MBSPOTPropertyReportRq_Type shape:
 *   POST /GetReport — body: { PropertyAddress: {Addr1, City, StateProv, PostalCode},
 *                             OwnerInfo?: [{PersonName: {FirstName, LastName}}] }
 *   GET  /GetArchiveReport?AppId=... — re-fetch a previous report (valid 90 days)
 * Response (MBSPOTPropertyReportRs_Type): PropertyMatchInd, PropertyReportSummary,
 * DeedRecord[], AssessmentRecord[] (owner names, assessed value, year built, beds,
 * baths, pool, garage, HVAC, etc), MortgageRecord[], NODRecord[] (notice of default —
 * trustor names, unpaid balance, auction date — the distress signal above).
 */

const PROPERTY_REPORT_HOST = 'property-report.p.rapidapi.com';

function getRapidApiKeys(): string[] {
  return [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3]
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '' && !/your-rapidapi-key/i.test(k));
}

interface PropertyReportFetchResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

async function propertyReportFetch(path: string, init: RequestInit = {}): Promise<PropertyReportFetchResult> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) return { ok: false, error: 'No RAPIDAPI_KEY_* configured' };

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (const key of keys) {
    try {
      const res = await fetch(`https://${PROPERTY_REPORT_HOST}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': PROPERTY_REPORT_HOST, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403 || res.status === 429) {
        lastStatus = res.status;
        // Distinguish a RapidAPI gateway auth failure (bad/unsubscribed key) from
        // the provider's own backend rejecting the request downstream of the
        // gateway — observed live: this provider's proxy forwards to MicroBilt's
        // Apigee-fronted backend, which 401s with {fault:{faultstring:"Invalid
        // access token",...}} for EVERY request regardless of method, even though
        // the RapidAPI subscription/key itself is valid. That's a provider-side
        // misconfiguration, not a "not subscribed" error — surface it as such.
        const faultString = (data as { fault?: { faultstring?: string } } | null)?.fault?.faultstring;
        lastError = faultString ? `Provider backend rejected the request: ${faultString}` : `HTTP ${res.status}`;
        continue; // try the next key
      }

      if (!res.ok) {
        return { ok: false, status: res.status, data, error: (data as { message?: string })?.message || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  return { ok: false, status: lastStatus, error: lastError || 'All RapidAPI keys failed' };
}

export interface PropertyReportAddressInput {
  addr1: string;
  city: string;
  stateProv: string;
  postalCode: string;
  ownerFirstName?: string;
  ownerLastName?: string;
}

interface PersonInfoRaw {
  PersonName?: { FirstName?: string; LastName?: string; FullName?: string };
}
interface CurrencyAmountRaw {
  Amt?: number;
  CurCode?: string;
}
interface AssessmentRecordRaw {
  Owner1Name?: PersonInfoRaw;
  Owner2Name?: PersonInfoRaw;
  AssessedValueAmt?: CurrencyAmountRaw;
  PropertyTotalValueAmt?: CurrencyAmountRaw;
  TaxAmount?: CurrencyAmountRaw;
  YearBuilt?: string;
  NumBedrooms?: string;
  NumFullBaths?: string;
  LotSize?: string;
  Pool?: string;
  Garage?: string;
  PriorSaleAmt?: CurrencyAmountRaw;
  PriorSaleDt?: string;
}
interface DeedRecordRaw {
  Buyer1?: PersonInfoRaw;
  Buyer2?: PersonInfoRaw;
  SellerName?: PersonInfoRaw;
  SaleLoanAmt?: CurrencyAmountRaw;
  RecordingDt?: string;
}
interface MortgageRecordRaw {
  Borrower1?: PersonInfoRaw;
  MortgageAmt?: CurrencyAmountRaw;
  LenderDBAName?: string;
  RecordingDt?: string;
}
interface NodRecordRaw {
  Trustor1Name?: PersonInfoRaw;
  UnpaidBalanceAmt?: CurrencyAmountRaw;
  PastDueAmt?: CurrencyAmountRaw;
  AuctionDt?: string;
  RecordingDt?: string;
}
interface PropertyReportResponseRaw {
  MsgRsHdr?: { RqUID?: string; Status?: { StatusCode?: number; StatusDesc?: string } };
  PropertyMatchInd?: { CurrentOwnerNameMatch?: string; CurrentOwnerSiteAddrMatch?: string };
  AssessmentRecord?: AssessmentRecordRaw[];
  DeedRecord?: DeedRecordRaw[];
  MortgageRecord?: MortgageRecordRaw[];
  NODRecord?: NodRecordRaw[];
}

export interface PropertyReportResult {
  appId?: string;
  matched: boolean;
  ownerName?: string;
  assessedValue?: number;
  yearBuilt?: string;
  bedrooms?: string;
  bathrooms?: string;
  hasPreForeclosure: boolean;
  nodCount: number;
  lastSaleAmount?: number;
  lastSaleDate?: string;
  raw: PropertyReportResponseRaw;
}

function personFullName(p?: PersonInfoRaw): string | undefined {
  if (!p?.PersonName) return undefined;
  return p.PersonName.FullName || [p.PersonName.FirstName, p.PersonName.LastName].filter(Boolean).join(' ') || undefined;
}

/** POST /GetReport — submit an address to pull deed/assessment/mortgage/NOD records. */
export async function getPropertyReport(
  input: PropertyReportAddressInput
): Promise<{ ok: boolean; report?: PropertyReportResult; error?: string; status?: number }> {
  const body: Record<string, unknown> = {
    PropertyAddress: {
      Addr1: input.addr1,
      City: input.city,
      StateProv: input.stateProv,
      PostalCode: input.postalCode,
    },
  };
  if (input.ownerFirstName || input.ownerLastName) {
    body.OwnerInfo = [{ PersonName: { FirstName: input.ownerFirstName, LastName: input.ownerLastName } }];
  }

  const result = await propertyReportFetch('/GetReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  const raw = result.data as PropertyReportResponseRaw;
  const assessment = raw?.AssessmentRecord?.[0];
  const deed = raw?.DeedRecord?.[0];
  const nodRecords = raw?.NODRecord || [];

  return {
    ok: true,
    report: {
      appId: raw?.MsgRsHdr?.RqUID,
      matched: raw?.PropertyMatchInd?.CurrentOwnerSiteAddrMatch === 'Y' || Boolean(assessment),
      ownerName: personFullName(assessment?.Owner1Name) || personFullName(deed?.Buyer1),
      assessedValue: assessment?.AssessedValueAmt?.Amt ?? assessment?.PropertyTotalValueAmt?.Amt,
      yearBuilt: assessment?.YearBuilt,
      bedrooms: assessment?.NumBedrooms,
      bathrooms: assessment?.NumFullBaths,
      hasPreForeclosure: nodRecords.length > 0,
      nodCount: nodRecords.length,
      lastSaleAmount: deed?.SaleLoanAmt?.Amt,
      lastSaleDate: deed?.RecordingDt,
      raw,
    },
  };
}

/** GET /GetArchiveReport — re-fetch a previously pulled report (valid up to 90 days) by its AppId (RqUID). */
export async function getArchivedPropertyReport(
  appId: string
): Promise<{ ok: boolean; report?: PropertyReportResponseRaw; error?: string; status?: number }> {
  const result = await propertyReportFetch(`/GetArchiveReport?${new URLSearchParams({ AppId: appId })}`);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }
  return { ok: true, report: result.data as PropertyReportResponseRaw };
}

/** Lightweight reachability check for the integration-health dashboard. */
export async function getPropertyReportHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await getPropertyReport({ addr1: '530 EAKER WAY', city: 'ANTIOCH', stateProv: 'CA', postalCode: '94509' });
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: result.error || 'Property Report rejected the request (RapidAPI key not subscribed, or the provider\'s backend is misconfigured)', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Property Report unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Property Report API is reachable', hasApiKey: true };
}
