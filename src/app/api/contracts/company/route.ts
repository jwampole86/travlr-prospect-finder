import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCompanyProfile } from '@/lib/services/contractService';
import { isValidEmail } from '@/lib/auth/signingAccess';
import { COMPANY_REQUIRED, type CompanyProfile } from '@/lib/contracts/types';

export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ company: await getCompanyProfile() });
}

// PUT /api/contracts/company — who "the Company" is on every contract.
export async function PUT(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json() as Partial<CompanyProfile>;
  const next = Object.fromEntries(COMPANY_REQUIRED.map((k) => [k, String(body[k] ?? '').trim()])) as unknown as CompanyProfile;
  for (const k of ['signer_email', 'notice_email'] as const) if (next[k] && !isValidEmail(next[k])) return NextResponse.json({ error: `${k.replace('_', ' ')} is not a valid email` }, { status: 400 });

  const { error } = await getSupabaseAdmin().from('contract_company_profile').update({ ...next, updated_at: new Date().toISOString(), updated_by: auth.actor.user.id }).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ company: next });
}
