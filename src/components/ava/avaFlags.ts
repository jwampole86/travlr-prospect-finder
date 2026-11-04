import type { AvaRole } from './host/types';

/**
 * AVA is on for staff unless it is switched off with NEXT_PUBLIC_AVA_ENABLED=false (the server has the matching
 * AVA_ENABLED=false). Read with a literal property access so Next can inline it at build time.
 */
export const AVA_CLIENT_ENABLED = process.env.NEXT_PUBLIC_AVA_ENABLED !== 'false';

export const AVA_STAFF_ROLES: AvaRole[] = ['admin', 'owner', 'agent'];

/** True when AVA's floating button is shown to this signed-in role. */
export const avaShownFor = (role: string | null | undefined): role is AvaRole =>
  AVA_CLIENT_ENABLED && !!role && (AVA_STAFF_ROLES as string[]).includes(role);
