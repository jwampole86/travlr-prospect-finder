import { createClient } from '@/lib/supabase/client';

/** fetch() that carries the signed-in user's access token, for API routes that check who is calling. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await createClient().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
