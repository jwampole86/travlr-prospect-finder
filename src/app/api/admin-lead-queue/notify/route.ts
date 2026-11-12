import { guardAdmin } from '@/lib/auth/routeGuards';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchSMS } from '@/lib/services/twilioService';

export async function POST(req: NextRequest) {
  { const denied = await guardAdmin(req); if (denied) return denied; }
  try {
    const { agentPhone, agentName, leadName, leadAddress, leadPhone, priority } = await req.json();

    if (!agentPhone) {
      return NextResponse.json({ success: false, error: 'agentPhone required' }, { status: 400 });
    }

    const body = [
      `🎯 AVYRO AI: New lead assigned to you!`,
      ``,
      `Prospect: ${leadName}`,
      `Address: ${leadAddress}`,
      leadPhone ? `Phone: ${leadPhone}` : null,
      `Priority: ${priority || 'Standard'}`,
      ``,
      `Open your dashboard to view and call: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://avyropro.ai'}/teleprompter`,
    ].filter(Boolean).join('\n');

    const result = await dispatchSMS({
      to: agentPhone,
      body,
      leadId: 'admin-queue-assignment',
      agentId: undefined,
      metadata: { source: 'admin_lead_queue', agentName, leadName },
    });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      twilioConfigured: result.twilioConfigured,
    });
  } catch (err) {
    console.error('[admin-lead-queue/notify]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
