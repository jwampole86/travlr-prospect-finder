import { NextRequest, NextResponse } from 'next/server';
import { createConnectAccount, createAccountLink, getAccountStatus } from '@/lib/services/stripeConnectService';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travlrpro3047.builtwithrocket.new';

/**
 * POST /api/stripe/connect
 * Actions: create_account | create_link | get_status
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      action: 'create_account' | 'create_link' | 'get_status';
      email?: string;
      name?: string;
      leadId?: string;
      accountId?: string;
    };

    if (body.action === 'create_account') {
      if (!body.email || !body.leadId) {
        return NextResponse.json({ error: 'email and leadId required' }, { status: 400 });
      }
      const result = await createConnectAccount({
        email: body.email,
        name: body.name ?? body.email,
        leadId: body.leadId,
      });
      return NextResponse.json(result);
    }

    if (body.action === 'create_link') {
      if (!body.accountId || !body.leadId) {
        return NextResponse.json({ error: 'accountId and leadId required' }, { status: 400 });
      }
      const result = await createAccountLink({
        accountId: body.accountId,
        returnUrl: `${SITE_URL}/homeowner/onboarding?leadId=${body.leadId}&stripe=return`,
        refreshUrl: `${SITE_URL}/homeowner/onboarding?leadId=${body.leadId}&stripe=refresh`,
      });
      return NextResponse.json(result);
    }

    if (body.action === 'get_status') {
      if (!body.accountId) {
        return NextResponse.json({ error: 'accountId required' }, { status: 400 });
      }
      const result = await getAccountStatus(body.accountId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
