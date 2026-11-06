import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { mirrorPhoto } from '@/lib/media/propertyMedia';
import { RIGHTS_BASES, validateRightsChange, type RightsBasis, type RightsStatus } from '@/lib/media/rights';

/**
 * PATCH { rights_status?, rights_basis?, rights_note?, hidden?, is_hero? }. A person records why a photo may be published; clearing one
 * also copies it into our own storage. The reviewer and time are recorded. Admin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { rights_status?: RightsStatus; rights_basis?: RightsBasis | null; rights_note?: string | null; hidden?: boolean; is_hero?: boolean };

  const db = getSupabaseAdmin();
  let q = db.from('property_media').select('*').eq('id', id);
  if (auth.actor.organizationId) q = q.eq('organization_id', auth.actor.organizationId);
  const { data: current } = await q.maybeSingle();
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.rights_status !== undefined) {
    const change = { status: body.rights_status, basis: body.rights_status === 'cleared' ? body.rights_basis ?? current.rights_basis : null, note: body.rights_note ?? current.rights_note };
    const problem = validateRightsChange(change);
    if (problem) return NextResponse.json({ error: problem }, { status: 422 });
    if (change.basis && !(RIGHTS_BASES as readonly string[]).includes(change.basis)) return NextResponse.json({ error: 'Unknown basis' }, { status: 422 });
    Object.assign(patch, { rights_status: change.status, rights_basis: change.basis ?? null, rights_note: (change.note ?? '').toString().slice(0, 500) || null, reviewed_by: auth.actor.user.id, reviewed_at: new Date().toISOString() });
    // A photo no longer cleared is also no longer the hero of a gallery.
    if (change.status !== 'cleared') patch.is_hero = false;
  }
  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden;
  if (typeof body.is_hero === 'boolean' && (body.is_hero === false || (patch.rights_status ?? current.rights_status) === 'cleared')) {
    if (body.is_hero) await db.from('property_media').update({ is_hero: false }).eq('lead_id', current.lead_id).eq('organization_id', current.organization_id);
    patch.is_hero = body.is_hero;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const { data, error } = await db.from('property_media').update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });

  let mirror: { ok: boolean; error?: string } | null = null;
  if (data.rights_status === 'cleared' && !data.storage_path) mirror = await mirrorPhoto(db, data);
  return NextResponse.json({ item: data, mirror });
}
