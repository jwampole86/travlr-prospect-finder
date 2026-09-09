import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get('leadId');

  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const { data, error } = await supabase.rpc('trace_regulation', { p_lead_id: leadId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trace: data });
}
