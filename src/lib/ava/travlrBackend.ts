import { randomUUID } from 'node:crypto';
import { searchEntries } from './server/knowledge.mjs';
import { ToolDenied, ToolError, ToolTimeout } from './server/errors.mjs';
import { KNOWLEDGE } from './knowledge';

export interface AvaActor { id: string; role: string; organizationId?: string | null }
interface Ctx { actor: AvaActor; signal?: AbortSignal }

/** The slice of the Supabase client this adapter uses, so tests can supply a fake. */
export interface AvaDb { from: (table: string) => any }

export interface BackendDeps {
  db: AvaDb;
  /** Origin of this app, e.g. https://avyropro.ai. Lead reads go through the app's own authorized API. */
  origin: string;
  /** The caller's cookie/authorization, so the lead API applies exactly the caller's own access rules. */
  forwardHeaders: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  /** Finds help by meaning when the word search finds nothing (the model only chooses among real entries). Optional. */
  selectKnowledge?: (entries: KnowledgeEntryLike[], query: string, signal?: AbortSignal) => Promise<KnowledgeEntryLike[]>;
}

interface KnowledgeEntryLike { id: string; title?: string; answer: string; source: string; route?: string }

const isAdminRole = (role: string) => role === 'admin' || role === 'owner';

type Row = Record<string, unknown>;

export function leadStatus(row: Row): 'Verified' | 'Pending' | 'Unverified' {
  const owner = row.verified_owner === true;
  const phone = row.verified_number === true;
  if (row.fully_verified === true || (owner && phone)) return 'Verified';
  if (owner || phone || /pending/i.test(String(row.verification_status ?? ''))) return 'Pending';
  return 'Unverified';
}

/** Why a lead ranks as it does and what is still missing, from the row alone, so an answer can explain itself with facts. */
export function explainLead(row: Row): { why: string[]; missing: string[] } {
  const why: string[] = [];
  const missing: string[] = [];
  const score = Number(row.prospect_score ?? 0);
  if (score >= 80) why.push(`High prospect score (${score})`);
  else if (score >= 50) why.push(`Moderate prospect score (${score})`);
  else why.push(`Low prospect score (${score})`);
  if (row.luxury === true) why.push('Luxury tier');
  const owner = row.verified_owner === true;
  const phone = row.verified_number === true;
  if (row.fully_verified === true || (owner && phone)) why.push('Owner and phone both verified');
  else {
    if (owner) why.push('Owner verified'); else missing.push('Owner not verified yet');
    if (phone) why.push('Phone verified'); else missing.push('Phone number not verified yet');
  }
  if (!row.stage || row.stage === 'New Lead') why.push('Not contacted yet');
  return { why: why.slice(0, 4), missing };
}

export function mapLead(row: Row) {
  const address = [row.address, row.city].filter(Boolean).join(', ');
  return {
    id: String(row.id),
    name: address || 'Unnamed property',
    owner: typeof row.owner_name === 'string' && row.owner_name ? row.owner_name : undefined,
    tier: row.luxury === true ? 'Luxury' : 'Standard',
    score: Number(row.prospect_score ?? 0),
    status: leadStatus(row),
    stage: row.stage ? String(row.stage) : undefined,
    updatedAt: (row.updated_at ?? row.last_checked ?? undefined) as string | undefined,
    why: explainLead(row).why
  };
}

const LEAD_COLS = 'id,address,city,owner_name,luxury,prospect_score,verified_owner,verified_number,fully_verified,verification_status,stage,updated_at,last_checked,primary_agent_id,version';
const PRIORITY_SCORE = 80;
const dateOf = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const countOf = async (q: PromiseLike<{ data?: unknown[] | null; count?: number | null }>) => { const r = await q; return r.count ?? r.data?.length ?? 0; };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);
const tomorrow = (now: Date) => new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

export function createTravlrBackend(deps: BackendDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 8000;
  const now = deps.now ?? (() => new Date());

  return {
    live: { leads: true, knowledge: true, followups: true },

    /** Reads through GET /api/leads/paginated so agents only ever see their own leads and scores match the app. */
    async searchLeads({ query, tier, status, limit }: { query?: string; tier?: string; status?: string; limit: number }, ctx: Ctx) {
      const url = new URL('/api/leads/paginated', deps.origin);
      url.searchParams.set('pageSize', status ? '50' : '10');
      url.searchParams.set('sortKey', 'prospect_score');
      url.searchParams.set('sortDir', 'desc');
      url.searchParams.set('isSynthetic', 'false');
      if (query) url.searchParams.set('search', query);
      if (tier === 'Luxury') url.searchParams.set('luxury', 'true');
      let res: Response;
      try {
        res = await fetchImpl(url, { headers: { accept: 'application/json', ...deps.forwardHeaders }, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if ((err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError') throw new ToolTimeout('leads timed out');
        throw new ToolError('leads unreachable');
      }
      if (res.status === 401 || res.status === 403) throw new ToolDenied('not allowed to read leads');
      if (!res.ok) throw new ToolError(`leads responded ${res.status}`);
      const body = (await res.json()) as { leads?: Row[] };
      if (!Array.isArray(body.leads)) throw new ToolError('unexpected leads response');

      let leads = body.leads.map(mapLead);
      if (tier === 'Standard') leads = leads.filter((l) => l.tier === 'Standard');
      if (status) leads = leads.filter((l) => l.status === status);
      leads = leads.slice(0, limit);
      const newest = leads.map((l) => l.updatedAt).filter((d): d is string => !!d).sort().at(-1);
      return { source: 'backend', label: 'AVYRO leads', asOf: now().toISOString(), newestRecordAt: newest, leads };
    },

    async searchKnowledge({ query }: { query: string }, ctx?: Ctx) {
      let found: KnowledgeEntryLike[] = searchEntries(KNOWLEDGE.entries, query, 3);
      // A question worded unlike the article ("how many minutes until my first sync finishes") shares few words with it.
      if (!found.length && deps.selectKnowledge) {
        try { found = await deps.selectKnowledge(KNOWLEDGE.entries, query, ctx?.signal); } catch { /* carry on without it: she will say she does not have it */ }
      }
      const entries = found.map((e) => ({ answer: e.answer, source: e.source, route: e.route }));
      return { source: 'backend', label: 'Approved AVYRO help', version: KNOWLEDGE.version, entries };
    },

    /** Creates a reminder on the lead. Only reports success when the row actually came back from the database. */
    async createFollowup({ leadName, leadId, note }: { leadName: string; leadId?: string; note?: string }, ctx: Ctx) {
      const admin = isAdminRole(ctx.actor.role);
      let lead: Row | null | undefined;
      if (leadId) {
        lead = (await deps.db.from('leads').select('id,address,primary_agent_id').eq('id', leadId).maybeSingle()).data;
      } else {
        let q = deps.db.from('leads').select('id,address,primary_agent_id').ilike('address', `%${escapeLike(leadName.split(',')[0].trim())}%`).limit(2);
        if (!admin) q = q.eq('primary_agent_id', ctx.actor.id);
        const rows = (await q).data as Row[] | null;
        if (!rows || rows.length !== 1) throw new ToolError('lead not found or ambiguous');
        lead = rows[0];
      }
      if (!lead) throw new ToolError('lead not found');
      if (!admin && lead.primary_agent_id !== ctx.actor.id) throw new ToolDenied('not your lead');

      const title = `Follow up: ${note || String(lead.address ?? leadName)}`.slice(0, 200);
      const { data, error } = await deps.db
        .from('lead_reminders')
        .insert({ id: randomUUID(), lead_id: lead.id, title, due_date: tomorrow(now()), priority: 'medium', completed: false })
        .select('id')
        .single();
      if (error || !data?.id) throw new ToolError('reminder was not saved');
      return { source: 'backend', id: String(data.id), confirmed: true as const };
    },

    /** One lead the caller may see, with the facts behind its rank and what is still missing. */
    async getLeadDetails({ leadId }: { leadId: string }, ctx: Ctx) {
      const row = await ownedLead(leadId, ctx);
      const open = await countOf(deps.db.from('lead_reminders').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('completed', false));
      const lead = { ...mapLead(row), ...explainLead(row), openFollowups: open };
      return { source: 'backend', label: 'AVYRO leads', asOf: now().toISOString(), newestRecordAt: lead.updatedAt, lead };
    },

    async listFollowups({ scope, limit }: { scope: 'due' | 'overdue' | 'upcoming'; limit: number }, ctx: Ctx) {
      const items = await followups(scope, ctx);
      return { source: 'backend', label: 'AVYRO follow-ups', asOf: now().toISOString(), items: items.slice(0, limit) };
    },

    /** Leads that are not fully verified yet, best first, with what each one still needs. */
    async verificationQueue({ limit }: { limit: number }, ctx: Ctx) {
      const rows = await leadQuery(ctx, (q) => q.or('fully_verified.is.null,fully_verified.eq.false').order('prospect_score', { ascending: false }).limit(limit));
      const leads = rows.map((r) => ({ ...mapLead(r), ...explainLead(r) }));
      return { source: 'backend', label: 'AVYRO leads', asOf: now().toISOString(), newestRecordAt: newestOf(leads), leads, total: leads.length };
    },

    /** What needs the caller today: strong leads, follow-ups due or overdue, and leads still to verify. */
    async getBriefing(_args: Record<string, never>, ctx: Ctx) {
      const base = (q: any) => scope(ctx, q.not('stage', 'in', '("Not a Fit","Live")').or('is_synthetic.is.null,is_synthetic.eq.false'));
      const [priorityRows, priorityCount, unverifiedCount, due] = await Promise.all([
        leadQuery(ctx, (q) => q.gte('prospect_score', PRIORITY_SCORE).order('prospect_score', { ascending: false }).limit(2)),
        countOf(base(deps.db.from('leads').select('id', { count: 'exact', head: true }).gte('prospect_score', PRIORITY_SCORE))),
        countOf(base(deps.db.from('leads').select('id', { count: 'exact', head: true }).or('fully_verified.is.null,fully_verified.eq.false'))),
        followups('due', ctx)
      ]);
      const priority = priorityRows.map((r) => ({ ...mapLead(r), ...explainLead(r) }));
      return {
        source: 'backend', label: 'AVYRO leads', asOf: now().toISOString(), newestRecordAt: newestOf(priority),
        priorityCount, priority, unverifiedCount,
        dueCount: due.length, overdueCount: due.filter((f) => f.overdueDays > 0).length, followups: due.slice(0, 2)
      };
    },

    /** Open seller opportunities by stage, in the caller's organization. Admin and owner only (the gateway enforces the role). */
    async sellerPipeline(_args: Record<string, never>, ctx: Ctx) {
      if (!isAdminRole(ctx.actor.role)) throw new ToolDenied('seller pipeline is for admins');
      let q = deps.db.from('seller_opportunities').select('stage,status,next_action_at').eq('status', 'open').limit(1000);
      if (ctx.actor.organizationId) q = q.eq('organization_id', ctx.actor.organizationId);
      const { data } = (await q) as { data: Row[] | null };
      const byStage: Record<string, number> = {};
      let dueActions = 0;
      for (const o of data ?? []) {
        byStage[String(o.stage)] = (byStage[String(o.stage)] ?? 0) + 1;
        if (typeof o.next_action_at === 'string' && Date.parse(o.next_action_at) <= now().getTime()) dueActions++;
      }
      return { source: 'backend', label: 'AVYRO seller pipeline', asOf: now().toISOString(), open: (data ?? []).length, byStage, dueActions };
    },

    /** Moves one lead to another stage, only if nobody changed it meanwhile. Reports success only when the row really changed. */
    async updateLeadStage({ leadId, stage }: { leadId: string; stage: string }, ctx: Ctx) {
      const row = await ownedLead(leadId, ctx);
      let u = deps.db.from('leads').update({ stage, updated_at: now().toISOString(), version: Number(row.version ?? 1) + 1 }).eq('id', leadId);
      if (row.version !== null && row.version !== undefined) u = u.eq('version', row.version);
      const { data, error } = await u.select('id');
      if (error || !Array.isArray(data) || data.length !== 1) throw new ToolError('stage was not saved');
      return { source: 'backend', id: leadId, confirmed: true as const };
    },

    /** Marks one reminder done, only if it belongs to a lead the caller may change. */
    async completeFollowup({ reminderId }: { reminderId: string }, ctx: Ctx) {
      const reminder = (await deps.db.from('lead_reminders').select('id,lead_id,completed').eq('id', reminderId).maybeSingle()).data as Row | null;
      if (!reminder) throw new ToolError('follow-up not found');
      await ownedLead(String(reminder.lead_id), ctx);
      if (reminder.completed === true) throw new ToolError('follow-up already done');
      const { data, error } = await deps.db.from('lead_reminders').update({ completed: true }).eq('id', reminderId).select('id');
      if (error || !Array.isArray(data) || data.length !== 1) throw new ToolError('follow-up was not saved');
      return { source: 'backend', id: reminderId, confirmed: true as const };
    }
  };

  /** Agents see only their own leads; admins and owners see all, exactly as the app's own lead API does. */
  function scope(ctx: Ctx, q: any) {
    return isAdminRole(ctx.actor.role) ? q : q.eq('primary_agent_id', ctx.actor.id);
  }

  async function leadQuery(ctx: Ctx, shape: (q: any) => any): Promise<Row[]> {
    const q = scope(ctx, deps.db.from('leads').select(LEAD_COLS).not('stage', 'in', '("Not a Fit","Live")').or('is_synthetic.is.null,is_synthetic.eq.false'));
    const { data } = (await shape(q)) as { data: Row[] | null };
    return data ?? [];
  }

  async function ownedLead(id: string, ctx: Ctx): Promise<Row> {
    const row = (await deps.db.from('leads').select(LEAD_COLS).eq('id', id).maybeSingle()).data as Row | null;
    if (!row) throw new ToolError('lead not found');
    if (!isAdminRole(ctx.actor.role) && row.primary_agent_id !== ctx.actor.id) throw new ToolDenied('not your lead');
    return row;
  }

  /** Open reminders in the window, soonest first, each with its lead's address. Agents only get reminders on their own leads. */
  async function followups(scopeName: 'due' | 'overdue' | 'upcoming', ctx: Ctx) {
    const today = dateOf(now());
    let q = deps.db.from('lead_reminders').select('id,lead_id,title,due_date,priority').eq('completed', false).order('due_date', { ascending: true });
    if (scopeName === 'overdue') q = q.lt('due_date', today);
    else if (scopeName === 'upcoming') q = q.gt('due_date', today).lte('due_date', dateOf(new Date(now().getTime() + 7 * 86_400_000)));
    else q = q.lte('due_date', today);
    const reminders = (((await q.limit(200)) as { data: Row[] | null }).data ?? []);
    if (!reminders.length) return [];
    const ids = [...new Set(reminders.map((r) => String(r.lead_id)))];
    const leads = (((await scope(ctx, deps.db.from('leads').select('id,address,city,primary_agent_id').in('id', ids))) as { data: Row[] | null }).data ?? []);
    const byId = new Map(leads.map((l) => [String(l.id), l]));
    return reminders.flatMap((r) => {
      const lead = byId.get(String(r.lead_id));
      if (!lead) return []; // not the caller's lead
      const dueDate = String(r.due_date ?? '').slice(0, 10);
      const leadName = [lead.address, lead.city].filter(Boolean).join(', ');
      return [{ id: String(r.id), leadId: String(r.lead_id), leadName, title: String(r.title || `Follow up: ${leadName}`), dueDate, overdueDays: dueDate && dueDate < today ? Math.max(0, daysBetween(dueDate, today)) : 0, priority: String(r.priority ?? 'medium') }];
    });
  }
}

const newestOf = (items: Array<{ updatedAt?: string }>) => items.map((l) => l.updatedAt).filter((d): d is string => !!d).sort().at(-1);
