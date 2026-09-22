import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import {
  MASTER_FIELDS,
  inferMasterFieldMapping,
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
          criteria_met: Boolean(address && state && (propertyOnly ? propertyQualified : (ownerName || phone || email)) && score >= minimumScore),
          raw_data: { address, city, state, zip, county, residence_type: residenceType, home_age: homeAge, estimated_home_value: estimatedHomeValue || null, ownership_status: ownershipStatus, apn: apn || null },
        };
      }).filter(record => record.property_address && (!propertyOnly || record.criteria_met));

      const { data: inserted, error: insertError } = await supabase.from('master_homeowner_records').upsert(records, { onConflict: 'file_id,source_row' }).select('id,source_row,owner_name,phone,quality_score,criteria_met');
      if (insertError) throw insertError;

      const sourceRecordByRow = new Map(records.map(record => [record.source_row, record]));
      const leadFingerprints = [...new Set(records.map(record => normalizeLeadFingerprint(record.property_address, record.city || '', record.state || '')))];
      const leads: Array<{ id: string; address_fingerprint: string; contact_name: string | null; contact_phone: string | null; prospect_score: number | null; county: string | null; property_type: string | null; master_property_data: Record<string, unknown> | null }> = [];
      for (let index = 0; index < leadFingerprints.length; index += 100) {
        const { data, error } = await supabase
          .from('leads')
          .select('id,address_fingerprint,contact_name,contact_phone,prospect_score,county,property_type,master_property_data')
          .eq('user_id', user.id)
          .in('address_fingerprint', leadFingerprints.slice(index, index + 100));
        if (error) throw error;
        leads.push(...(data || []));
      }

      const leadByFingerprint = new Map(leads.map(lead => [lead.address_fingerprint, lead]));
      let matched = 0;
      let enriched = 0;
      const matchedRecordIds = new Set<string>();
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
        update.master_property_data = {
          ...(lead.master_property_data || {}),
          home_age: sourceRecord.home_age,
          estimated_home_value: sourceRecord.estimated_home_value,
          ownership_status: sourceRecord.ownership_status,
          source: 'MASTER_PROPERTY_DATA',
        };
        fieldsApplied.push('master_property_data');
        const { error: updateError } = await supabase.from('leads').update(update).eq('id', lead.id).eq('user_id', user.id);
        if (!updateError) {
          enriched += fieldsApplied.length > 0 ? 1 : 0;
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
        const leadRows = [...uniqueUnmatched.values()].map(record => ({
            id: crypto.randomUUID(), user_id: user.id, address: record.property_address,
            city: record.city || '', state: record.state || '', zip: record.zip || '',
            source: 'Direct', stage: 'New Lead', prospect_score: record.quality_score,
            contact_name: record.owner_name || '', contact_phone: record.phone || '',
            verified_owner: Boolean(record.owner_name), verified_number: Boolean(record.phone),
            verified_owner_source: record.owner_name ? 'MASTER_HOMEOWNER_DATA' : null,
            verified_number_source: record.phone ? 'MASTER_HOMEOWNER_DATA' : null,
            county: record.county || null, property_type: record.residence_type || null,
            master_property_data: { home_age: record.home_age, estimated_home_value: record.estimated_home_value, ownership_status: record.ownership_status, source: 'MASTER_PROPERTY_DATA' },
            notes: `Created from master homeowner file. Quality score: ${record.quality_score}.`,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }));
        if (leadRows.length > 0) {
          const { data: created, error } = await supabase.from('leads').upsert(leadRows, { onConflict: 'address_fingerprint', ignoreDuplicates: true }).select('id');
          if (error) throw error;
          leadsCreated = created?.length || 0;
        }
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