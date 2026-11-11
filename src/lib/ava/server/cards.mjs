// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Builds the action cards shown under an answer, from real tool results only. The model never writes a card: a card
// can only carry ids and names that a tool actually returned, and its buttons are drawn from a fixed set of action kinds.

const money = (n) => (Number.isFinite(n) ? String(n) : '?');
const cap = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '');

const OPEN = (l) => ({ kind: 'open_lead', label: 'View lead', leadId: l.id });
const VERIFY = (l) => ({ kind: 'open_lead', label: 'Review verification', leadId: l.id, focus: 'verification' });
const FOLLOWUP = (l) => ({ kind: 'prepare', label: 'Create follow-up', tool: 'create_followup', args: { leadId: l.id, leadName: cap(l.name, 120) } });

export function leadActions(l, { canWrite = true } = {}) {
  const actions = [OPEN(l)];
  if (l.status && l.status !== 'Verified') actions.push(VERIFY(l));
  if (canWrite) actions.push(FOLLOWUP(l));
  if (canWrite && l.stage === 'New Lead') {
    actions.push({ kind: 'prepare', label: 'Mark contacted', tool: 'update_lead_stage', args: { leadId: l.id, leadName: cap(l.name, 120), stage: 'Contacted' } });
  }
  return actions.slice(0, 4);
}

export function leadCard(l, opts) {
  const meta = [l.score !== undefined ? `Score ${money(l.score)}` : null, l.tier, l.status, l.stage].filter(Boolean).join(' · ');
  return { id: `lead_${l.id}`, title: cap(l.name, 120), meta, why: Array.isArray(l.why) ? l.why.slice(0, 4) : undefined, actions: leadActions(l, opts) };
}

const withId = (l) => l && typeof l.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(l.id);

/** Per-tool card builders: (result, context) -> card[]. */
export const CARDS = {
  search_leads: (r) => (Array.isArray(r.leads) ? r.leads.filter(withId).slice(0, 3).map((l) => leadCard(l)) : []),
  get_lead_details: (r) => (r.lead && withId(r.lead) ? [leadCard(r.lead)] : []),
  review_verification: (r) => (Array.isArray(r.leads) ? r.leads.filter(withId).slice(0, 4).map((l) => ({
    id: `verify_${l.id}`, title: cap(l.name, 120), meta: l.status ? `${l.status}${l.score !== undefined ? ` · Score ${money(l.score)}` : ''}` : undefined,
    why: Array.isArray(l.missing) && l.missing.length ? l.missing.slice(0, 4) : undefined,
    actions: [VERIFY(l), OPEN(l)]
  })) : []),
  list_followups: (r) => (Array.isArray(r.items) ? r.items.filter((i) => i && typeof i.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(i.id)).slice(0, 4).map((i) => ({
    id: `fu_${i.id}`, title: cap(i.title || i.leadName, 120),
    meta: i.overdueDays > 0 ? `Overdue by ${i.overdueDays} day${i.overdueDays === 1 ? '' : 's'}` : i.dueDate ? `Due ${cap(i.dueDate, 20)}` : undefined,
    why: i.leadName ? [`For ${cap(i.leadName, 80)}`] : undefined,
    actions: [
      ...(withId({ id: i.leadId }) ? [{ kind: 'open_lead', label: 'View lead', leadId: i.leadId }] : []),
      { kind: 'prepare', label: 'Mark done', tool: 'complete_followup', args: { reminderId: i.id, title: cap(i.title || i.leadName, 120) } }
    ]
  })) : []),
  get_briefing: (r) => [
    ...(Array.isArray(r.priority) ? r.priority.filter(withId).slice(0, 2).map((l) => leadCard(l)) : []),
    ...(Array.isArray(r.followups) ? CARDS.list_followups({ items: r.followups }).slice(0, 2) : [])
  ],
  get_stats: (r, ctx) => {
    const entries = Object.entries(r.counts ?? {}).filter(([, n]) => Number.isFinite(n) && n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!entries.length) return [];
    const page = ctx.pages.find((p) => p.id === 'lead-management');
    return [{
      id: 'stats_' + String(r.by).slice(0, 20), title: 'Lead counts', meta: `${Number.isFinite(r.total) ? r.total : ''} total`.trim(),
      why: entries.map(([k, n]) => `${n} ${cap(k, 40)}`),
      actions: page ? [{ kind: 'open_page', label: 'Open leads', page: page.id }] : []
    }];
  },
  seller_pipeline: (r, ctx) => {
    const page = ctx.pages.find((p) => p.id === 'seller-pipeline');
    return [{
      id: 'seller_pipeline', title: 'Seller & Owner Services', meta: `${r.open ?? 0} open`,
      why: Object.entries(r.byStage ?? {}).filter(([, n]) => n > 0).slice(0, 4).map(([s, n]) => `${n} at ${s}`),
      actions: page ? [{ kind: 'open_page', label: 'Open pipeline', page: page.id }] : []
    }];
  },
  offer_export: (r, ctx) => [{
    id: 'export_filtered', title: 'Export the leads on this screen', meta: ctx.screen.counts?.total !== undefined ? `${ctx.screen.counts.total} match the current filters` : undefined,
    why: ctx.screen.filters.length ? ctx.screen.filters.slice(0, 3).map((f) => `${f.label}: ${f.value}`) : undefined,
    actions: [{ kind: 'export', label: 'Export CSV' }]
  }]
};

/** Merges cards from one turn, one per id, at most six. */
export function mergeCards(existing, incoming) {
  const seen = new Set(existing.map((c) => c.id));
  for (const c of incoming) if (!seen.has(c.id) && existing.length < 6) { existing.push(c); seen.add(c.id); }
  return existing;
}
