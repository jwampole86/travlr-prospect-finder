import { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import LeadManagementClient from './components/LeadManagementClient';
import { LeadTableSkeleton } from '@/components/ui/LoadingSkeleton';
import { cityRegulations } from '@/data/regulations';
import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Lead } from '@/data/mockLeads';

async function fetchInitialLeads(): Promise<{ leads: Lead[]; total: number }> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fetch only the first page server-side for fast initial render.
    // All subsequent pages + filtering are handled client-side via /api/leads/paginated.
    const PAGE_SIZE = 50;

    const { data, error, count } = await supabase
      .from('leads')
      .select(
        'id,address,city,state,zip,lat,lng,beds,baths,price,price_type,source,stage,regulation_status,prospect_score,days_on_market,last_checked,listing_url,notes,contact_name,contact_phone,tags,estimated_adr,estimated_occupancy,estimated_gross_monthly,estimated_net_monthly,photos,created_at,updated_at,is_synthetic,contact_info_requested,contact_info_requested_at',
        { count: 'exact' }
      )
      // Include leads where is_synthetic is NULL or false.
      // Using neq('is_synthetic', true) would exclude NULL rows in PostgreSQL.
      .or('is_synthetic.is.null,is_synthetic.eq.false')
      .order('prospect_score', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error('[LeadManagement] fetchInitialLeads error:', error.message);
      return { leads: [], total: 0 };
    }

    if (!data || data.length === 0) return { leads: [], total: 0 };

    const leads = (data as Record<string, unknown>[]).map((d) => ({
      id: String(d.id),
      address: String(d.address || ''),
      city: String(d.city || ''),
      state: String(d.state || ''),
      zip: String(d.zip || ''),
      lat: Number(d.lat || 0),
      lng: Number(d.lng || 0),
      beds: Number(d.beds || 0),
      baths: Number(d.baths || 0),
      price: Number(d.price || 0),
      priceType: (d.price_type as 'sale' | 'rent') || 'rent',
      source: String(d.source || ''),
      stage: String(d.stage || 'New Lead') as Lead['stage'],
      regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
      prospectScore: Number(d.prospect_score || 0),
      daysOnMarket: Number(d.days_on_market || 0),
      lastChecked: String(d.last_checked || new Date().toISOString().split('T')[0]),
      listingUrl: d.listing_url ? String(d.listing_url) : '',
      contactName: d.contact_name ? String(d.contact_name) : undefined,
      contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
      contactEmail: undefined,
      notes: String(d.notes || ''),
      tags: Array.isArray(d.tags) ? d.tags : [],
      estimatedADR: Number(d.estimated_adr || 0),
      estimatedOccupancy: Number(d.estimated_occupancy || 0),
      estimatedGrossMonthly: Number(d.estimated_gross_monthly || 0),
      estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
      photos: Array.isArray(d.photos) ? d.photos : [],
      createdAt: String(d.created_at || new Date().toISOString()),
      updatedAt: String(d.updated_at || d.created_at || new Date().toISOString()),
      isSynthetic: Boolean(d.is_synthetic),
      contactInfoRequested: Boolean(d.contact_info_requested),
    }));

    return { leads, total: count ?? 0 };
  } catch (err) {
    console.error('[LeadManagement] fetchInitialLeads threw:', err);
    return { leads: [], total: 0 };
  }
}

export default async function LeadManagementPage() {
  const { leads: initialLeads, total: totalLeads } = await fetchInitialLeads();

  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-2xl mx-auto w-full">
            <div className="mb-4">
              <div className="h-7 w-48 bg-muted animate-pulse rounded mb-1" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </div>
            <LeadTableSkeleton rows={12} />
          </div>
        }
      >
        <LeadManagementClient
          initialLeads={initialLeads}
          totalLeads={totalLeads}
          regulations={cityRegulations}
        />
      </Suspense>
    </AppLayout>
  );
}