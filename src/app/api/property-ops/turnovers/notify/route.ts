import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail } from '@/lib/propertyOpsApi';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { BRAND } from '@/config/brand';

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// POST { id } — emails the cleaner their private job link and returns it, so it can also be pasted into a text.
export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await req.json() as { id?: string };
  if (!id) return fail('id is required');

  const { data: job } = await ctx.db.from('cleaning_jobs').select('id, access_token, scheduled_date, time_window, cleaner_id, special_instructions, property_id').eq('id', id).maybeSingle();
  if (!job) return fail('Job not found', 404);
  if (!job.cleaner_id) return fail('Assign a cleaner first');
  const [{ data: cleaner }, { data: property }] = await Promise.all([
    ctx.db.from('cleaners').select('full_name, email').eq('id', job.cleaner_id).maybeSingle(),
    ctx.db.from('managed_properties').select('address, city').eq('id', job.property_id).maybeSingle(),
  ]);
  const link = `${(process.env.NEXT_PUBLIC_SITE_URL || BRAND.appUrl).replace(/\/$/, '')}/cleaner/job/${job.access_token}`;

  let emailed = false;
  if (cleaner?.email) {
    const where = [property?.address, property?.city].filter(Boolean).join(', ');
    const { error } = await getResendClient().emails.send({
      from: getResendFrom(), to: [cleaner.email], subject: `Cleaning job ${job.scheduled_date}: ${where || 'property'}`,
      html: `<div style="font-family:sans-serif;max-width:560px"><p>Hi ${esc(cleaner.full_name)},</p><p>You have a cleaning job on <strong>${esc(job.scheduled_date)}</strong>, ${esc(job.time_window ?? '')}, at <strong>${esc(where)}</strong>.</p>${job.special_instructions ? `<p>Notes: ${esc(job.special_instructions)}</p>` : ''}<p><a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open your job</a></p><p style="color:#6b7280;font-size:12px">Use the link to check in, tick off the checklist, add photos and check out. It only works for this job.</p></div>`,
    });
    if (error) return fail(`Email failed: ${error.message}`, 502);
    emailed = true;
  }
  await ctx.db.from('cleaning_jobs').update({ link_sent_at: new Date().toISOString() }).eq('id', id);
  return NextResponse.json({ link, emailed });
}
