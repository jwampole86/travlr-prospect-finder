import { randomUUID } from 'node:crypto';
import { searchEntries } from './server/knowledge.mjs';
import { ToolDenied, ToolError, ToolTimeout } from './server/errors.mjs';
import { KNOWLEDGE } from './knowledge';

export interface AvaActor { id: string; role: string }
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
}

const isAdminRole = (role: string) => role === 'admin' || role === 'owner';

type Row = Record<string, unknown>;

export function leadStatus(row: Row): 'Verified' | 'Pending' | 'Unverified' {
  const owner = row.verified_owner === true;
  const phone = row.verified_number === true;
  if (row.fully_verified === true || (owner && phone)) return 'Verified';
  if (owner || phone || /pending/i.test(String(row.verification_status ?? ''))) return 'Pending';
  return 'Unverified';
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
    updatedAt: (row.updated_at ?? row.last_checked ?? undefined) as string | undefined
  };
}

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

    async searchKnowledge({ query }: { query: string }) {
      const entries = searchEntries(KNOWLEDGE.entries, query, 3).map((e: { answer: string; source: string; route?: string }) => ({ answer: e.answer, source: e.source, route: e.route }));
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
    }
  };
}
