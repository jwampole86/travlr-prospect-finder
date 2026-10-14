import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail } from '@/lib/propertyOpsApi';
import { isValidEmail } from '@/lib/auth/signingAccess';

export async function GET(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { data } = await ctx.db.from('cleaners').select('id, full_name, email, phone, status, rate_per_turnover').order('full_name');
  return NextResponse.json({ cleaners: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const b = await req.json() as { fullName?: string; email?: string; phone?: string; rate?: number };
  if (!b.fullName?.trim() || (!b.email?.trim() && !b.phone?.trim())) return fail('A name and an email or phone are required');
  if (b.email && !isValidEmail(b.email.trim())) return fail('Invalid email');
  const { data, error } = await ctx.db.from('cleaners').insert({ full_name: b.fullName.trim(), email: b.email?.trim().toLowerCase() || null, phone: b.phone?.trim() || null, status: 'active', rate_per_turnover: b.rate && b.rate > 0 ? b.rate : null }).select('id').single();
  return error ? fail(error.message, 500) : NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const b = await req.json() as { id?: string; status?: string; rate?: number | null };
  if (!b.id) return fail('id is required');
  const update: Record<string, unknown> = {};
  if (b.status) update.status = b.status;
  if ('rate' in b) update.rate_per_turnover = b.rate && b.rate > 0 ? b.rate : null;
  const { error } = await ctx.db.from('cleaners').update(update).eq('id', b.id);
  return error ? fail(error.message, 500) : NextResponse.json({ success: true });
}
