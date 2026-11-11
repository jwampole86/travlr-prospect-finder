// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Role policy for the tool gateway. The role always comes from the authenticated session on the server,
// never from anything the browser or the model sends.
export const ROLES = ['admin', 'owner', 'agent', 'homeowner'];

const BASE = ['search_knowledge', 'show_on_screen', 'go_to_page', 'start_tour'];
// Staff can read their leads and follow-ups, and change them only through a confirmed action. Agents are scoped to their own leads
// by the backend adapter; the gateway only decides which tools exist. The seller pipeline is admin and owner only.
const STAFF = [...BASE, 'search_leads', 'get_lead_details', 'list_followups', 'review_verification', 'get_briefing', 'get_stats', 'offer_export', 'create_followup', 'update_lead_stage', 'complete_followup'];

export const ROLE_TOOLS = {
  admin: [...STAFF, 'seller_pipeline'],
  owner: [...STAFF, 'seller_pipeline'],
  agent: STAFF,
  homeowner: BASE
};

export const normalizeRole = (role) => (ROLES.includes(role) ? role : null);

/** Unknown roles get no tools at all (deny by default). */
export const canUse = (role, tool) => !!normalizeRole(role) && ROLE_TOOLS[role].includes(tool);
export const toolsForRole = (role) => (normalizeRole(role) ? ROLE_TOOLS[role] : []);
