import type { TourDefinition } from './host/types';
import menuTours from './menuTours.generated.json';

const STAFF = ['admin', 'owner', 'agent'] as const;
const ADMINS = ['admin', 'owner'] as const;

/**
 * Guided tours of real TRAVLR/AVYRO screens. Each step points at an element marked `data-ava-anchor="..."` in the page
 * source (a test checks every anchor still exists). Routes in /pipeline and the dashboard are admin-only in the app, so
 * those tours are only offered to admins and owners.
 */
/** Authored tours of the working screens, followed by a generated walk through every menu category (scripts/build-ava-kb.mjs). */
export const TRAVLR_TOURS: TourDefinition[] = [
  {
    id: 'menu-search',
    title: 'Search the menu',
    summary: 'Find any page quickly',
    roles: [...STAFF],
    keywords: ['search', 'find', 'menu', 'navigation', 'quickly', 'page'],
    steps: [
      { id: 'search', anchor: 'nav-search-box', say: 'Type here to find any page in the menu. Words match the page name, what it does and its category, so "phones" finds Contact Enrichment. Press Enter to open the top result, or use the arrow keys to pick another.' }
    ]
  },
  {
    id: 'lead-filters',
    title: 'Lead filters',
    summary: 'Find, filter and open your leads',
    roles: [...STAFF],
    keywords: ['filter', 'filters', 'filtering', 'leads', 'search', 'presets', 'lead', 'management'],
    steps: [
      { id: 'overview', anchor: 'lead-overview', route: '/lead-management', say: 'This is your lead overview. Click a smart view here to jump straight to a group of leads.' },
      { id: 'filters', anchor: 'lead-filters', route: '/lead-management', say: 'Use these filters to narrow the list, and save the combinations you use often as presets.' },
      { id: 'list', anchor: 'lead-list', route: '/lead-management', say: 'Your matching leads are listed here. Open one to enrich it, add a reminder or start outreach.' }
    ]
  },
  {
    id: 'pipeline-board',
    title: 'Pipeline board',
    summary: 'See where every lead is in the campaign',
    roles: [...ADMINS],
    keywords: ['pipeline', 'board', 'stages', 'campaign', 'funnel'],
    steps: [
      { id: 'filters', anchor: 'pipeline-filters', route: '/pipeline', say: 'Search and filter the board by state, program, minimum score and sort order here.' },
      { id: 'funnel', anchor: 'pipeline-funnel', route: '/pipeline', say: 'The funnel shows how many leads sit in each campaign stage.' },
      { id: 'board', anchor: 'pipeline-board', route: '/pipeline', say: 'Each column is a stage, and each card is a lead with its score and latest activity.' }
    ]
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    summary: 'Your command center at a glance',
    roles: [...ADMINS],
    keywords: ['dashboard', 'home', 'overview', 'kpi', 'command', 'center'],
    steps: [
      { id: 'overview', anchor: 'dashboard-overview', route: '/', say: 'The KPI cards give you a real-time snapshot of your lead pipeline.' },
      { id: 'pipeline', anchor: 'dashboard-pipeline', route: '/', say: 'The stage funnel chart shows conversion across the pipeline stages.' },
      { id: 'top-leads', anchor: 'dashboard-top-leads', route: '/', say: 'Top scored leads lists the highest priority properties for outreach.' },
      { id: 'activity', anchor: 'dashboard-activity', route: '/', say: 'The activity feed shows recent team actions and system events.' }
    ]
  },
  {
    id: 'agent-workspace',
    title: 'My dashboard',
    summary: 'Your day at a glance',
    roles: ['agent'],
    keywords: ['dashboard', 'workspace', 'my', 'home', 'kpi', 'queue'],
    steps: [
      { id: 'header', anchor: 'agent-header', route: '/agent-workspace', say: 'This is your workspace. My Leads opens everything assigned to you.' },
      { id: 'kpis', anchor: 'agent-kpis', route: '/agent-workspace', say: 'These cards show your day: leads assigned, follow-ups due, calls made and how many reached someone.' },
      { id: 'leads', anchor: 'agent-leads', route: '/agent-workspace', say: 'Your lead queue is here. Start with the ones at the top: they have the highest priority.' }
    ]
  },
  {
    id: 'seller-pipeline',
    title: 'Seller & owner services',
    summary: 'Seller replies, permissions and partners',
    roles: [...ADMINS],
    keywords: ['seller', 'sellers', 'owner', 'services', 'sale', 'opportunities', 'partners'],
    steps: [
      { id: 'intro', anchor: 'seller-intro', route: '/seller-pipeline', say: 'When a homeowner replies that they may sell, it lands here for a person to review. Nothing is sent automatically.' },
      { id: 'tabs', anchor: 'seller-tabs', route: '/seller-pipeline', say: 'Switch between the dashboard, opportunities, the outreach campaign messages, partners and revenue here.' },
      { id: 'content', anchor: 'seller-content', route: '/seller-pipeline', say: 'Each opportunity needs the owner\'s recorded permission before it moves forward.' }
    ]
  },
  {
    id: 'data-sync',
    title: 'Data Source Sync',
    summary: 'Keep your lead data fresh',
    roles: [...ADMINS],
    keywords: ['sync', 'data', 'source', 'sources', 'fresh', 'import', 'provider', 'zillow', 'trulia'],
    steps: [
      { id: 'header', anchor: 'sync-header', route: '/data-sync', say: 'This is Data Source Sync. Admins run and watch the jobs that bring new leads in from your configured sources.' },
      { id: 'urls', anchor: 'sync-urls', route: '/data-sync', say: 'These are the sync URLs set up for your markets. Data quality sits upstream of every call and campaign, so keep this fresh before agents start working leads.' }
    ]
  },
  {
    id: 'agent-management',
    title: 'Agent management',
    summary: 'Invite and manage your agents',
    roles: [...ADMINS],
    keywords: ['agent', 'agents', 'team', 'invite', 'invitations', 'onboarding', 'manage', 'roles'],
    steps: [
      { id: 'header', anchor: 'team-header', route: '/agent-management', say: 'Agent Management is where you invite, manage and monitor your outreach agents.' },
      { id: 'active', anchor: 'team-active', route: '/agent-management', say: 'Active agents are listed here. Before you assign call volume, make sure the agent is active and has finished their onboarding.' }
    ]
  },
  {
    id: 'message-templates',
    title: 'Message templates',
    summary: 'Email and text templates',
    roles: [...ADMINS],
    keywords: ['template', 'templates', 'message', 'messages', 'sms', 'email', 'text', 'tcpa', 'merge'],
    steps: [
      { id: 'header', anchor: 'templates-header', route: '/templates', say: 'Message Templates is where you create and manage email and text templates, with merge fields that fill in each homeowner\'s details.' },
      { id: 'kpis', anchor: 'templates-kpis', route: '/templates', say: 'These counts show how many templates you have, how many are email or text, and whether any have TCPA issues to fix before sending.' }
    ]
  },
  {
    id: 'follow-up-sequences',
    title: 'Follow-up sequences',
    summary: 'Automated cadences across email, text and calls',
    roles: [...ADMINS],
    keywords: ['follow', 'sequence', 'sequences', 'cadence', 'cadences', 'schedule', 'scheduling', 'automation'],
    steps: [
      { id: 'header', anchor: 'sequences-header', route: '/follow-up-sequences', say: 'Follow-up sequences run your cadences across email, text and call steps. The counts show how many are active or paused, and you can start a new sequence from here.' }
    ]
  },
  {
    id: 'ava-knowledge',
    title: 'Teach AVA',
    summary: 'See what she could not answer and write the answer',
    roles: [...ADMINS],
    keywords: ['teach', 'ava', 'knowledge', 'answer', 'answers', 'train', 'unanswered'],
    steps: [
      { id: 'gaps', anchor: 'knowledge-gaps', route: '/ava-knowledge', say: 'These are help topics AVA could not answer, as words only. Pick one to write the answer for your whole team.' },
      { id: 'form', anchor: 'knowledge-form', route: '/ava-knowledge', say: 'Write the question and the answer here. A published answer is used by AVA right away, and only for your organization.' },
      { id: 'list', anchor: 'knowledge-list', route: '/ava-knowledge', say: 'Your team\'s answers are listed here. You can edit, unpublish or remove any of them.' }
    ]
  },
  {
    id: 'help-center',
    title: 'Help Center',
    summary: 'Where to find answers',
    roles: [...STAFF],
    keywords: ['help', 'support', 'answers', 'articles', 'tutorials', 'docs', 'documentation'],
    steps: [
      { id: 'search', anchor: 'help-search', route: '/help-center', say: 'The Help Center is your first stop for questions. Search articles, watch tutorials and find answers to common questions here.' },
      { id: 'topics', anchor: 'help-topics', route: '/help-center', say: 'Pick a topic on the left to browse its guides.' }
    ]
  },
  ...(menuTours as TourDefinition[])
];
