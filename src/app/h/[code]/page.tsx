import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyClick, geoFromHeaders } from '@/lib/clickClassifier';
import { getOfferData } from '@/lib/services/cohostOffer';
import OfferClient from './OfferClient';

export const dynamic = 'force-dynamic';

export default async function HostOfferPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getSupabaseAdmin();
  const data = await getOfferData(db, code);
  if (!data) notFound();

  // Link-preview and security scanners are logged but not counted as the owner opening the page.
  try {
    const h = await headers();
    const info = classifyClick(h.get('user-agent'), h);
    await db.from('cohost_offer_events').insert({ code: data.code, event: 'view', is_bot: info.isBot, device: info.device, country: geoFromHeaders(h).country });
    if (!info.isBot) await db.rpc('cohost_offer_view', { p_code: data.code });
  } catch { /* tracking never blocks the page */ }

  return <OfferClient data={data} />;
}
