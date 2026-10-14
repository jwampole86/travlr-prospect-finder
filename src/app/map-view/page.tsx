import AppLayout from '@/components/AppLayout';
import MapViewClient from './components/MapViewClient';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { MapPoint } from './components/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COLUMNS = 'id,address,city,state,zip,lat,lng,prospect_score,board_stage,owner,estimated_net_monthly,luxury,program,regulation_status,has_phone,geocode_source,beds,baths';

async function loadPoints(): Promise<{ points: MapPoint[]; total: number }> {
  const db = getSupabaseAdmin();
  const { count } = await db.from('pipeline_board_leads').select('id', { count: 'exact', head: true });
  const total = count ?? 0;
  const pages = await Promise.all(Array.from({ length: Math.ceil(total / 1000) }, (_, i) =>
    db.from('pipeline_board_leads').select(COLUMNS).eq('has_location', true).order('id').range(i * 1000, i * 1000 + 999)));
  const rows = pages.flatMap(p => (p.data ?? []) as Array<Record<string, any>>);
  return {
    total,
    points: rows.map(r => ({
      id: String(r.id), address: r.address, city: r.city, state: r.state, zip: r.zip, lat: Number(r.lat), lng: Number(r.lng), score: r.prospect_score ?? 0, stage: r.board_stage,
      owner: r.owner ?? null, net: r.estimated_net_monthly ?? null, luxury: !!r.luxury, program: r.program ?? null, regulation: r.regulation_status ?? 'Unknown', hasPhone: !!r.has_phone,
      approx: !!r.geocode_source && r.geocode_source !== 'census', beds: r.beds ?? null, baths: r.baths ?? null,
    })),
  };
}

export default async function MapViewPage() {
  const { points, total } = await loadPoints().catch(() => ({ points: [] as MapPoint[], total: 0 }));
  return (
    <AppLayout>
      <MapViewClient points={points} total={total} />
    </AppLayout>
  );
}
