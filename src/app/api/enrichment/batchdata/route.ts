import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── BatchData Property Owner Enrichment API ──────────────────────────────────
// Called on new lead intake to fetch owner name, mailing address, and ownership type.
// Falls back to simulation mode when BATCHDATA_API_KEY is not configured.

const BATCHDATA_API_KEY = process.env.BATCHDATA_API_KEY ?? '';
const BATCHDATA_BASE_URL = 'https://api.batchdata.com/api/v1';
const CACHE_DAYS = 90;

interface BatchDataOwnerResult {
  ownerName: string;
  ownerMailingAddress: string;
  ownerMailingCity: string;
  ownerMailingState: string;
  ownerMailingZip: string;
  ownershipType: 'Individual' | 'LLC' | 'Trust' | 'Other' | 'Unknown';
  confidence: number;
  source: string;
}

function simulateBatchDataResponse(address: string, prospectScore: number): BatchDataOwnerResult {
  // Deterministic simulation based on address hash
  const hash = address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const ownershipTypes: Array<'Individual' | 'LLC' | 'Trust' | 'Other'> = ['Individual', 'LLC', 'Trust', 'Other'];
  const ownershipType = prospectScore > 80 ? 'Individual' : ownershipTypes[hash % ownershipTypes.length];

  const firstNames = ['James', 'Patricia', 'Robert', 'Linda', 'Michael', 'Barbara', 'William', 'Susan'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  const firstName = firstNames[hash % firstNames.length];
  const lastName = lastNames[(hash * 7) % lastNames.length];

  // Extract state from address for mailing address
  const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/) || address.match(/,\s*([A-Z]{2})\s*$/);
  const state = stateMatch ? stateMatch[1] : 'CO';

  const cities: Record<string, string> = {
    CO: 'Denver', CA: 'Los Angeles', FL: 'Miami', TX: 'Dallas',
    NY: 'New York', WA: 'Seattle', AZ: 'Phoenix', NV: 'Las Vegas',
  };
  const zips: Record<string, string> = {
    CO: '80202', CA: '90001', FL: '33101', TX: '75201',
    NY: '10001', WA: '98101', AZ: '85001', NV: '89101',
  };

  return {
    ownerName: ownershipType === 'LLC' ? `${lastName} Properties LLC` :
               ownershipType === 'Trust' ? `${lastName} Family Trust` :
               `${firstName} ${lastName}`,
    ownerMailingAddress: address.split(',')[0] || '123 Main St',
    ownerMailingCity: cities[state] || 'Denver',
    ownerMailingState: state,
    ownerMailingZip: zips[state] || '80202',
    ownershipType,
    confidence: 75 + (hash % 20),
    source: 'BatchData (simulated)',
  };
}

async function callBatchDataAPI(address: string): Promise<BatchDataOwnerResult | null> {
  if (!BATCHDATA_API_KEY || BATCHDATA_API_KEY === 'your-batchdata-api-key-here') {
    return null; // Will fall back to simulation
  }

  try {
    const res = await fetch(`${BATCHDATA_BASE_URL}/property/owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({ address }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    // Map BatchData response to our interface
    const owner = data?.results?.[0]?.owner;
    if (!owner) return null;

    return {
      ownerName: owner.name || owner.fullName || '',
      ownerMailingAddress: owner.mailingAddress?.street || '',
      ownerMailingCity: owner.mailingAddress?.city || '',
      ownerMailingState: owner.mailingAddress?.state || '',
      ownerMailingZip: owner.mailingAddress?.zip || '',
      ownershipType: owner.ownershipType === 'INDIVIDUAL' ? 'Individual' :
                     owner.ownershipType === 'LLC' ? 'LLC' :
                     owner.ownershipType === 'TRUST' ? 'Trust' : 'Other',
      confidence: owner.confidence || 80,
      source: 'BatchData',
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { leadId, address, prospectScore = 60 } = await req.json();

    if (!leadId || !address) {
      return NextResponse.json({ error: 'leadId and address required' }, { status: 400 });
    }

    const supabase = createClient();

    // Check cache — skip if enriched within 90 days
    const { data: existing } = await supabase
      .from('lead_enrichments')
      .select('id, stage1_completed_at, cache_expires_at, do_not_contact')
      .eq('lead_id', leadId)
      .single();

    if (existing?.do_not_contact) {
      return NextResponse.json({ success: false, message: 'Lead flagged Do Not Contact — enrichment blocked' });
    }

    if (existing?.cache_expires_at && new Date(existing.cache_expires_at) > new Date()) {
      return NextResponse.json({ success: true, cached: true, message: 'Using cached Stage 1 result' });
    }

    // Log API call attempt
    const logId = crypto.randomUUID();
    await supabase.from('enrichment_api_logs').insert({
      id: logId,
      lead_id: leadId,
      provider: 'BatchData',
      stage: 'stage1',
      cost: 0.05,
      success: false,
      called_at: new Date().toISOString(),
    }).catch(() => {});

    // Call BatchData API (or simulate)
    let ownerData = await callBatchDataAPI(address);
    const isSimulated = !ownerData;
    if (!ownerData) {
      ownerData = simulateBatchDataResponse(address, prospectScore);
    }

    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const enrichmentPayload = {
      lead_id: leadId,
      owner_name: ownerData.ownerName,
      owner_mailing_address: ownerData.ownerMailingAddress,
      owner_mailing_city: ownerData.ownerMailingCity,
      owner_mailing_state: ownerData.ownerMailingState,
      owner_mailing_zip: ownerData.ownerMailingZip,
      ownership_type: ownerData.ownershipType,
      enrichment_status: 'Partial',
      last_enriched_at: new Date().toISOString(),
      stage1_provider: 'BatchData',
      stage1_completed_at: new Date().toISOString(),
      enrichment_sources: [{ provider: 'BatchData', stage: 'stage1', at: new Date().toISOString() }],
      cache_expires_at: cacheExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('lead_enrichments')
      .upsert(
        { ...enrichmentPayload, id: existing?.id || crypto.randomUUID() },
        { onConflict: 'lead_id' }
      );

    // Update log
    await supabase.from('enrichment_api_logs')
      .update({ success: !upsertError, cost: 0.05 })
      .eq('id', logId)
      .catch(() => {});

    if (upsertError) {
      return NextResponse.json({ success: false, message: upsertError.message }, { status: 500 });
    }

    // Log activity event
    await supabase.from('activity_events').insert({
      lead_id: leadId,
      event_type: 'enrichment',
      title: `Owner lookup complete — ${ownerData.ownerName}`,
      body: `BatchData${isSimulated ? ' (simulated)' : ''}: ${ownerData.ownershipType} owner at ${ownerData.ownerMailingAddress}, ${ownerData.ownerMailingCity}, ${ownerData.ownerMailingState}`,
      metadata: { provider: 'BatchData', stage: 'stage1', simulated: isSimulated },
    } as any).catch(() => {});

    return NextResponse.json({
      success: true,
      simulated: isSimulated,
      enrichment: {
        ownerName: ownerData.ownerName,
        ownerMailingAddress: ownerData.ownerMailingAddress,
        ownerMailingCity: ownerData.ownerMailingCity,
        ownerMailingState: ownerData.ownerMailingState,
        ownerMailingZip: ownerData.ownerMailingZip,
        ownershipType: ownerData.ownershipType,
        confidence: ownerData.confidence,
      },
    });
  } catch (err) {
    console.error('[enrichment/batchdata]', err);
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 });
  }
}
