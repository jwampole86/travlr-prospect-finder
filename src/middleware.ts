import { NextRequest, NextResponse } from 'next/server';

// Admin-only route prefixes — agents will be redirected to /agent-workspace
const ADMIN_ONLY_ROUTES = [
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
  '/api/hubspot',
  '/api/docusign',
  '/api/stripe',
  '/api/cadence',
  '/api/agent-invite/create',
  '/api/agent-invite/revoke',
  '/api/agent-invite/resend',
];

export function middleware(req: NextRequest) {
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
    if (isAdminOnlyApi) {
      return NextResponse.next();
    }

    // Pass through with timing header for slow-API detection
    const response = NextResponse.next();
    // Note: actual duration is measured at response time — we set start time header
    response.headers.set('X-Request-Start', String(requestStart));
    return response;
  }

  // For page routes: redirect agents away from admin-only pages
  const roleCookie = req.cookies.get('travlr_role')?.value;

  if (roleCookie === 'agent') {
    const isAdminRoute = ADMIN_ONLY_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
    if (isAdminRoute) {
      return NextResponse.redirect(new URL('/agent-workspace', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|public).*)',
  ],
};
