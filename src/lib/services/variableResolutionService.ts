/**
 * Shared Variable Resolution Service
 * Used by BOTH Email Templates and Teleprompter — single source of truth.
 * Resolves: contactName, address, senderName, localBlurb
 * Fallback rules match the email autofill spec exactly.
 */

import { resolveLocalBlurb } from '@/lib/localBlurbs';

export interface LeadVariables {
  contactName: string;
  address: string;
  city?: string;
  state?: string;
}

export interface AgentVariables {
  senderName: string;
}

export interface ResolvedVariables {
  contactName: string;          // resolved or "there"
  address: string;              // resolved or BLOCKED (address is required)
  senderName: string;           // resolved from agent profile
  localBlurb: string;           // resolved from lookup table or neutral fallback
  localBlurbSource: 'city' | 'state' | 'neutral';
  localBlurbNeedsFlag: boolean; // true when fell back to neutral — flag the lead's zone
  addressMissing: boolean;      // true if address could not be resolved — blocks teleprompter start
  contactNameFallback: boolean; // true if contactName fell back to "there"
  senderNameMissing: boolean;   // true if senderName could not be resolved
}

/**
 * Resolve all merge-field variables for a given lead + agent.
 * This is the single resolution function called by both email send flow
 * and teleprompter session start.
 *
 * @param lead   - Lead record fields (contactName, address, city, state)
 * @param agent  - Logged-in agent profile (senderName)
 */
export function resolveVariables(
  lead: LeadVariables,
  agent: AgentVariables
): ResolvedVariables {
  // ── contactName ──────────────────────────────────────────────────────────
  const rawName = lead.contactName?.trim();
  const contactName = rawName && rawName.length > 0 ? rawName : 'there';
  const contactNameFallback = !rawName || rawName.length === 0;

  // ── address ──────────────────────────────────────────────────────────────
  const rawAddress = lead.address?.trim();
  const address = rawAddress || '';
  const addressMissing = !rawAddress || rawAddress.length === 0;

  // ── senderName ───────────────────────────────────────────────────────────
  const rawSender = agent.senderName?.trim();
  const senderName = rawSender || '';
  const senderNameMissing = !rawSender || rawSender.length === 0;

  // ── localBlurb ───────────────────────────────────────────────────────────
  const { blurb: localBlurb, source: localBlurbSource, needsFlag: localBlurbNeedsFlag } =
    resolveLocalBlurb(lead.city, lead.state);

  return {
    contactName,
    address,
    senderName,
    localBlurb,
    localBlurbSource,
    localBlurbNeedsFlag,
    addressMissing,
    contactNameFallback,
    senderNameMissing,
  };
}

/**
 * Apply resolved variables to a script template string.
 * Replaces all {contactName}, {address}, {senderName}, {localBlurb} tokens.
 * If a variable is missing and has no safe fallback, returns the line with a
 * visually distinct placeholder so the agent knows to ad-lib.
 */
export function applyVariables(template: string, vars: ResolvedVariables): string {
  return template
    .replace(/\{contactName\}/g, vars.contactName)
    .replace(/\{address\}/g, vars.addressMissing ? '[PROPERTY ADDRESS — check lead record]' : vars.address)
    .replace(/\{senderName\}/g, vars.senderNameMissing ? '[YOUR NAME]' : vars.senderName)
    .replace(/\{localBlurb\}/g, vars.localBlurb);
}

/**
 * Per-agent device preference storage (localStorage, keyed by agent/user ID).
 * Stores headset device IDs so the agent's selection persists between sessions.
 */
export const devicePreferences = {
  getKey: (userId: string) => `travlr_headset_prefs_${userId}`,

  save: (userId: string, prefs: { audioInputId?: string; audioOutputId?: string }) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(devicePreferences.getKey(userId), JSON.stringify(prefs));
    } catch { /* storage unavailable */ }
  },

  load: (userId: string): { audioInputId?: string; audioOutputId?: string } => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(devicePreferences.getKey(userId));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  },

  clear: (userId: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(devicePreferences.getKey(userId));
    } catch { /* storage unavailable */ }
  },
};
