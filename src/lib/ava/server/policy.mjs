// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Role policy for the tool gateway. The role always comes from the authenticated session on the server,
// never from anything the browser or the model sends.
export const ROLES = ['admin', 'owner', 'agent', 'homeowner'];

export const ROLE_TOOLS = {
  admin: ['search_leads', 'search_knowledge', 'show_on_screen', 'start_tour', 'create_followup'],
  owner: ['search_leads', 'search_knowledge', 'show_on_screen', 'start_tour', 'create_followup'],
  // Agents are scoped to their own leads by the backend adapter; the gateway only decides which tools exist.
  agent: ['search_leads', 'search_knowledge', 'show_on_screen', 'start_tour', 'create_followup'],
  homeowner: ['search_knowledge', 'show_on_screen', 'start_tour']
};

export const normalizeRole = (role) => (ROLES.includes(role) ? role : null);

/** Unknown roles get no tools at all (deny by default). */
export const canUse = (role, tool) => !!normalizeRole(role) && ROLE_TOOLS[role].includes(tool);
export const toolsForRole = (role) => (normalizeRole(role) ? ROLE_TOOLS[role] : []);
