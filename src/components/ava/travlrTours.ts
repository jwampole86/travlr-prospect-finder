import type { TourDefinition } from './host/types';

const STAFF = ['admin', 'owner', 'agent'] as const;
const ADMINS = ['admin', 'owner'] as const;

/**
 * Guided tours of real TRAVLR/AVYRO screens. Each step points at an element marked `data-ava-anchor="..."` in the page
 * source (a test checks every anchor still exists). Routes in /pipeline and the dashboard are admin-only in the app, so
 * those tours are only offered to admins and owners.
 */
export const TRAVLR_TOURS: TourDefinition[] = [
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
  }
];
