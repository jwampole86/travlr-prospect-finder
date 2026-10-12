import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';
import { CONTACT_EMAIL } from '@/lib/homeownerContact';

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function buildHomeownerReportEmail(report: HomeownerReport, firstName: string, reportUrl: string) {
  const [cons, exp, opt] = report.scenarios;
  const reg = report.regulation;
  const name = esc(firstName.trim() || 'there');
  const place = esc([report.city, report.state].filter(Boolean).join(', '));
  const street = esc(report.street || report.address);
  const url = esc(reportUrl);
  const callUrl = esc(`${reportUrl}${reportUrl.includes('?') ? '&' : '?'}contact=call`);
  const contactEmail = esc(CONTACT_EMAIL);
  const reqs = reg.requirements.filter(r => r.required === true).slice(0, 4);
  const toneColor = reg.tone === 'good' ? '#047857' : reg.tone === 'bad' ? '#be123c' : reg.tone === 'caution' ? '#b45309' : '#475569';

  const subject = `Your TRAVLR property revenue report for ${report.street || report.address}`;
  const text = [
    `Hi ${firstName.trim() || 'there'},`,
    '',
    `Here is your estimate for ${report.address}:`,
    `Estimated net income: ${usd(exp.annualNet)} per year (${usd(exp.netMonthly)} per month)`,
    `Realistic range: ${usd(cons.annualNet)} to ${usd(opt.annualNet)} per year`,
    report.advantageMonthly > 0 ? `That is about ${usd(report.advantageMonthly)} more per month than a typical long-term lease.` : '',
    `Local rules: ${reg.headline}.`,
    '',
    `View your full report (with costs, a five-year comparison and the permits required for your area): ${reportUrl}`,
    '',
    `Schedule a call: ${reportUrl}${reportUrl.includes('?') ? '&' : '?'}contact=call`,
    'A TRAVLR specialist will contact you within one business day. You can reply to this email at any time.',
    '',
    'This is an estimate, not a guarantee of income.',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<tr><td style="background:#1e1b4b;padding:28px 32px;color:#ffffff;">
  <div style="font-size:13px;font-weight:700;letter-spacing:.02em;">TRAVLR Vacation Homes</div>
  <div style="font-size:12px;color:#c7d2fe;margin-top:2px;">Property Revenue Report</div>
  <div style="font-size:14px;color:#e0e7ff;margin-top:22px;">${street}${place ? `, ${place}` : ''}</div>
  <div style="font-size:14px;color:#c7d2fe;margin-top:14px;">Your home could earn an estimated</div>
  <div style="font-size:40px;font-weight:800;line-height:1.1;margin-top:4px;">${usd(exp.annualNet)}<span style="font-size:16px;font-weight:600;color:#c7d2fe;"> / year</span></div>
  <div style="font-size:13px;color:#c7d2fe;margin-top:6px;">Net to you after operating costs. Realistic range ${usd(cons.annualNet)} to ${usd(opt.annualNet)}.</div>
</td></tr>
<tr><td style="padding:28px 32px 8px 32px;">
  <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Hi ${name},</p>
  <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#334155;">Thanks for requesting your estimate. Here are the headline numbers. Your full report has the cost breakdown, a five-year comparison with a traditional lease, and the permits and taxes required for your address.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
    <tr>
      <td width="33%" style="padding:0 6px 0 0;"><div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Net / month</div><div style="font-size:20px;font-weight:800;margin-top:4px;">${usd(exp.netMonthly)}</div></div></td>
      <td width="33%" style="padding:0 3px;"><div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Nightly rate</div><div style="font-size:20px;font-weight:800;margin-top:4px;">${usd(exp.adr)}</div></div></td>
      <td width="33%" style="padding:0 0 0 6px;"><div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Occupancy</div><div style="font-size:20px;font-weight:800;margin-top:4px;">${exp.occupancy}%</div></div></td>
    </tr>
  </table>
  ${report.advantageMonthly > 0 ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;color:#065f46;margin-bottom:20px;">That is about <strong>${usd(report.advantageMonthly)} more per month</strong> than a typical long-term lease on a home like yours.</div>` : ''}
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:24px;">
    <div style="font-size:11px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.08em;">Rules &amp; permits${place ? ` in ${place}` : ''}</div>
    <div style="font-size:16px;font-weight:700;color:${toneColor};margin-top:6px;">${esc(reg.headline)}</div>
    ${reqs.length ? `<ul style="margin:10px 0 0 0;padding-left:18px;font-size:14px;line-height:1.6;color:#334155;">${reqs.map(r => `<li><strong>${esc(r.label)}:</strong> ${esc(r.value)}</li>`).join('')}</ul>` : `<p style="margin:8px 0 0 0;font-size:14px;line-height:1.6;color:#334155;">Your specialist will confirm the exact permit and tax steps for your address.</p>`}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px auto;"><tr><td style="background:#4f46e5;border-radius:12px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">View my full report</a></td></tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px auto;"><tr>
    <td style="border:1px solid #c7d2fe;border-radius:12px;"><a href="${callUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#4f46e5;text-decoration:none;">Schedule a call</a></td>
    <td width="10"></td>
    <td style="border:1px solid #e2e8f0;border-radius:12px;"><a href="mailto:${contactEmail}?subject=${encodeURIComponent('Question about my estimate: ' + report.address)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#334155;text-decoration:none;">Ask a question</a></td>
  </tr></table>
  <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#334155;">A TRAVLR specialist will contact you within one business day to refine these numbers with your home&rsquo;s details. You can also just reply to this email.</p>
</td></tr>
<tr><td style="padding:16px 32px 28px 32px;border-top:1px solid #f1f5f9;font-size:11px;line-height:1.6;color:#94a3b8;">
  This is an estimate for planning purposes, not a guarantee of income. Actual results vary with season, pricing, regulations and guest demand. Regulatory information summarizes public sources and is not legal advice.<br/>TRAVLR Vacation Homes &middot; staytrvlr.com
</td></tr>
</table>
</td></tr></table></body></html>`;

  return { subject, html, text };
}
