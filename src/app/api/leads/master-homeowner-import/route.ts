import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';
import {
  MASTER_FIELDS,
  inferMasterFieldMapping,
  isPostOfficeBoxAddress,
  normalizeLeadFingerprint,
  normalizeMasterAddress,
  normalizeMasterPhone,
  parseEstimatedHomeValue,
  qualityScore,
  type MasterFieldMapping,
} from '@/lib/masterHomeownerData';

type ImportAction = 'initialize' | 'chunk' | 'complete';
type RawRow = Record<string, unknown>;

async function inferMappingWithAnthropic(headers: string[], fallback: MasterFieldMapping) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || /your-|placeholder|changeme|example/i.test(apiKey)) return fallback;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    temperature: 0,
    messages: [{
      role: 'user',
      content: `Map these homeowner database column headers to canonical fields. Return only a JSON object whose keys may be ${MASTER_FIELDS.join(', ')} and whose values are exact input headers. Never infer row values. Headers: ${JSON.stringify(headers)}`,
    }],
  });
  const text = response.content.find(block => block.type === 'text')?.text || '';
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as MasterFieldMapping;
    const valid = Object.fromEntries(Object.entries(parsed).filter(([field, header]) => MASTER_FIELDS.includes(field as typeof MASTER_FIELDS[number]) && headers.includes(String(header))));
    return { ...fallback, ...valid } as MasterFieldMapping;
  } catch {
    return fallback;
  }
}

function text(row: RawRow, mapping: MasterFieldMapping, field: keyof MasterFieldMapping) {
  const header = mapping[field];
  return header ? String(row[header] ?? '').trim() : '';
}

function parsePositiveNumber(value: string) {
  const match = String(value || '').replace(/[$,%]/g, '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizePercent(value: number | null) {
  if (value == null) return null;
  return value <= 1 ? Math.round(value * 100) : Math.round(value);
}

function calculateMasterRevenue(
  beds: number | null,
  state: string,
  monthlyRent: number | null,
  explicit: { adr: number | null; occupancy: number | null; grossMonthly: number | null; netMonthly: number | null }
) {
  const occupancy = normalizePercent(explicit.occupancy);
  if (explicit.grossMonthly || explicit.netMonthly || explicit.adr) {
    const grossMonthly = explicit.grossMonthly || (explicit.adr && occupancy ? Math.round(explicit.adr * 30 * (occupancy / 100)) : null);
    const netMonthly = explicit.netMonthly || (grossMonthly ? Math.round(grossMonthly * 0.65) : null);
    return { estimatedADR: explicit.adr, estimatedOccupancy: occupancy, estimatedGrossMonthly: grossMonthly, estimatedNetMonthly: netMonthly, source: 'MASTER_UPLOAD' };
  }

  if (!beds && !monthlyRent) return null;
  const baseADR: Record<number, number> = { 1: 120, 2: 175, 3: 225, 4: 295, 5: 380, 6: 450 };
  const bedroomCount = Math.min(Math.max(Math.round(beds || 3), 1), 6);
  const stateMultipliers: Record<string, number> = { CA: 1.35, NY: 1.30, WA: 1.20, CO: 1.15, FL: 1.25, TX: 1.10, NV: 1.20, MA: 1.25, OR: 1.10, ME: 1.05, UT: 1.10, MD: 1.15, AZ: 1.10, ID: 1.05, MT: 1.05, WY: 1.05 };
  const estimatedADR = Math.round((baseADR[bedroomCount] || 225) * (stateMultipliers[state] || 1));
  const estimatedOccupancy = Math.round(Math.min(0.78, 0.62 + bedroomCount * 0.02) * 100);
  const estimatedGrossMonthly = Math.round(estimatedADR * 30 * (estimatedOccupancy / 100));
  const estimatedNetMonthly = Math.round(estimatedGrossMonthly * 0.65) || monthlyRent;
  return { estimatedADR, estimatedOccupancy, estimatedGrossMonthly, estimatedNetMonthly, source: 'TRAVLR_MASTER_ESTIMATE' };
}

function propertyFacts(rawData: Record<string, unknown> | null | undefined) {
  const data = rawData || {};
  return {
    beds: typeof data.bedrooms === 'number' ? data.bedrooms : null,
    baths: typeof data.bathrooms === 'number' ? data.bathrooms : null,
    monthlyRent: typeof data.current_monthly_rent === 'number' ? data.current_monthly_rent : null,
    estimatedADR: typeof data.estimated_adr === 'number' ? data.estimated_adr : null,
    estimatedOccupancy: typeof data.estimated_occupancy === 'number' ? data.estimated_occupancy : null,
    estimatedGrossMonthly: typeof data.estimated_gross_monthly === 'number' ? data.estimated_gross_monthly : null,
    estimatedNetMonthly: typeof data.estimated_net_monthly === 'number' ? data.estimated_net_monthly : null,
    listingUrl: typeof data.listing_url === 'string' ? data.listing_url : '',
  };
}

export async function POST(request: NextRequest) {
  const authorization = await requireApiActor(request);
  if (!authorization.actor) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const supabase = authorization.actor.client;
  const user = authorization.actor.user;

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action as ImportAction;

    if (action === 'initialize') {
      const headers = Array.isArray(body.headers) ? body.headers.map(String).slice(0, 200) : [];
      if (!body.filename || headers.length === 0) return NextResponse.json({ error: 'Filename and headers are required' }, { status: 400 });
      const fallback = inferMasterFieldMapping(headers);
      const mapping = body.useAnthropic === false ? fallback : await inferMappingWithAnthropic(headers, fallback);
      if (body.propertyOnly === true) {
        delete mapping.owner_name;
        delete mapping.phone;
        delete mapping.email;
      }
      if (!mapping.address || !mapping.state) {
        return NextResponse.json({ error: 'Could not identify required property address and state columns', mapping }, { status: 422 });
      }
      const { data, error } = await supabase.from('master_homeowner_files').insert({
        user_id: user.id,
        filename: String(body.filename),
        storage_path: String(body.storagePath || ''),
        content_type: String(body.contentType || 'text/plain'),
        size_bytes: Number(body.sizeBytes || 0),
        field_mapping: mapping,
      }).select('id').single();
      if (error) throw error;
      return NextResponse.json({ fileId: data.id, mapping });
    }

    if (action === 'chunk') {
      const fileId = String(body.fileId || '');
      const rows = Array.isArray(body.rows) ? body.rows as RawRow[] : [];
      const mapping = (body.mapping || {}) as MasterFieldMapping;
      const rowOffset = Number(body.rowOffset || 0);
      const minimumScore = Math.max(50, Math.min(100, Number(body.minimumScore || 70)));
      const propertyOnly = body.propertyOnly === true;
      if (!fileId || rows.length === 0 || rows.length > 1000) return NextResponse.json({ error: 'A valid file and up to 1,000 rows are required' }, { status: 400 });

      const { data: ownedFile } = await supabase.from('master_homeowner_files').select('id').eq('id', fileId).eq('user_id', user.id).maybeSingle();
      if (!ownedFile) return NextResponse.json({ error: 'Master file not found' }, { status: 404 });

      const records = rows.map((row, index) => {
        const address = text(row, mapping, 'address');
        const isPoBox = isPostOfficeBoxAddress(address);
        const city = text(row, mapping, 'city');
        const state = text(row, mapping, 'state').toUpperCase().slice(0, 2);
        const zip = text(row, mapping, 'zip').replace(/\D/g, '').slice(0, 5);
        const ownerName = text(row, mapping, 'owner_name');
        const phone = normalizeMasterPhone(text(row, mapping, 'phone'));
        const email = text(row, mapping, 'email').toLowerCase();
        const apn = text(row, mapping, 'apn');
        const county = text(row, mapping, 'county');
        const residenceType = text(row, mapping, 'residence_type');
        const homeAge = text(row, mapping, 'home_age');
        const estimatedHomeValue = parseEstimatedHomeValue(text(row, mapping, 'estimated_home_value'));
        const ownershipStatus = text(row, mapping, 'ownership_status');
        const bedrooms = parsePositiveNumber(text(row, mapping, 'bedrooms'));
        const bathrooms = parsePositiveNumber(text(row, mapping, 'bathrooms'));
        const currentMonthlyRent = parsePositiveNumber(text(row, mapping, 'current_monthly_rent'));
        const estimatedADR = parsePositiveNumber(text(row, mapping, 'estimated_adr'));
        const estimatedOccupancy = parsePositiveNumber(text(row, mapping, 'estimated_occupancy'));
        const estimatedGrossMonthly = parsePositiveNumber(text(row, mapping, 'estimated_gross_monthly'));
        const estimatedNetMonthly = parsePositiveNumber(text(row, mapping, 'estimated_net_monthly'));
        const listingUrl = text(row, mapping, 'listing_url');
        const score = propertyOnly
          ? Math.min(100, (address ? 35 : 0) + (city && state ? 15 : 0) + (zip ? 10 : 0) + (county ? 5 : 0) + (residenceType ? 10 : 0) + (homeAge ? 5 : 0) + (estimatedHomeValue >= 400000 ? 15 : estimatedHomeValue > 0 ? 8 : 0) + (/owner/i.test(ownershipStatus) ? 10 : 0))
          : qualityScore({ address, city, state, zip, ownerName, phone, email, apn });
        const propertyQualified = /owner/i.test(ownershipStatus) && /single family|multi-family/i.test(residenceType) && estimatedHomeValue >= 400000;
        return {
          file_id: fileId,
          user_id: user.id,
          source_row: rowOffset + index + 1,
          property_address: address,
          city: city || null,
          state: state || null,
          zip: zip || null,
          address_fingerprint: normalizeMasterAddress(address, city, state, zip),
          apn: apn || null,
          owner_name: ownerName || null,
          phone: phone || null,
          email: email || null,
          county: county || null,
          residence_type: residenceType || null,
          home_age: homeAge || null,
          estimated_home_value: estimatedHomeValue || null,
          ownership_status: ownershipStatus || null,
          quality_score: score,
          criteria_met: Boolean(!isPoBox && address && state && (propertyOnly ? propertyQualified : (ownerName || phone || email)) && score >= minimumScore),
          raw_data: { address, city, state, zip, county, residence_type: residenceType, home_age: homeAge, estimated_home_value: estimatedHomeValue || null, ownership_status: ownershipStatus, apn: apn || null, bedrooms, bathrooms, current_monthly_rent: currentMonthlyRent, estimated_adr: estimatedADR, estimated_occupancy: estimatedOccupancy, estimated_gross_monthly: estimatedGrossMonthly, estimated_net_monthly: estimatedNetMonthly, listing_url: listingUrl || null },
        };
      }).filter(record => record.property_address && !isPostOfficeBoxAddress(record.property_address) && (!propertyOnly || record.criteria_met));

      const { data: inserted, error: insertError } = await supabase.from('master_homeowner_records').upsert(records, { onConflict: 'file_id,source_row' }).select('id,source_row,owner_name,phone,quality_score,criteria_met');
      if (insertError) throw insertError;

      const sourceRecordByRow = new Map(records.map(record => [record.source_row, record]));
      const leadFingerprints = [...new Set(records.map(record => normalizeLeadFingerprint(record.property_address, record.city || '', record.state || '')))];
      const leads: Array<{ id: string; address_fingerprint: string; contact_name: string | null; contact_phone: string | null; prospect_score: number | null; county: string | null; property_type: string | null; master_property_data: Record<string, unknown> | null; beds: number | null; baths: number | null; price: number | null; estimated_adr: number | null; estimated_occupancy: number | null; estimated_gross_monthly: number | null; estimated_net_monthly: number | null; listing_url: string | null; regulation_status: string | null; verified_owner: boolean | null; verified_number: boolean | null; verified_address: string | boolean | null; stage: string | null }> = [];
      for (let index = 0; index < leadFingerprints.length; index += 100) {
        const { data, error } = await supabase
          .from('leads')
          .select('id,address_fingerprint,contact_name,contact_phone,prospect_score,county,property_type,master_property_data,beds,baths,price,estimated_adr,estimated_occupancy,estimated_gross_monthly,estimated_net_monthly,listing_url,regulation_status,verified_owner,verified_number,verified_address,stage')
          .eq('user_id', user.id)
          .in('address_fingerprint', leadFingerprints.slice(index, index + 100));
        if (error) throw error;
        leads.push(...(data || []));
      }

      const leadByFingerprint = new Map(leads.map(lead => [lead.address_fingerprint, lead]));
      let matched = 0;
      let enriched = 0;
      const matchedRecordIds = new Set<string>();
      const verificationJobs = new Map<string, number>();
      for (const record of inserted || []) {
        if (!record.criteria_met) continue;
        const sourceRecord = sourceRecordByRow.get(record.source_row);
        if (!sourceRecord) continue;
        const fingerprint = normalizeLeadFingerprint(sourceRecord.property_address, sourceRecord.city || '', sourceRecord.state || '');
        const lead = leadByFingerprint.get(fingerprint);
        if (!lead) continue;
        matched += 1;
        matchedRecordIds.add(record.id);
        const update: Record<string, unknown> = { prospect_score: Math.max(Number(lead.prospect_score || 0), Number(record.quality_score || 0)) };
        const fieldsApplied: string[] = [];
        const facts = propertyFacts(sourceRecord.raw_data as Record<string, unknown> | null);
        const revenue = calculateMasterRevenue(facts.beds, sourceRecord.state || '', facts.monthlyRent, { adr: facts.estimatedADR, occupancy: facts.estimatedOccupancy, grossMonthly: facts.estimatedGrossMonthly, netMonthly: facts.estimatedNetMonthly });
        if (!lead.contact_name && record.owner_name) {
          update.contact_name = record.owner_name;
          update.verified_owner = true;
          update.verified_owner_source = 'MASTER_HOMEOWNER_DATA';
          update.verified_owner_method = 'EXACT_ADDRESS_MATCH';
          fieldsApplied.push('contact_name');
        }
        if (!lead.contact_phone && record.phone) {
          update.contact_phone = record.phone;
          update.verified_number = true;
          update.verified_number_source = 'MASTER_HOMEOWNER_DATA';
          update.verified_number_method = 'EXACT_ADDRESS_MATCH';
          update.verified_number_at = new Date().toISOString();
          fieldsApplied.push('contact_phone');
        }
        if (!lead.county && sourceRecord.county) { update.county = sourceRecord.county; fieldsApplied.push('county'); }
        if (!lead.property_type && sourceRecord.residence_type) { update.property_type = sourceRecord.residence_type; fieldsApplied.push('property_type'); }
        if (!lead.beds && facts.beds) { update.beds = facts.beds; fieldsApplied.push('beds'); }
        if (!lead.baths && facts.baths) { update.baths = facts.baths; fieldsApplied.push('baths'); }
        if (!lead.price && facts.monthlyRent) { update.price = facts.monthlyRent; update.price_type = 'rent'; fieldsApplied.push('price'); }
        if (!lead.listing_url && facts.listingUrl) { update.listing_url = facts.listingUrl; fieldsApplied.push('listing_url'); }
        if (revenue) {
          if (!lead.estimated_adr && revenue.estimatedADR) update.estimated_adr = revenue.estimatedADR;
          if (!lead.estimated_occupancy && revenue.estimatedOccupancy) update.estimated_occupancy = revenue.estimatedOccupancy;
          if (!lead.estimated_gross_monthly && revenue.estimatedGrossMonthly) update.estimated_gross_monthly = revenue.estimatedGrossMonthly;
          if (!lead.estimated_net_monthly && revenue.estimatedNetMonthly) update.estimated_net_monthly = revenue.estimatedNetMonthly;
          update.calculation_version = revenue.source;
          update.calculated_at = new Date().toISOString();
          fieldsApplied.push('revenue_estimate');
        }
        const recalculatedScore = calculateProspectScore({
          estimatedNetMonthly: Number(update.estimated_net_monthly ?? lead.estimated_net_monthly ?? 0),
          estimatedGrossMonthly: Number(update.estimated_gross_monthly ?? lead.estimated_gross_monthly ?? 0),
          estimatedADR: Number(update.estimated_adr ?? lead.estimated_adr ?? 0),
          price: Number(update.price ?? lead.price ?? 0),
          beds: Number(update.beds ?? lead.beds ?? 0),
          baths: Number(update.baths ?? lead.baths ?? 0),
          propertyType: String(update.property_type ?? lead.property_type ?? ''),
          regulationStatus: lead.regulation_status,
          verifiedOwner: Boolean(update.verified_owner ?? lead.verified_owner),
          verifiedNumber: Boolean(update.verified_number ?? lead.verified_number),
          verifiedAddress: lead.verified_address,
          contactPhone: String(update.contact_phone ?? lead.contact_phone ?? ''),
          stage: lead.stage,
        }).score;
        update.prospect_score = Math.max(Number(update.prospect_score || 0), recalculatedScore);
        update.master_property_data = {
          ...(lead.master_property_data || {}),
          home_age: sourceRecord.home_age,
          estimated_home_value: sourceRecord.estimated_home_value,
          ownership_status: sourceRecord.ownership_status,
          bedrooms: facts.beds,
          bathrooms: facts.baths,
          current_monthly_rent: facts.monthlyRent,
          estimated_net_monthly: revenue?.estimatedNetMonthly || facts.estimatedNetMonthly,
          source: 'MASTER_PROPERTY_DATA',
        };
        fieldsApplied.push('master_property_data');
        const { error: updateError } = await supabase.from('leads').update(update).eq('id', lead.id).eq('user_id', user.id);
        if (!updateError) {
          enriched += fieldsApplied.length > 0 ? 1 : 0;
          verificationJobs.set(lead.id, Math.max(Number(lead.prospect_score || 0), Number(update.prospect_score || 0)));
          await supabase.from('lead_master_homeowner_matches').upsert({ user_id: user.id, lead_id: lead.id, master_record_id: record.id, match_score: 100, match_strategy: 'EXACT_NORMALIZED_ADDRESS', fields_applied: fieldsApplied }, { onConflict: 'lead_id,master_record_id' });
        }
      }

      let leadsCreated = 0;
      if (body.createQualifiedLeads === true) {
        const insertedByRow = new Map((inserted || []).map(record => [record.source_row, record]));
        const uniqueUnmatched = new Map<string, typeof records[number]>();
        for (const record of records) {
          const insertedRecord = insertedByRow.get(record.source_row);
          if (!record.criteria_met || !insertedRecord || matchedRecordIds.has(insertedRecord.id)) continue;
          const fingerprint = normalizeLeadFingerprint(record.property_address, record.city || '', record.state || '');
          if (!leadByFingerprint.has(fingerprint) && !uniqueUnmatched.has(fingerprint)) uniqueUnmatched.set(fingerprint, record);
        }
        const leadRows = [...uniqueUnmatched.values()].map(record => {
          const facts = propertyFacts(record.raw_data as Record<string, unknown> | null);
          const revenue = calculateMasterRevenue(facts.beds, record.state || '', facts.monthlyRent, { adr: facts.estimatedADR, occupancy: facts.estimatedOccupancy, grossMonthly: facts.estimatedGrossMonthly, netMonthly: facts.estimatedNetMonthly });
          const score = calculateProspectScore({
            estimatedNetMonthly: revenue?.estimatedNetMonthly || facts.estimatedNetMonthly,
            estimatedGrossMonthly: revenue?.estimatedGrossMonthly || facts.estimatedGrossMonthly,
            estimatedADR: revenue?.estimatedADR || facts.estimatedADR,
            price: facts.monthlyRent,
            beds: facts.beds,
            baths: facts.baths,
            propertyType: record.residence_type,
            regulationStatus: 'Unknown',
            verifiedOwner: Boolean(record.owner_name),
            verifiedNumber: Boolean(record.phone),
            contactPhone: record.phone || null,
            stage: 'New Lead',
          }).score;
          return {
            id: crypto.randomUUID(), user_id: user.id, address: record.property_address,
            city: record.city || '', state: record.state || '', zip: record.zip || '',
          lat: null, lng: null, beds: facts.beds, baths: facts.baths, price: facts.monthlyRent,
          estimated_adr: revenue?.estimatedADR || facts.estimatedADR, estimated_occupancy: revenue?.estimatedOccupancy || facts.estimatedOccupancy,
          estimated_gross_monthly: revenue?.estimatedGrossMonthly || facts.estimatedGrossMonthly, estimated_net_monthly: revenue?.estimatedNetMonthly || facts.estimatedNetMonthly,
          days_on_market: null,
          source: 'Direct', stage: 'New Lead', regulation_status: 'Unknown',
          prospect_score: Math.max(propertyOnly ? 50 : record.quality_score, score),
            address_source: 'MASTER_HOMEOWNER_DATA',
            contact_name: record.owner_name || '', contact_phone: record.phone || '',
            verified_owner: Boolean(record.owner_name), verified_number: Boolean(record.phone),
            verified_owner_source: record.owner_name ? 'MASTER_HOMEOWNER_DATA' : null,
            verified_number_source: record.phone ? 'MASTER_HOMEOWNER_DATA' : null,
            county: record.county || null, property_type: record.residence_type || null,
            listing_url: facts.listingUrl || null,
            price_type: facts.monthlyRent ? 'rent' : null,
            calculation_version: revenue?.source || null,
            calculated_at: revenue ? new Date().toISOString() : null,
            enrichment_status: 'pending',
            enrichment_queued_at: new Date().toISOString(),
            master_property_data: { home_age: record.home_age, estimated_home_value: record.estimated_home_value, ownership_status: record.ownership_status, bedrooms: facts.beds, bathrooms: facts.baths, current_monthly_rent: facts.monthlyRent, estimated_net_monthly: revenue?.estimatedNetMonthly || facts.estimatedNetMonthly, source: 'MASTER_PROPERTY_DATA' },
            notes: propertyOnly
              ? `Created from qualified master property data. Listing, rent, regulations, and contact details require verification.`
              : `Created from master homeowner file. Quality score: ${record.quality_score}.`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          };
        });
        if (leadRows.length > 0) {
          const { data: created, error } = await supabase.from('leads').upsert(leadRows, { onConflict: 'address_fingerprint', ignoreDuplicates: true }).select('id');
          if (error) throw error;
          leadsCreated = created?.length || 0;
          (created || []).forEach(lead => verificationJobs.set(lead.id, propertyOnly ? 50 : minimumScore));
        }
      }
      if (verificationJobs.size > 0) {
        await supabase.from('listing_verification_jobs').upsert(
          [...verificationJobs].map(([leadId, priority]) => ({ user_id: user.id, lead_id: leadId, priority })),
          { onConflict: 'lead_id', ignoreDuplicates: true }
        );
      }
      return NextResponse.json({ processed: records.length, qualified: records.filter(record => record.criteria_met).length, matched, enriched, leadsCreated });
    }

    if (action === 'complete') {
      const fileId = String(body.fileId || '');
      const { error } = await supabase.from('master_homeowner_files').update({
        status: 'completed', row_count: Number(body.rowCount || 0), qualified_count: Number(body.qualifiedCount || 0), matched_count: Number(body.matchedCount || 0), leads_created: Number(body.leadsCreated || 0), completed_at: new Date().toISOString(),
      }).eq('id', fileId).eq('user_id', user.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown import action' }, { status: 400 });
  } catch (error) {
    console.error('[master-homeowner-import]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 500 });
  }
}