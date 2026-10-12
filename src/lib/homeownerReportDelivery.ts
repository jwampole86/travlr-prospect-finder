import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';
import { buildHomeownerReportEmail } from '@/lib/email/homeownerReportEmail';
import { sendTrackedEmail, type TrackedResult } from '@/lib/email/trackedSend';
import { createEmailConfirmToken } from '@/lib/estimateTokens';

type Db = ReturnType<typeof getSupabaseAdmin>;

/** Link used in the email and the shareable link. The `c` token proves, once opened, that the homeowner received our email. */
export function buildReportUrl(base: string, address: string, opts: { leadId?: string; email?: string; equipment?: string[] } = {}): string {
  const params = new URLSearchParams({ address });
  if (opts.equipment?.length) params.set('eq', opts.equipment.join(','));
  if (opts.leadId && opts.email) {
    try { params.set('c', createEmailConfirmToken(opts.leadId, opts.email)); } catch { /* signing secret missing: link still works */ }
  }
  return `${base.replace(/\/$/, '')}/estimate/report?${params.toString()}`;
}

export async function deliverReportEmail(db: Db, input: {
  base: string; address: string; leadId: string; firstName: string; to: string; report: HomeownerReport; equipment?: string[]; resend?: boolean;
}): Promise<TrackedResult & { reportUrl: string }> {
  const reportUrl = buildReportUrl(input.base, input.address, { leadId: input.leadId, email: input.to, equipment: input.equipment });
  const { subject, html, text } = buildHomeownerReportEmail(input.report, input.firstName, reportUrl);
  const result = await sendTrackedEmail(db, {
    to: input.to, subject, html, text, replyTo: process.env.RESEND_FROM_EMAIL, leadId: input.leadId,
    kind: 'homeowner_report', metadata: { address: input.address, resend: input.resend === true },
  });
  return { ...result, reportUrl };
}
