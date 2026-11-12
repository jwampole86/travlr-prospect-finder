'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Pending = { id: string; email: string; full_name: string | null; created_at: string };

/** New sign-ups wait here with no access until an admin picks a role. Renders nothing when nobody is waiting. */
export default function PendingApprovals() {
  const [users, setUsers] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/pending-users', { cache: 'no-store' });
    if (res.ok) setUsers(((await res.json()) as { users: Pending[] }).users);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject', role?: 'agent' | 'admin') {
    setBusy(id);
    const res = await fetch('/api/admin/pending-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: id, action, role }) });
    const j = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { toast.error(j.error || 'Could not update that account'); return; }
    toast.success(action === 'approve' ? `Approved as ${role}` : 'Account declined');
    void load();
  }

  if (users.length === 0) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
      <h2 className="text-sm font-semibold text-foreground">Awaiting approval ({users.length})</h2>
      <p className="mt-1 text-xs text-muted-foreground">These people created an account and can see nothing yet. Approve only people you know.</p>
      <ul className="mt-3 divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><span className="font-medium">{u.full_name || u.email}</span>{u.full_name ? <span className="text-muted-foreground"> · {u.email}</span> : null}<span className="text-muted-foreground"> · {new Date(u.created_at).toLocaleDateString()}</span></span>
            <span className="flex gap-2">
              <button disabled={busy === u.id} onClick={() => act(u.id, 'approve', 'agent')} className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50">Approve as agent</button>
              <button disabled={busy === u.id} onClick={() => act(u.id, 'approve', 'admin')} className="rounded-md border border-border px-2.5 py-1 text-xs disabled:opacity-50">Approve as admin</button>
              <button disabled={busy === u.id} onClick={() => act(u.id, 'reject')} className="rounded-md border border-border px-2.5 py-1 text-xs text-red-700 disabled:opacity-50">Decline</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
