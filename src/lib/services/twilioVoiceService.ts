/**
 * Twilio Voice SDK Service — Client-side VoIP
 *
 * Manages Twilio Voice Device lifecycle for in-browser calling.
 * Credentials are fetched server-side via /api/twilio/voice/token.
 * The TwiML App's Voice URL (see /api/twilio/voice/twiml) dials the
 * external "To" number, bridging it to this browser's WebRTC leg.
 */

import { Device, Call } from '@twilio/voice-sdk';

export interface VoiceCallState {
  status: 'idle' | 'connecting' | 'ringing' | 'in-call' | 'ended' | 'error';
  callSid?: string;
  duration: number;
  configured: boolean;
  error?: string;
}

export interface OutboundCallParams {
  to: string;
  leadId?: string;
  agentId?: string;
  agentName?: string;
}

export interface RecentCall {
  id: string;
  to: string;
  contactName?: string;
  address?: string;
  callSid?: string;
  status: 'completed' | 'no-answer' | 'busy' | 'failed' | 'placeholder';
  duration: number;
  startedAt: string;
  leadId?: string;
}

export interface FavoriteContact {
  id: string;
  contactName: string;
  phone: string;
  address?: string;
  leadId?: string;
  addedAt: string;
}

export function normalizePhoneForTwilio(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed.replace(/[\s().-]/g, '');

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}

// ─── Local storage keys ───────────────────────────────────────────────────────

const RECENT_CALLS_KEY = 'travlr_recent_calls';
const FAVORITES_KEY = 'travlr_dialer_favorites';
const MAX_RECENT = 20;

// ─── Recent Calls ─────────────────────────────────────────────────────────────

export function getRecentCalls(): RecentCall[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_CALLS_KEY);
    return raw ? (JSON.parse(raw) as RecentCall[]) : [];
  } catch {
    return [];
  }
}

export function addRecentCall(call: Omit<RecentCall, 'id'>): RecentCall {
  const entry: RecentCall = { ...call, id: `rc-${Date.now()}` };
  const existing = getRecentCalls();
  const updated = [entry, ...existing].slice(0, MAX_RECENT);
  if (typeof window !== 'undefined') {
    localStorage.setItem(RECENT_CALLS_KEY, JSON.stringify(updated));
  }
  return entry;
}

export function clearRecentCalls(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(RECENT_CALLS_KEY);
  }
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export function getFavorites(): FavoriteContact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as FavoriteContact[]) : [];
  } catch {
    return [];
  }
}

export function addFavorite(contact: Omit<FavoriteContact, 'id' | 'addedAt'>): FavoriteContact {
  const entry: FavoriteContact = {
    ...contact,
    id: `fav-${Date.now()}`,
    addedAt: new Date().toISOString(),
  };
  const existing = getFavorites();
  if (existing.some(f => f.phone === contact.phone)) return existing.find(f => f.phone === contact.phone)!;
  const updated = [entry, ...existing];
  if (typeof window !== 'undefined') {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  }
  return entry;
}

export function removeFavorite(id: string): void {
  const updated = getFavorites().filter(f => f.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  }
}

export function isFavorite(phone: string): boolean {
  return getFavorites().some(f => f.phone === phone);
}

// ─── Token fetch ──────────────────────────────────────────────────────────────

export async function fetchVoiceToken(identity: string): Promise<{ token: string | null; configured: boolean; message?: string }> {
  try {
    const res = await fetch('/api/twilio/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity }),
    });
    return await res.json();
  } catch {
    return { token: null, configured: false, message: 'Failed to fetch voice token' };
  }
}

// ─── Outbound call via REST (fallback when SDK not loaded) ────────────────────

export async function placeOutboundCall(params: OutboundCallParams): Promise<{
  callSid: string;
  status: string;
  configured: boolean;
  error?: string;
}> {
  try {
    const to = normalizePhoneForTwilio(params.to);
    const res = await fetch('/api/twilio/voice/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, to }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        callSid: data.callSid || `error-${Date.now()}`,
        status: 'error',
        configured: data.configured ?? false,
        error: data.error || `Twilio call failed with HTTP ${res.status}`,
      };
    }
    return {
      callSid: data.callSid || `placeholder-${Date.now()}`,
      status: data.status || 'placeholder',
      configured: data.configured ?? false,
      error: data.error,
    };
  } catch (err) {
    return {
      callSid: `error-${Date.now()}`,
      status: 'error',
      configured: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ─── Do Not Contact pre-flight check ───────────────────────────────────────────
// Runs the same DNC validation as /api/twilio/voice/call without placing a
// duplicate REST call, since the actual audio connection now goes through the
// Voice SDK Device below.

export async function checkDoNotContact(params: { to: string; leadId?: string; agentId?: string }): Promise<{
  blocked: boolean;
  error?: string;
}> {
  try {
    const to = normalizePhoneForTwilio(params.to);
    const res = await fetch('/api/twilio/voice/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, to, dryRun: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { blocked: true, error: data.error || 'Unable to verify Do Not Contact status' };
    }
    return { blocked: false };
  } catch (err) {
    return { blocked: true, error: err instanceof Error ? err.message : 'Unable to verify Do Not Contact status' };
  }
}

// ─── Voice SDK Device (real browser WebRTC audio) ──────────────────────────────

let deviceInstance: Device | null = null;
let deviceIdentity: string | null = null;

export async function getOrCreateDevice(identity = 'agent'): Promise<{ device: Device | null; configured: boolean; message?: string }> {
  if (deviceInstance && deviceIdentity === identity) {
    return { device: deviceInstance, configured: true };
  }

  const tokenResult = await fetchVoiceToken(identity);
  if (!tokenResult.token) {
    return { device: null, configured: false, message: tokenResult.message };
  }

  if (deviceInstance) {
    try { deviceInstance.destroy(); } catch { /* ignore */ }
  }

  const device = new Device(tokenResult.token, { logLevel: 'error' });
  deviceInstance = device;
  deviceIdentity = identity;

  device.on('tokenWillExpire', async () => {
    const refreshed = await fetchVoiceToken(identity);
    if (refreshed.token) device.updateToken(refreshed.token);
  });

  await device.register();
  return { device, configured: true };
}

export function getActiveDevice(): Device | null {
  return deviceInstance;
}

export async function connectVoiceCall(params: OutboundCallParams): Promise<{ call: Call | null; error?: string }> {
  const { device, configured, message } = await getOrCreateDevice(params.agentId || 'agent');
  if (!configured || !device) {
    return { call: null, error: message || 'Twilio Voice SDK is not configured' };
  }
  try {
    const to = normalizePhoneForTwilio(params.to);
    const call = await device.connect({
      params: {
        To: to,
        ...(params.leadId ? { leadId: params.leadId } : {}),
        ...(params.agentId ? { agentId: params.agentId } : {}),
      },
    });
    return { call };
  } catch (err) {
    return { call: null, error: err instanceof Error ? err.message : 'Unable to connect call' };
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
