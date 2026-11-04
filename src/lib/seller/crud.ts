import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { fail, pick, sellerContext } from './api';

type Table = 'service_partners' | 'service_agreements' | 'service_revenue';

/** List, create and update for the simple seller-pipeline tables. Only whitelisted columns can be written. */
export function crudHandlers(table: Table, fields: readonly string[], opts: { required?: readonly string[]; filterBy?: string; order?: string } = {}) {
  return {
    async GET(req: NextRequest) {
      const ctx = await sellerContext(req);
      if ('error' in ctx) return ctx.error;
      let q = ctx.db.from(table).select('*').order(opts.order ?? 'created_at', { ascending: false }).limit(500);
      if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
      const filterValue = opts.filterBy ? req.nextUrl.searchParams.get(opts.filterBy) : null;
      if (opts.filterBy && filterValue) q = q.eq(opts.filterBy, filterValue);
      const { data, error } = await q;
      if (error) return fail(error.message, 500);
      return NextResponse.json({ items: data ?? [] });
    },
    async POST(req: NextRequest) {
      const ctx = await sellerContext(req);
      if ('error' in ctx) return ctx.error;
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const row = pick(body, fields);
      for (const key of opts.required ?? []) if (row[key] == null) return fail(`${key} is required`);
      if (ctx.orgId) row.organization_id = ctx.orgId;
      const { data, error } = await ctx.db.from(table).insert(row).select('*').single();
      if (error) return fail(error.message, 422);
      return NextResponse.json({ item: data }, { status: 201 });
    },
    async PATCH(req: NextRequest) {
      const ctx = await sellerContext(req);
      if ('error' in ctx) return ctx.error;
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      if (typeof body.id !== 'string') return fail('id is required');
      let q = ctx.db.from(table).update(pick(body, fields)).eq('id', body.id);
      if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
      const { data, error } = await q.select('*').maybeSingle();
      if (error) return fail(error.message, 422);
      if (!data) return fail('Not found', 404);
      return NextResponse.json({ item: data });
    },
  };
}
