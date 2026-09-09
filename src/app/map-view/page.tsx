import AppLayout from '@/components/AppLayout';
import MapViewClient from './components/MapViewClient';
import { cityRegulations } from '@/data/regulations';
import { createClient as createServerClient } from '@supabase/supabase-js';
import type { Lead } from '@/data/mockLeads';
import { Suspense } from 'react';

const MAP_PAGE_SIZE = 1000;

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'alhambra,ca': { lat: 34.0953, lng: -118.1270 },
  'asbury park,nj': { lat: 40.2204, lng: -74.0121 },
  'aspen,co': { lat: 39.1911, lng: -106.8175 },
  'bakersfield,ca': { lat: 35.3733, lng: -119.0187 },
  'bellevue,wa': { lat: 47.6101, lng: -122.2015 },
  'boca raton,fl': { lat: 26.3683, lng: -80.1289 },
  'boulder,co': { lat: 40.0150, lng: -105.2705 },
  'breckenridge,co': { lat: 39.4817, lng: -106.0384 },
  'charlotte,nc': { lat: 35.2271, lng: -80.8431 },
  'dallas,tx': { lat: 32.7767, lng: -96.7970 },
  'denver,co': { lat: 39.7392, lng: -104.9903 },
  'fort lauderdale,fl': { lat: 26.1224, lng: -80.1373 },
  'frisco,co': { lat: 39.5744, lng: -106.0975 },
  'henderson,nv': { lat: 36.0395, lng: -114.9817 },
  'indio,ca': { lat: 33.7206, lng: -116.2156 },
  'jackson,wy': { lat: 43.4799, lng: -110.7624 },
  'la jolla,ca': { lat: 32.8328, lng: -117.2713 },
  'la quinta,ca': { lat: 33.6634, lng: -116.3100 },
  'las vegas,nv': { lat: 36.1716, lng: -115.1391 },
  'los angeles,ca': { lat: 34.0522, lng: -118.2437 },
  'miami,fl': { lat: 25.7617, lng: -80.1918 },
  'miami beach,fl': { lat: 25.7907, lng: -80.1300 },
  'nashville,tn': { lat: 36.1627, lng: -86.7816 },
  'newport beach,ca': { lat: 33.6189, lng: -117.9298 },
  'palm desert,ca': { lat: 33.7222, lng: -116.3745 },
  'palm springs,ca': { lat: 33.8303, lng: -116.5453 },
  'phoenix,az': { lat: 33.4484, lng: -112.0740 },
  'san diego,ca': { lat: 32.7157, lng: -117.1611 },
  'santa barbara,ca': { lat: 34.4208, lng: -119.6982 },
  'scottsdale,az': { lat: 33.4942, lng: -111.9261 },
  'seattle,wa': { lat: 47.6062, lng: -122.3321 },
  'south lake tahoe,ca': { lat: 38.9399, lng: -119.9772 },
  'studio city,ca': { lat: 34.1396, lng: -118.3871 },
  'vail,co': { lat: 39.6403, lng: -106.3742 },
  'west palm beach,fl': { lat: 26.7153, lng: -80.0534 },
};

function resolveMapCoordinates(row: Record<string, unknown>) {
  const city = String(row.city || '');
  const state = String(row.state || '');
  const rawLat = Number(row.lat);
  const rawLng = Number(row.lng);
  const hasValidCoordinates = Number.isFinite(rawLat) && Number.isFinite(rawLng) && rawLat !== 0 && rawLng !== 0;
  const isDefaultDenver = Math.abs(rawLat - 39.7392) < 0.0001 && Math.abs(rawLng + 104.9903) < 0.0001;

  if (hasValidCoordinates && (!isDefaultDenver || `${city.toLowerCase()},${state.toLowerCase()}` === 'denver,co')) {
    return { lat: rawLat, lng: rawLng };
  }

  return CITY_CENTERS[`${city.toLowerCase()},${state.toLowerCase()}`] ?? null;
}

async function fetchLeadsForMap(): Promise<Lead[]> {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const supabaseKey = serviceRoleKey && !serviceRoleKey.includes('your-supabase-service-role-key')
      ? serviceRoleKey
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey
    );
    const rows: Record<string, unknown>[] = [];

    for (let offset = 0; ; offset += MAP_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, lat, lng, beds, baths, price, price_type, source, stage, regulation_status, prospect_score, days_on_market, last_checked, listing_url, contact_name, contact_phone, notes, tags, estimated_adr, estimated_occupancy, estimated_gross_monthly, estimated_net_monthly, photos, created_at, updated_at')
        .eq('is_synthetic', false)
        .order('prospect_score', { ascending: false })
        .range(offset, offset + MAP_PAGE_SIZE - 1);

      if (error) throw error;
      rows.push(...((data || []) as Record<string, unknown>[]));
      if (!data || data.length < MAP_PAGE_SIZE) break;
    }

    if (rows.length === 0) return [];

    return rows.map((d: Record<string, unknown>) => {
      const coordinates = resolveMapCoordinates(d);
      if (!coordinates) return null;

      return {
      id: String(d.id),
      address: String(d.address || ''),
      city: String(d.city || ''),
      state: String(d.state || ''),
      zip: String(d.zip || ''),
      lat: coordinates.lat,
      lng: coordinates.lng,
      beds: Number(d.beds || 0),
      baths: Number(d.baths || 0),
      price: Number(d.price || 0),
      priceType: (d.price_type === 'sale' ? 'sale' : 'rent') as Lead['priceType'],
      source: String(d.source || '') as Lead['source'],
      stage: String(d.stage || 'New Lead') as Lead['stage'],
      regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
      prospectScore: Number(d.prospect_score || 0),
      daysOnMarket: Number(d.days_on_market || 0),
      lastChecked: String(d.last_checked || new Date().toISOString().split('T')[0]),
      listingUrl: String(d.listing_url || ''),
      contactName: d.contact_name ? String(d.contact_name) : undefined,
      contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
      notes: String(d.notes || ''),
      tags: Array.isArray(d.tags) ? d.tags : [],
      estimatedADR: Number(d.estimated_adr || 0),
      estimatedOccupancy: Number(d.estimated_occupancy || 0),
      estimatedGrossMonthly: Number(d.estimated_gross_monthly || 0),
      estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
      photos: Array.isArray(d.photos) ? d.photos : [],
      createdAt: String(d.created_at || new Date().toISOString()),
      updatedAt: String(d.updated_at || d.created_at || new Date().toISOString()),
      };
    }).filter((lead): lead is Lead => Boolean(lead));
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