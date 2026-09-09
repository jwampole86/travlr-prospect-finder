import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/cadence/unsubscribe?token=xxx
 * One-click email unsubscribe handler.
 * Sets email_opt_in = false on the lead and marks the token as used.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('<html><body><h2>Invalid unsubscribe link.</h2></body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Look up token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('email_unsubscribe_tokens')
    .select('id, lead_id, used_at')
    .eq('token', token)
    .single();

  if (tokenErr || !tokenRow) {
    return new NextResponse(unsubscribePage('Invalid or expired unsubscribe link.', false), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (tokenRow.used_at) {
    return new NextResponse(unsubscribePage('You have already unsubscribed. No further emails will be sent.', true), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Mark token used and set email_opt_in = false
  await Promise.all([
    supabase.from('email_unsubscribe_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id),
    supabase.from('leads').update({ email_opt_in: false }).eq('id', tokenRow.lead_id),
    supabase.from('cadence_enrollments').update({ status: 'unsubscribed' }).eq('lead_id', tokenRow.lead_id).eq('status', 'active'),
    supabase.from('admin_event_log').insert({
      event_type: 'email_unsubscribed',
      event_category: 'lead_change',
      lead_id: tokenRow.lead_id,
      title: 'Lead unsubscribed from email cadence',
      description: 'One-click unsubscribe via email link',
      severity: 'info',
      event_timestamp: new Date().toISOString(),
    }),
    supabase.from('cadence_send_log').update({ unsubscribed_at: new Date().toISOString() }).eq('lead_id', tokenRow.lead_id).is('unsubscribed_at', null),
  ]);

  return new NextResponse(unsubscribePage('You have been unsubscribed. You will no longer receive automated emails from TRAVLR.', true), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function unsubscribePage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html>
<head><title>Unsubscribe — TRAVLR</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:40px;max-width:400px;text-align:center}
h2{margin:0 0 12px;font-size:20px;color:${success ? '#16a34a' : '#dc2626'}}
p{color:#6b7280;font-size:14px;line-height:1.6}
</style></head>
<body><div class="card">
<h2>${success ? '✓ ' : ''}${success ? 'Unsubscribed' : 'Error'}</h2>
<p>${message}</p>
${success ? '<p style="margin-top:16px;font-size:12px;color:#9ca3af">If you unsubscribed by mistake, please contact us directly.</p>' : ''}
</div></body></html>`;
}
