import type { SupabaseClient, User } from '@supabase/supabase-js';

/** "william alford" becomes "William Alford". Names that already have mixed case ("McDonald") are left alone. */
export function properName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
    .map(w => (w.length > 1 && (w === w.toLowerCase() || w === w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

const fromEmail = (email: unknown) => properName(String(email ?? '').split('@')[0].replace(/[._-]+/g, ' '));

/** The name the calling agent introduces themselves with: their profile name first, then sign-in details, then the start of their email. */
export async function fetchAgentName(supabase: SupabaseClient, user: User): Promise<string> {
  const { data } = await supabase.from('user_profiles').select('full_name,email').eq('id', user.id).maybeSingle();
  const meta = user.user_metadata ?? {};
  const name = data?.full_name || meta.full_name || meta.name || fromEmail(data?.email ?? user.email);
  return properName(String(name ?? ''));
}
