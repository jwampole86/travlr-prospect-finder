import { resolveVariables } from '@/lib/services/variableResolutionService';

export const FOLLOW_UP_CATEGORIES: Array<{ key: string; label: string; tone: string }> = [
  { key: 'initial_outreach', label: 'Initial outreach', tone: 'bg-blue-500/10 text-blue-600' },
  { key: 'follow_up_1', label: 'Follow-up', tone: 'bg-amber-500/10 text-amber-600' },
  { key: 'check_in', label: 'Check-in', tone: 'bg-cyan-500/10 text-cyan-600' },
  { key: 'proposal_introduction', label: 'Proposal', tone: 'bg-purple-500/10 text-purple-600' },
  { key: 'closing', label: 'Closing', tone: 'bg-green-500/10 text-green-600' },
];
export const categoryLabel = (k: string) => FOLLOW_UP_CATEGORIES.find(c => c.key === k)?.label ?? k.replace(/_/g, ' ');

interface Block { id?: string; type?: string; content?: string }

/** Templates are stored as a list of blocks; only an all-text template can be edited as plain text. */
export function templateToText(body: string): { text: string; editable: boolean } {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      const blocks = parsed as Block[];
      return { text: blocks.map(b => b.content ?? '').filter(Boolean).join('\n\n'), editable: blocks.every(b => !b.type || b.type === 'text') };
    }
  } catch { /* plain text */ }
  // Older plain-text templates were saved with a typed backslash-n instead of a line break.
  return { text: (body || '').replace(/\\n/g, '\n'), editable: true };
}

/** The same single-text-block format the Email Templates editor writes. */
export const textToBody = (text: string) => JSON.stringify([{ id: `blk-${Date.now().toString(36)}`, type: 'text', content: text }]);

export interface MergeLead { address?: string | null; city?: string | null; state?: string | null; contact_name?: string | null; owner_name?: string | null; price?: number | null }

const TOKEN = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/** Fills a template for one lead. Anything it cannot fill is listed in `missing` so nothing goes out with a raw {{field}}. */
export function renderTemplate(subject: string, body: string, lead: MergeLead, senderName: string) {
  const v = resolveVariables({ contactName: String(lead.contact_name || lead.owner_name || '').trim().split(/\s+/)[0] ?? '', address: lead.address ?? '', city: lead.city ?? undefined, state: lead.state ?? undefined }, { senderName });
  const values: Record<string, string> = {
    address: v.address, contactName: v.contactName, senderName: v.senderName, localBlurb: v.localBlurb,
    price: lead.price ? `$${Math.round(Number(lead.price)).toLocaleString('en-US')}` : '',
  };
  const missing = new Set<string>();
  const fill = (s: string) => s.replace(TOKEN, (_m, name: string) => { const val = values[name]; if (!val) { missing.add(name); return `{{${name}}}`; } return val; });
  return { subject: fill(subject), text: fill(templateToText(body).text), missing: [...missing] };
}
