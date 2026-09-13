import { NextRequest, NextResponse } from 'next/server';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

interface EnterpriseInquiryBody {
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  companyWebsite?: string;
  propertiesManaged?: string;
  teamMembers?: string;
  currentSoftware?: string;
  primaryUseCase?: string;
  estimatedLeadVolume?: string;
  message?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

// Sends Enterprise Prospect Finder sales inquiries to the sales team via Resend —
// reuses the same email-based notification pattern as the rest of the app rather
// than introducing a separate/duplicate contact database.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<EnterpriseInquiryBody>;
    const required: Array<keyof EnterpriseInquiryBody> = ['firstName', 'lastName', 'workEmail', 'company'];
    const missing = required.filter((field) => !body[field]?.toString().trim());
    if (missing.length > 0) {
      return NextResponse.json({ error: `Missing required field(s): ${missing.join(', ')}` }, { status: 400 });
    }

    const salesEmail = process.env.SALES_NOTIFICATION_EMAIL || process.env.RESEND_FROM_EMAIL;
    if (!salesEmail) {
      return NextResponse.json({ error: 'Sales notification email is not configured' }, { status: 503 });
    }

    const rows: Array<[string, string | undefined]> = [
      ['Name', `${body.firstName} ${body.lastName}`],
      ['Work Email', body.workEmail],
      ['Company', body.company],
      ['Company Website', body.companyWebsite],
      ['Properties Managed', body.propertiesManaged],
      ['Team Members', body.teamMembers],
      ['Current Software / PMS', body.currentSoftware],
      ['Primary Use Case', body.primaryUseCase],
      ['Estimated Lead Volume', body.estimatedLeadVolume],
    ];

    const tableRows = rows
      .filter(([, value]) => value)
      .map(([label, value]) => `
        <tr>
          <td style="padding:8px 12px;color:#6b7280;font-size:13px;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(String(value))}</td>
        </tr>
      `).join('');

    const html = `
      <div style="font-family:'DM Sans',sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#111827 0%,#374151 100%);border-radius:14px;padding:24px 28px;margin-bottom:24px;">
          <h1 style="color:#fff;margin:0;font-size:20px;">New Enterprise Prospect Finder Inquiry</h1>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          ${tableRows}
        </table>
        ${body.message ? `
          <div style="margin-top:20px;">
            <p style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;">Message</p>
            <p style="font-size:13px;color:#111827;white-space:pre-wrap;margin:0;">${escapeHtml(body.message)}</p>
          </div>
        ` : ''}
      </div>
    `;

    const { error } = await getResendClient().emails.send({
      from: getResendFrom(),
      to: [salesEmail],
      replyTo: body.workEmail,
      subject: `🏢 Enterprise Inquiry: ${body.company}`,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
