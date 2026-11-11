import { validIntegrationKey } from '@/lib/media/integrationKey';

/**
 * NAVEO Homes reaches the seller endpoints and its own lead intake with the shared `x-naveo-key` instead of a signed-in session. The key is limited to the
 * routes below and acts as one dedicated AVYRO user inside one organization, so it can never see another organization's data
 * and can never reach partner onboarding, agreements, revenue, state activation or backfills.
 */
const ALLOWED: Array<{ methods: string[]; path: RegExp }> = [
  { methods: ['POST'], path: /^\/api\/integration\/naveo\/leads$/ },
  { methods: ['POST'], path: /^\/api\/integration\/naveo\/owner-inquiries$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/listings$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/listings$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/listings\/[A-Za-z0-9_-]{1,64}$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/listings\/[A-Za-z0-9_-]{1,64}\/availability$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/staging$/ },
  { methods: ['POST'], path: /^\/api\/integration\/naveo\/stays\/listings\/[A-Za-z0-9_-]{1,64}\/launch$/ },
  { methods: ['POST'], path: /^\/api\/integration\/naveo\/stays\/bookings$/ },
  { methods: ['PATCH'], path: /^\/api\/integration\/naveo\/stays\/bookings\/NV-[A-Z0-9]{6}$/ },
  { methods: ['POST'], path: /^\/api\/integration\/naveo\/stays\/listings\/[A-Za-z0-9_-]{1,64}\/reviews$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/owner\/submissions$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/owner\/listings$/ },
  { methods: ['PATCH'], path: /^\/api\/integration\/naveo\/stays\/owner\/listings\/[A-Za-z0-9_-]{1,64}$/ },
  { methods: ['GET', 'POST'], path: /^\/api\/integration\/naveo\/stays\/owner\/listings\/[A-Za-z0-9_-]{1,64}\/calendar$/ },
  { methods: ['DELETE'], path: /^\/api\/integration\/naveo\/stays\/owner\/listings\/[A-Za-z0-9_-]{1,64}\/calendar\/[A-Za-z0-9_-]{1,64}$/ },
  { methods: ['GET'], path: /^\/api\/integration\/naveo\/stays\/owner\/listings\/[A-Za-z0-9_-]{1,64}\/performance$/ },
  { methods: ['GET'], path: /^\/api\/seller\/opportunities$/ },
  { methods: ['GET'], path: /^\/api\/seller\/opportunities\/[A-Za-z0-9_-]{1,64}$/ },
  { methods: ['GET'], path: /^\/api\/seller\/dashboard$/ },
  { methods: ['GET'], path: /^\/api\/seller\/partners$/ },
  { methods: ['GET', 'POST'], path: /^\/api\/seller\/consents$/ },
  { methods: ['GET'], path: /^\/api\/seller\/referrals\/match$/ },
  { methods: ['GET', 'POST', 'PATCH'], path: /^\/api\/seller\/referrals$/ },
  { methods: ['POST'], path: /^\/api\/seller\/referrals\/message$/ },
];

export type NaveoAccess = {
  userId: string;
  organizationId: string;
};

type Env = { NAVEO_INTEGRATION_KEY?: string; NAVEO_ORGANIZATION_ID?: string; NAVEO_ACTOR_USER_ID?: string };

/** Returns who the NAVEO key acts as, or null when the key is missing or wrong, the route is not allowed, or the integration is not configured. */
export function naveoSellerAccess(method: string, pathname: string, providedKey: string | null, env: Env = process.env as Env): NaveoAccess | null {
  if (!providedKey) return null;
  if (!env.NAVEO_ORGANIZATION_ID || !env.NAVEO_ACTOR_USER_ID) return null;
  if (!validIntegrationKey(providedKey, env.NAVEO_INTEGRATION_KEY)) return null;
  const route = ALLOWED.find((r) => r.path.test(pathname));
  if (!route || !route.methods.includes(method.toUpperCase())) return null;
  return { userId: env.NAVEO_ACTOR_USER_ID, organizationId: env.NAVEO_ORGANIZATION_ID };
}
