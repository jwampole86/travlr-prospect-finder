import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export const WINDOW_LABEL: Record<string, string> = {
  morning: 'Morning (9am to 12pm)',
  afternoon: 'Afternoon (12pm to 5pm)',
  evening: 'Evening (5pm to 8pm)',
};

export interface InquiryDetails {
  type: 'call' | 'question';
  name: string;
  email: string;
  phone: string;
  address: string;
  preferredDate: string | null;
  preferredWindow: string | null;
  timezone: string | null;
  message: string;
}

export function whenLabel(d: InquiryDetails): string {
  if (!d.preferredDate && !d.preferredWindow) return 'No preference, first available';
  const date = d.preferredDate
    ? new Date(`${d.preferredDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : 'Any day';
  const win = d.preferredWindow ? WINDOW_LABEL[d.preferredWindow] ?? d.preferredWindow : 'any time';
  return `${date}, ${win}${d.timezone ? ` (${d.timezone})` : ''}`;
}

const shell = (inner: string) => `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">${inner}</table>
</td></tr></table></body></html>`;

const row = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#64748b;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:6px 0;font-size:14px;color:#0f172a;">${v}</td></tr>`;

/** Internal alert for the TRAVLR team. */
export function buildTeamInquiryEmail(d: InquiryDetails, report: HomeownerReport, links: { lead: string | null; report: string }) {
  const exp = report.scenarios[1];
  const isCall = d.type === 'call';
  const subject = `${isCall ? 'Call request' : 'Homeowner question'}: ${d.name} (${report.street || d.address})`;
  const text = [
    `${isCall ? 'Call request' : 'Question'} from ${d.name}`,
    `Email: ${d.email}`, d.phone ? `Phone: ${d.phone}` : '',
    `Property: ${d.address}`,
    isCall ? `Preferred time: ${whenLabel(d)}` : '',
    d.message ? `Message: ${d.message}` : '',
    `Estimate shown: ${usd(exp.annualNet)}/yr net (${usd(exp.netMonthly)}/mo), regulation: ${report.regulation.headline}`,
    links.lead ? `Lead: ${links.lead}` : '', `Their report: ${links.report}`,
  ].filter(Boolean).join('\n');
  const html = shell(`
<tr><td style="background:#1e1b4b;padding:22px 28px;color:#ffffff;"><div style="font-size:12px;color:#c7d2fe;letter-spacing:.08em;text-transform:uppercase;">TRAVLR &middot; Homeowner inbound</div><div style="font-size:20px;font-weight:800;margin-top:4px;">${isCall ? 'Call request' : 'New question'} from ${esc(d.name)}</div></td></tr>
<tr><td style="padding:24px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    ${row('Email', `<a href="mailto:${esc(d.email)}" style="color:#4f46e5;">${esc(d.email)}</a>`)}
    ${d.phone ? row('Phone', `<a href="tel:${esc(d.phone.replace(/[^\d+]/g, ''))}" style="color:#4f46e5;">${esc(d.phone)}</a>`) : ''}
    ${row('Property', esc(d.address))}
    ${isCall ? row('Preferred time', `<strong>${esc(whenLabel(d))}</strong>`) : ''}
    ${row('Estimate shown', `${usd(exp.annualNet)}/yr net &middot; ${usd(exp.netMonthly)}/mo &middot; ${exp.occupancy}% occupancy`)}
    ${row('Local rules', esc(report.regulation.headline))}
  </table>
  ${d.message ? `<div style="margin-top:14px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;line-height:1.6;white-space:pre-wrap;">${esc(d.message)}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;"><tr>
    ${links.lead ? `<td style="background:#4f46e5;border-radius:10px;"><a href="${esc(links.lead)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open lead</a></td><td width="10"></td>` : ''}
    <td style="border:1px solid #c7d2fe;border-radius:10px;"><a href="${esc(links.report)}" style="display:inline-block;padding:10px 20px;font-size:14px;font-weight:600;color:#4f46e5;text-decoration:none;">View their report</a></td>
  </tr></table>
  <p style="margin:18px 0 0 0;font-size:12px;color:#94a3b8;">A follow-up task has been created on the lead. Reply to this email to answer ${esc(d.name)} directly.</p>
</td></tr>`);
  return { subject, html, text };
}

/** Confirmation to the homeowner. */
export function buildHomeownerConfirmationEmail(d: InquiryDetails, report: HomeownerReport, links: { report: string }, contactEmail: string) {
  const isCall = d.type === 'call';
  const first = esc(d.name.split(' ')[0] || 'there');
  const subject = isCall ? 'We received your call request' : 'We received your question';
  const text = [
    `Hi ${d.name.split(' ')[0] || 'there'},`, '',
    isCall ? `Thanks for requesting a call. Preferred time: ${whenLabel(d)}.` : 'Thanks for your question. A TRAVLR specialist will reply shortly.',
    'A TRAVLR specialist will be in touch within one business day.',
    `Your report: ${links.report}`, `Questions? Reply to this email or write ${contactEmail}.`,
  ].join('\n');
  const html = shell(`
<tr><td style="background:#1e1b4b;padding:24px 28px;color:#ffffff;"><div style="font-size:13px;font-weight:700;">TRAVLR Vacation Homes</div><div style="font-size:20px;font-weight:800;margin-top:10px;">${isCall ? 'Your call request is in' : 'We got your question'}</div></td></tr>
<tr><td style="padding:26px 28px;">
  <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Hi ${first},</p>
  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#334155;">${isCall ? 'Thanks for asking for a call. A TRAVLR specialist will contact you within one business day, and will aim for your preferred time.' : 'Thanks for reaching out. A TRAVLR specialist will reply within one business day.'}</p>
  ${isCall ? `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:14px;line-height:1.6;"><strong>Your preferred time</strong><br/>${esc(whenLabel(d))}${d.phone ? `<br/>We&rsquo;ll call ${esc(d.phone)}` : ''}</div>` : ''}
  ${d.message ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:18px;font-size:14px;line-height:1.6;white-space:pre-wrap;"><strong>Your message</strong><br/>${esc(d.message)}</div>` : ''}
  <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">In the meantime, your estimate for <strong>${esc(report.street || d.address)}</strong> is always available:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;"><tr><td style="background:#4f46e5;border-radius:12px;"><a href="${esc(links.report)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">View my report</a></td></tr></table>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Need to change something? Just reply to this email or write <a href="mailto:${esc(contactEmail)}" style="color:#4f46e5;">${esc(contactEmail)}</a>.</p>
</td></tr>
<tr><td style="padding:14px 28px 24px 28px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">TRAVLR Vacation Homes &middot; staytrvlr.com</td></tr>`);
  return { subject, html, text };
}
