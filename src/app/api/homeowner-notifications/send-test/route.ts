import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const templateSubjects: Record<string, string> = {
  payout_alert: 'Test: Your payout of $3,240 is on the way',
  lease_milestone: 'Test: Lease signed — 88 Oak Ave, Unit 3B',
  weekly_summary: 'Test: Your weekly property summary',
};

const templateBodies: Record<string, string> = {
  payout_alert: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16a34a;">💰 Payout Processed</h2>
      <p>Hi Homeowner,</p>
      <p>Your payout of <strong>$3,240.00</strong> has been processed and is on its way to your account.</p>
      <p><strong>Property:</strong> 142 Maple St, Unit 2A<br/>
      <strong>Period:</strong> August 1–31, 2026<br/>
      <strong>Expected arrival:</strong> 2–3 business days</p>
      <p style="color: #6b7280; font-size: 13px;">This is a test notification from TravlrPro.</p>
    </div>
  `,
  lease_milestone: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #2563eb;">🏠 Lease Signed</h2>
      <p>Hi Homeowner,</p>
      <p>Great news! A new lease has been signed for your property at <strong>88 Oak Ave, Unit 3B</strong>.</p>
      <p><strong>Tenant:</strong> Sample Tenant<br/>
      <strong>Lease start:</strong> September 1, 2026<br/>
      <strong>Monthly rent:</strong> $2,100</p>
      <p style="color: #6b7280; font-size: 13px;">This is a test notification from TravlrPro.</p>
    </div>
  `,
  weekly_summary: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #7c3aed;">📊 Weekly Property Summary</h2>
      <p>Hi Homeowner,</p>
      <p>Here's your activity summary for the week of August 11–18, 2026:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="background: #f8fafc;"><td style="padding: 8px 12px; font-weight: 600;">Inquiries</td><td style="padding: 8px 12px;">12</td></tr>
        <tr><td style="padding: 8px 12px; font-weight: 600;">Showings</td><td style="padding: 8px 12px;">4</td></tr>
        <tr style="background: #f8fafc;"><td style="padding: 8px 12px; font-weight: 600;">Applications</td><td style="padding: 8px 12px;">2</td></tr>
        <tr><td style="padding: 8px 12px; font-weight: 600;">Revenue (MTD)</td><td style="padding: 8px 12px;">$6,300</td></tr>
      </table>
      <p style="color: #6b7280; font-size: 13px;">This is a test notification from TravlrPro.</p>
    </div>
  `,
};

export async function POST(req: NextRequest) {
  try {
    const { type, email } = await req.json();

    if (!email || !type) {
      return NextResponse.json({ error: 'Missing email or type' }, { status: 400 });
    }

    const subject = templateSubjects[type] ?? 'Test Homeowner Notification';
    const html = templateBodies[type] ?? '<p>Test notification</p>';

    const { data, error } = await resend.emails.send({
      from: 'TravlrPro <notifications@resend.dev>',
      to: [email],
      subject,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
