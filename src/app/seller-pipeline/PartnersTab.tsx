'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { SERVICE_LINES, SERVICE_LINE_LABEL } from '@/lib/seller/types';
import { Field, api, btnCls, inputCls, primaryBtnCls } from './ui';

export type Partner = {
  id: string; name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; services: string[];
  license_type: string | null; license_number: string | null; license_state: string | null; license_status: string; states: string[];
  relationship_status: string; compensation_terms: string | null; legal_reviewed: boolean; agreement_on_file: boolean; notes: string | null;
};

const EMPTY = { name: '', contact_name: '', contact_email: '', contact_phone: '', services: ['sale_partner'] as string[], license_type: '', license_number: '', license_state: '', states: '', compensation_terms: '' };

export default function PartnersTab() {
  const [items, setItems] = useState<Partner[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Partner[] }>('/api/seller/partners')).items); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    try {
      await api('/api/seller/partners', { method: 'POST', body: { ...form, states: form.states.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) } });
      setForm(EMPTY); setOpen(false); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    try { await api('/api/seller/partners', { method: 'PATCH', body: { id, ...body } }); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Service partners</h2>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">Brokerages and vendors you may route owners to. A sale referral is only allowed once the partner's license is verified, the arrangement has had legal review, and the signed agreement is on file.</p>
          </div>
          <button onClick={() => setOpen(!open)} className={primaryBtnCls}><Plus size={14} /> Add partner</button>
        </div>
        {open && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Contact name"><input className={inputCls} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <Field label="Contact email"><input className={inputCls} value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            <Field label="Contact phone"><input className={inputCls} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></Field>
            <Field label="License type"><input className={inputCls} placeholder="Real estate broker" value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })} /></Field>
            <Field label="License number"><input className={inputCls} value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} /></Field>
            <Field label="License state"><input className={inputCls} maxLength={2} value={form.license_state} onChange={(e) => setForm({ ...form, license_state: e.target.value.toUpperCase() })} /></Field>
            <Field label="Service states (comma separated)"><input className={inputCls} placeholder="CO, TX" value={form.states} onChange={(e) => setForm({ ...form, states: e.target.value })} /></Field>
            <Field label="Services">
              <select multiple className={`${inputCls} h-24`} value={form.services} onChange={(e) => setForm({ ...form, services: [...e.target.selectedOptions].map((o) => o.value) })}>
                {SERVICE_LINES.map((s) => <option key={s} value={s}>{SERVICE_LINE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Compensation terms" className="sm:col-span-3"><textarea className={`${inputCls} h-20 py-2`} value={form.compensation_terms} onChange={(e) => setForm({ ...form, compensation_terms: e.target.value })} /></Field>
            <div className="sm:col-span-3"><button disabled={busy || !form.name.trim()} onClick={add} className={primaryBtnCls}>{busy && <Loader2 size={14} className="animate-spin" />} Save partner</button></div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </Card>

      {!items ? <Card className="p-8 flex justify-center"><Loader2 className="animate-spin" /></Card> : items.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No partners yet. Add the licensed brokerage or vendor you plan to work with.</Card>
      ) : items.map((p) => (
        <Card key={p.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">{[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(' · ') || 'No contact yet'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.services.map((s) => SERVICE_LINE_LABEL[s as keyof typeof SERVICE_LINE_LABEL] ?? s).join(', ')}{p.states.length ? ` · ${p.states.join(', ')}` : ''}</p>
              {p.license_type && <p className="text-xs text-muted-foreground">{p.license_type} {p.license_number} {p.license_state}</p>}
              {p.compensation_terms && <p className="mt-1 text-xs">{p.compensation_terms}</p>}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <select className={`${inputCls} !w-auto`} value={p.relationship_status} onChange={(e) => patch(p.id, { relationship_status: e.target.value })}>
                {['prospect', 'active', 'paused', 'ended'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={btnCls} onClick={() => patch(p.id, p.license_status === 'verified' ? { license_status: 'unverified', license_verified_at: null } : { license_status: 'verified', license_verified_at: new Date().toISOString() })}>
                {p.license_status === 'verified' ? 'License verified ✓' : 'Mark license verified'}
              </button>
              <button className={btnCls} onClick={() => patch(p.id, { legal_reviewed: !p.legal_reviewed })}>{p.legal_reviewed ? 'Legal review done ✓' : 'Mark legal review done'}</button>
              <button className={btnCls} onClick={() => patch(p.id, { agreement_on_file: !p.agreement_on_file })}>{p.agreement_on_file ? 'Agreement on file ✓' : 'Mark agreement on file'}</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
