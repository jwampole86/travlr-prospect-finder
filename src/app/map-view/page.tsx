import AppLayout from '@/components/AppLayout';
import MapViewClient from './components/MapViewClient';
import { cityRegulations } from '@/data/regulations';
import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Lead } from '@/data/mockLeads';
import { Suspense } from 'react';

async function fetchLeadsForMap(): Promise<Lead[]> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, beds, baths, price, source, stage, regulation_status, prospect_score, days_on_market, last_checked, contact_name, contact_phone, notes, tags, estimated_net_monthly, created_at, updated_at')
      .eq('is_synthetic', false)
      .order('prospect_score', { ascending: false })
      .limit(1000);

    if (!data || data.length === 0) return [];

    return data.map((d: Record<string, unknown>) => ({
      id: String(d.id),
      address: String(d.address || ''),
      city: String(d.city || ''),
      state: String(d.state || ''),
      zip: String(d.zip || ''),
      beds: Number(d.beds || 0),
      baths: Number(d.baths || 0),
      price: Number(d.price || 0),
      source: String(d.source || ''),
      stage: String(d.stage || 'New Lead') as Lead['stage'],
      regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
      prospectScore: Number(d.prospect_score || 0),
      daysOnMarket: Number(d.days_on_market || 0),
      lastChecked: String(d.last_checked || new Date().toISOString().split('T')[0]),
      contactName: d.contact_name ? String(d.contact_name) : undefined,
      contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
      notes: String(d.notes || ''),
      tags: Array.isArray(d.tags) ? d.tags : [],
      estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
      createdAt: String(d.created_at || new Date().toISOString()),
      updatedAt: String(d.updated_at || d.created_at || new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

export default async function MapViewPage() {
  const leads = await fetchLeadsForMap();

  return (
    <AppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      }>
        <MapViewClient leads={leads} regulations={cityRegulations} />
      </Suspense>
    </AppLayout>
  );
}