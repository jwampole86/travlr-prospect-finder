import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSMSStatus, isTwilioConfigured } from '@/lib/services/twilioService';

/**
 * POST /api/sms/status
 * Polls Twilio for delivery status of a message and updates outreach_history.
 * Body: { messageSid: string, outreachHistoryId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { messageSid, outreachHistoryId } = await req.json();

    if (!messageSid) {
      return NextResponse.json({ error: 'messageSid is required' }, { status: 400 });
    }

    const statusData = await getSMSStatus(messageSid);

    if (!statusData) {
      return NextResponse.json({
        status: 'unknown',
        twilioConfigured: isTwilioConfigured(),
        message: 'Placeholder mode or message not found',
      });
    }

    // Map Twilio status to our internal status
    const internalStatus =
      statusData.status === 'delivered' ? 'delivered' :
      statusData.status === 'failed' || statusData.status === 'undelivered' ? 'failed' :
      statusData.status === 'sent'? 'sent' : 'queued';

    // Update outreach_history if ID provided
    if (outreachHistoryId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      await supabase
        .from('outreach_history')
        .update({
          status: internalStatus,
          metadata: {
            twilio_delivery_status: statusData.status,
            twilio_error_code: statusData.errorCode ?? null,
            twilio_error_message: statusData.errorMessage ?? null,
            status_checked_at: new Date().toISOString(),
          },
        })
        .eq('id', outreachHistoryId);
    }

    return NextResponse.json({
      status: internalStatus,
      twilioStatus: statusData.status,
      errorCode: statusData.errorCode,
      errorMessage: statusData.errorMessage,
    });
  } catch (err) {
    console.error('[SMS Status API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
