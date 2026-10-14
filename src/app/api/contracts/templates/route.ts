import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCompanyProfile, getTemplate, listActiveTemplates } from '@/lib/services/contractService';
import { renderContract, sampleValues } from '@/lib/contracts/render';
import type { ContractKind } from '@/lib/contracts/types';

// GET /api/contracts/templates                 active templates with field lists
// GET /api/contracts/templates?kind=…&preview=1  the template rendered with sample values (admins)
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const kind = searchParams.get('kind') as ContractKind | null;
  if (kind && searchParams.get('preview') === '1') {
    const template = await getTemplate({ kind });
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const company = await getCompanyProfile();
    const html = renderContract(template, sampleValues(template), company, [{ name: '[Signer name]' }], { draft: template.legalReview !== 'approved' });
    return NextResponse.json({ html });
  }
  return NextResponse.json({ templates: (await listActiveTemplates()).map(({ bodyHtml: _body, ...rest }) => rest) });
}

// PATCH /api/contracts/templates  { id, legalReview: 'approved' | 'pending', reviewNotes? } — record counsel's sign-off.
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id, legalReview, reviewNotes } = await req.json() as { id?: string; legalReview?: string; reviewNotes?: string };
  if (!id || !['approved', 'pending'].includes(legalReview ?? '')) return NextResponse.json({ error: 'id and legalReview are required' }, { status: 400 });

  const approved = legalReview === 'approved';
  const { error } = await getSupabaseAdmin().from('contract_templates').update({
    legal_review: legalReview, review_notes: reviewNotes ?? null, reviewed_by: approved ? auth.actor.user.id : null, reviewed_at: approved ? new Date().toISOString() : null,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
