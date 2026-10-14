import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const usd = (n: unknown) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// GET /api/owner-statements/:id/view — printable statement for staff and for the owner it belongs to.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: st } = await db.from('owner_statements').select('*').eq('id', id).maybeSingle();
  if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 });
  const { data: property } = await db.from('managed_properties').select('lead_id, address, city, state, owner_name').eq('id', st.property_id).single();
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 });

  if (!auth.actor.isAdmin) {
    const { data: link } = await db.from('property_homeowners').select('id').eq('lead_id', property.lead_id).eq('homeowner_user_id', auth.actor.user.id).maybeSingle();
    if (!link || st.status === 'draft') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const items = (st.line_items ?? {}) as { bookings?: Array<{ guest: string; checkIn: string; checkOut: string; nights: number; gross: number; platform: string | null }>; expenses?: Array<{ date: string; category: string; description: string | null; amount: number }> };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Owner statement</title><style>
body{font-family:system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#111}h1{font-size:22px;margin:0}h2{font-size:14px;margin:26px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#444}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right}
.sum td{border:0;padding:4px 8px}.sum tr:last-child td{border-top:2px solid #111;font-weight:700;font-size:15px}.muted{color:#666;font-size:12px}
@media print{body{margin:0}.noprint{display:none}}</style></head><body>
<p class="noprint"><button onclick="window.print()">Print or save as PDF</button></p>
<h1>Owner statement</h1><p class="muted">${esc(property.address)}${property.city ? `, ${esc(property.city)}` : ''} ${esc(property.state)} &middot; ${esc(st.period_start)} to ${esc(st.period_end)}${property.owner_name ? ` &middot; ${esc(property.owner_name)}` : ''}</p>
<h2>Summary</h2><table class="sum"><tr><td>Gross booking revenue</td><td class="n">${usd(st.gross_revenue)}</td></tr><tr><td>Management fee (${esc(st.fee_percent ?? 0)}%)</td><td class="n">-${usd(st.management_fee)}</td></tr><tr><td>Expenses</td><td class="n">-${usd(st.expenses_total)}</td></tr><tr><td>Net to owner</td><td class="n">${usd(st.net_payout)}</td></tr></table>
<h2>Stays</h2><table><tr><th>Guest</th><th>Check-in</th><th>Check-out</th><th class="n">Nights</th><th>Platform</th><th class="n">Revenue</th></tr>${(items.bookings ?? []).map((b) => `<tr><td>${esc(b.guest)}</td><td>${esc(b.checkIn)}</td><td>${esc(b.checkOut)}</td><td class="n">${esc(b.nights)}</td><td>${esc(b.platform ?? '')}</td><td class="n">${usd(b.gross)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No completed stays in this period.</td></tr>'}</table>
<h2>Expenses</h2><table><tr><th>Date</th><th>Category</th><th>Description</th><th class="n">Amount</th></tr>${(items.expenses ?? []).map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.description ?? '')}</td><td class="n">${usd(e.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No expenses in this period.</td></tr>'}</table>
<p class="muted" style="margin-top:28px">Statement status: ${esc(st.status)}. Revenue counts stays that ended in the period.</p></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
