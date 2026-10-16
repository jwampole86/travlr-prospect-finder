import 'server-only';

/**
 * Reads every row a query matches. PostgREST returns at most 1,000 rows per request whatever `limit` says, so a bare
 * `.limit(5000)` silently drops rows once a table outgrows that. `build` must return a fresh, ordered query each call.
 */
export async function fetchAllRows<T = Record<string, any>>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }> }, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < pageSize) break;
  }
  return out;
}
