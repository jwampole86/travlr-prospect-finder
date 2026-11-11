'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { api, btnCls, inputCls, primaryBtnCls } from './ui';

type Home = { id: string; title: string; city: string | null; state: string | null; status: string; quality_approved: boolean; owner_email: string | null; authorized_emails: string[] };
type Claim = { id: string; email: string; claimant_name: string | null; address_text: string | null; city: string | null; state: string | null; created_at: string; lead: { address: string | null; city: string | null; state: string | null; contact_name: string | null; owner_email: string | null } | null };

function HomeRow({ home, onSaved }: { home: Home; onSaved: () => void }) {
  const [owner, setOwner] = useState(home.owner_email ?? '');
  const [others, setOthers] = useState(home.authorized_emails.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = owner.trim().toLowerCase() !== (home.owner_email ?? '') || others.trim().toLowerCase() !== home.authorized_emails.join(', ');

  async function save() {
    setBusy(true); setError(null);
    try { await api(`/api/seller/owner-access/stays/${home.id}`, { method: 'PATCH', body: { owner_email: owner, authorized_emails: others } }); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-2 border-t border-border py-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
      <div><p className="text-sm font-medium">{home.title}</p><p className="text-xs text-muted-foreground">{[home.city, home.state].filter(Boolean).join(', ')} · {home.status}{home.quality_approved ? '' : ' · not approved'}</p></div>
      <input className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner email" aria-label={`Owner email for ${home.title}`} />
      <input className={inputCls} value={others} onChange={(e) => setOthers(e.target.value)} placeholder="Co-owners or managers (comma separated)" aria-label={`Other authorized emails for ${home.title}`} />
      <div className="flex items-center gap-2">
        <button className={primaryBtnCls} disabled={!dirty || busy} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}</button>
        {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** Who may manage each NAVEO Stays home, and the ownership claims waiting for a person's decision on NAVEO Homes submissions. */
export default function OwnerAccessTab() {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([api<{ items: Home[] }>('/api/seller/owner-access/stays'), api<{ items: Claim[] }>('/api/seller/owner-access/claims')]);
      setHomes(h.items); setClaims(c.items); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, action: 'approve' | 'dismiss') {
    try { await api(`/api/seller/owner-access/claims/${id}`, { method: 'PATCH', body: { action } }); load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">NAVEO Stays homes: who can manage them</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
          An owner who signs in on the NAVEO Stays site sees only the homes where their email is the owner email or is listed as a co-owner or manager. A home with no owner email cannot be opened by anyone.
          Changing an email takes effect immediately; the old email loses access.
        </p>
        <div className="mt-3">
          {homes === null ? <Loader2 className="animate-spin" size={16} /> : homes.length === 0 ? <p className="text-sm text-muted-foreground">No NAVEO Stays homes yet.</p> : homes.map((h) => <HomeRow key={h.id + (h.owner_email ?? '') + h.authorized_emails.join()} home={h} onSaved={load} />)}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Ownership claims on NAVEO Homes submissions</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
          Someone submitted an address AVYRO already holds. They have not proven they own it, so they see only that it was received. Compare the address they typed with the lead; approving makes them the owner of that lead
          (replacing any earlier owner email), dismissing changes nothing.
        </p>
        <div className="mt-3 space-y-3">
          {claims === null ? <Loader2 className="animate-spin" size={16} /> : claims.length === 0 ? <p className="text-sm text-muted-foreground">No claims waiting.</p> : claims.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
              <p><span className="font-medium">{c.claimant_name || 'Unnamed'}</span> · {c.email}</p>
              <p className="text-xs text-muted-foreground">Typed: {[c.address_text, c.city, c.state].filter(Boolean).join(', ')}</p>
              <p className="text-xs text-muted-foreground">AVYRO lead: {c.lead ? [c.lead.address, c.lead.city, c.lead.state].filter(Boolean).join(', ') : 'missing'}{c.lead?.owner_email ? ` · current owner email ${c.lead.owner_email}` : ' · no owner email yet'}</p>
              <div className="mt-2 flex gap-2"><button className={primaryBtnCls} onClick={() => decide(c.id, 'approve')}>Approve as owner</button><button className={btnCls} onClick={() => decide(c.id, 'dismiss')}>Dismiss</button></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
