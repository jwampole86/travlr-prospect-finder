import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { MEDIA_BUCKET } from '@/lib/media/propertyMedia';

/** GET: every photo captured for a lead, with its rights state, for the review screen. Admin only. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { leadId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return NextResponse.json({ error: 'Bad lead id' }, { status: 400 });
  const db = getSupabaseAdmin();
  let q = db.from('property_media').select('*').eq('lead_id', leadId).order('position');
  if (auth.actor.organizationId) q = q.eq('organization_id', auth.actor.organizationId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = await Promise.all((data ?? []).map(async (m: Record<string, unknown>) => {
    let previewUrl = String(m.image_url);
    if (m.storage_path) {
      const { data: signed } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(String(m.storage_path), 900);
      if (signed?.signedUrl) previewUrl = signed.signedUrl;
    }
    return { ...m, previewUrl };
  }));
  return NextResponse.json({ items });
}
