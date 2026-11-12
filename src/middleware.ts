import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Admin-only route prefixes — agents will be redirected to /agent-workspace
const ADMIN_ONLY_ROUTES = [
  '/ava-knowledge',
  '/managed-properties',
  '/cleaner/jobs',
  '/data-sync',
  '/sync-health',
  '/sync-ops-dashboard',
  '/sync-diagnostics',
  '/sync-regression-monitor',
  '/lead-sources',
  '/lead-sources-manager',
  '/source-intelligence',
  '/csv-preflight',
  '/duplicate-detection',
  '/duplicate-audit',
  '/dedup-monitor',
  '/user-management',
  '/admin-management',
  '/admin-config',
  '/admin-roles',
  '/admin-audit-log',
  '/admin-events',
  '/bulk-invite',
  '/commission-rules',
  '/scoring-rules',
  '/score-weight-editor',
  '/enrichment-rules-engine',
  '/enrichment-validation-analytics',
  '/enrichment-costs',
  '/workspace-management',
  '/team-performance',
  '/team-agents',
  '/team-lead-board',
  '/agent-workload-board',
  '/manager-team-metrics',
  '/agent-leaderboard',
  '/agent-routing',
  '/lead-auto-assign',
  '/bulk-actions',
  '/bulk-outreach',
  '/bulk-email-outreach',
  '/email-campaigns',
  '/cadence-engine',
  '/cadence-performance',
  '/cadence-ai-insights',
  '/nurture-cadence',
  '/integration-hub',
  '/integration-health',
  '/billing',
  '/session-management',
  '/webhook-inspector',
  '/ops-monitoring',
  '/performance-dashboard',
  '/cron-monitor',
  '/cleaner',
  '/retry-queue',
  '/rescore-events',
  '/score-retraining',
  '/ml-prospect-scoring',
  '/property-verification-debug',
  '/data-quality-monitor',
  '/lead-data-quality',
  '/data-freshness',
  '/executive-overview',
  '/advanced-reports',
  '/analytics',
  '/conversion-analytics',
  '/agent-conversion-analytics',
  '/campaign-analytics',
  '/template-performance',
  '/template-ratings',
  '/template-ai-suggestions',
  '/template-editor',
  '/templates',
  '/sms-cadence-templates',
  '/sms-delivery',
  '/delivery-kpis',
  '/alert-hub',
  '/alerts-inbox',
  '/info-request-dashboard',
  '/exports',
  '/csv-export',
  '/crm-export',
  '/score-breakdown',
  '/score-simulator',
  '/roi-calculator',
  '/lead-lifecycle',
  '/audit-trail',
  '/compliance-audit',
  '/compliance-change-log',
  '/compliance-reports',
  '/tcpa-compliance',
  '/gdpr-data-processing',
  '/pre-launch-checklist',
  '/onboarding-doc-review',
  '/checklist-auto-advance-settings',
  '/workflows',
  '/operations',
  '/tools',
  '/credential-manager',
  '/admin-roles',
  '/base44-submissions',
  '/teleprompter/interview',
  '/candidate-profiles',
  '/candidate-kanban',
  '/candidate-tracker',
  '/candidate-sequences',
  '/interview-calendar',
  '/interview-recordings',
  '/hiring-analytics',
  '/offer-letters',
  '/team-onboarding',
  '/agent-coaching',
  '/call-quality-review',
  '/agent-productivity',
  '/agent-performance',
  '/agent-workload-board',
  '/map-view',
  '/pipeline',
  '/property-screening',
  '/property-report',
  '/questionnaires',
  '/renewal-alerts',
  '/escalated-leads',
  '/campaigns',
  '/cohost',
  '/seller-pipeline',
  '/follow-up-sequences',
  '/outreach-tracking',
  '/score-simulator',
  '/lead-record',
  '/sync-health',
  '/system-health',
  '/dedup-monitor',
  '/agent-management',
  '/performance-diagnostics',
];

// Admin-only API route prefixes
const ADMIN_ONLY_API_ROUTES = [
  '/api/sync',
  '/api/leads/csv-import',
  '/api/leads/csv-reconcile',
  '/api/leads/csv-post-import-audit',
  '/api/leads/csv-import-preview',
  '/api/leads/auto-assign',
  '/api/leads/assign-hot-lead',
  '/api/bulk-invite',
  '/api/bulk-email-outreach',
  '/api/listing-url',
  '/api/enrichment/salesgenie',
  '/api/enrichment/batchdata',
  '/api/enrichment/pdl-auto-enrich',
  '/api/enrichment/property-report',
  '/api/listings/rentcast',
  '/api/listings/trulia-rapidapi',
  '/api/listings/zillow-detail',
  '/api/listings/zillow-search',
  '/api/leads/rapidapi-import',
  '/api/market/airdna-rental-estimate',
  '/api/hubspot',
  '/api/docusign',
  '/api/stripe',
  '/api/cadence',
  '/api/agent-invite/create',
  '/api/agent-invite/revoke',
  '/api/agent-invite/resend',
];

// Inside an admin-only prefix but opened by people who are not signed in (an unsubscribe link, a signing-provider callback).
const PUBLIC_API_EXCEPTIONS = ['/api/cadence/unsubscribe', '/api/docusign/webhook'];

const REAL_SECRET = (s: string | undefined): s is string => Boolean(s) && !/your-|placeholder|changeme|example/i.test(s!);

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function carriesJobSecret(req: NextRequest): boolean {
  const secrets = [process.env.CRON_SECRET, process.env.SEQUENCE_JOB_SECRET].filter(REAL_SECRET);
  const header = req.headers.get('x-job-secret');
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return secrets.some((s) => (header !== null && sameSecret(header, s)) || (bearer !== null && sameSecret(bearer, s)));
}

/** A real check with Supabase, not the presence of a cookie. Role checks stay in each route. */
async function hasValidSession(req: NextRequest): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  try {
    const supabase = createServerClient(url, anon, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
    const { data } = await supabase.auth.getUser(bearer);
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestStart = Date.now();

  // Get role from cookie (set by Supabase auth)
  const supabaseCookies = req.cookies.getAll();
  const authCookie = supabaseCookies.find(c =>
    c.name.includes('auth-token') || c.name.includes('access-token') || c.name.startsWith('sb-')
  );

  // For API routes: check if agent is trying to access admin-only APIs
  if (pathname.startsWith('/api/')) {
    const isAdminOnlyApi = ADMIN_ONLY_API_ROUTES.some(route => pathname.startsWith(route));
    if (isAdminOnlyApi && !PUBLIC_API_EXCEPTIONS.some((route) => pathname.startsWith(route))) {
      if (carriesJobSecret(req) || (await hasValidSession(req))) return NextResponse.next();
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pass through with timing header for slow-API detection
    const response = NextResponse.next();
    // Note: actual duration is measured at response time — we set start time header
    response.headers.set('X-Request-Start', String(requestStart));
    return response;
  }

  // For page routes: redirect agents away from admin-only pages
  const roleCookie = req.cookies.get('travlr_role')?.value;

  const isAdminRoute = ADMIN_ONLY_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
  const isAdminLikeRole = roleCookie === 'admin' || roleCookie === 'owner';
  if (roleCookie && !isAdminLikeRole && isAdminRoute) {
    const redirectPath = roleCookie === 'homeowner' ? '/homeowner' : '/agent-workspace';
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|public).*)',
  ],
};
