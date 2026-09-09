import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── GET /api/leads/info-request/lookup ──────────────────────────────────────
// Public endpoint: look up lead address by info-request link token.
// Returns only the address (not full lead data) for the public form.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const supabase = createClient();

    // Find the info request
    const { data: infoRequest, error } = await supabase
      .from('lead_info_requests')
      .select('id, lead_id, submitted_at')
      .eq('link_token', token)
      .single();

    if (error || !infoRequest) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    if (infoRequest.submitted_at) {
      return NextResponse.json({ error: 'This link has already been used' }, { status: 409 });
    }

    // Get the lead's address only (not full lead data)
    const { data: lead } = await supabase
      .from('leads')
      .select('id, address, city, state, zip')
      .eq('id', infoRequest.lead_id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      lead_id: lead.id,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
