import { NextRequest, NextResponse } from 'next/server';
import { validateContact } from '@/lib/contactValidation';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';

/**
 * POST /api/estimate/validate-contact  (public)
 * { email, phone?, phoneRequired?, keepEmail? } -> live feedback while the homeowner types their details.
 * Checks format, disposable and mistyped domains, whether the domain can receive mail, and US phone number structure.
 */
export async function POST(req: NextRequest) {
  if (!allowRequest(`validate:${clientIp(req.headers)}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const result = await validateContact({
    email: String(body.email ?? '').slice(0, 254),
    phone: String(body.phone ?? '').slice(0, 40),
    phoneRequired: body.phoneRequired === true,
    keepEmail: body.keepEmail === true,
  });
  return NextResponse.json({
    ok: Object.keys(result.errors).length === 0,
    errors: result.errors,
    email: { level: result.email.level, message: result.email.message, suggestion: result.emailSuggestion, normalized: result.email.normalized },
    phone: { level: result.phone.level, message: result.phone.message, formatted: result.phone.formatted, normalized: result.phone.normalized },
  });
}
