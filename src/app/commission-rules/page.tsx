'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { DollarSign, Plus, Trash2, Save, Users, RotateCcw, AlertTriangle, CheckCircle, Clock, Zap, CreditCard, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface CommissionTier {
  id: string;
  name: string;
  portfolios: string[];
  type: 'flat' | 'percentage' | 'hybrid';
  flatAmount: number;
  percentage: number;
  residualPercentage: number;
  description: string;
}

interface ClawbackRule {
  id: string;
  windowDays: number;
  percentage: number;
  condition: string;
}

interface PayoutSchedule {
  type: 'immediate' | 'biweekly' | 'monthly' | 'after_clawback';
  clawbackWindowDays: number;
}

const defaultTiers: CommissionTier[] = [
  {
    id: 'tier-standard',
    name: 'Standard',
    portfolios: ['CO', 'NV', 'WA'],
    type: 'flat',
    flatAmount: 750,
    percentage: 0,
    residualPercentage: 0,
    description: 'Flat fee per signed Partnership Agreement',
  },
  {
    id: 'tier-luxury',
    name: 'Luxury Markets',
    portfolios: ['CA'],
    type: 'hybrid',
    flatAmount: 1500,
    percentage: 0,
    residualPercentage: 0.5,
    description: 'Higher flat + 0.5% residual for Aspen/Malibu/Newport Beach',
  },
];

const defaultClawback: ClawbackRule[] = [
  {
    id: 'claw-1',
    windowDays: 90,
    percentage: 100,
    condition: 'Homeowner cancels Partnership Agreement within window',
  },
  {
    id: 'claw-2',
    windowDays: 180,
    percentage: 50,
    condition: 'Homeowner cancels between 90–180 days',
  },
];

const PORTFOLIOS = ['CO', 'CA', 'NV', 'WA'];

function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-primary">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

export default function CommissionRulesPage() {
  const [tiers, setTiers] = useState<CommissionTier[]>(defaultTiers);
  const [clawbacks, setClawbacks] = useState<ClawbackRule[]>(defaultClawback);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule>({
    type: 'after_clawback',
    clawbackWindowDays: 90,
  });
  const [roundRobinEnabled, setRoundRobinEnabled] = useState(true);
  const [overflowPool, setOverflowPool] = useState(true);
  const [saving, setSaving] = useState(false);

  function addTier() {
    setTiers(prev => [...prev, {
      id: `tier-${Date.now()}`,
      name: 'New Tier',
      portfolios: [],
      type: 'flat',
      flatAmount: 500,
      percentage: 0,
      residualPercentage: 0,
      description: '',
    }]);
  }

  function removeTier(id: string) {
    setTiers(prev => prev.filter(t => t.id !== id));
  }

  function updateTier(id: string, updates: Partial<CommissionTier>) {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }

  function addClawback() {
    setClawbacks(prev => [...prev, {
      id: `claw-${Date.now()}`,
      windowDays: 90,
      percentage: 100,
      condition: '',
    }]);
  }

  function removeClawback(id: string) {
    setClawbacks(prev => prev.filter(c => c.id !== id));
  }

  function updateClawback(id: string, updates: Partial<ClawbackRule>) {
    setClawbacks(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success('Commission rules saved');
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Commission Rules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure agent commission tiers, clawback conditions, and payout schedules</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            Save Rules
          </button>
        </div>

        {/* Lead Assignment Model */}
        <Section title="Lead Assignment Model" icon={<RotateCcw size={16} />}>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${roundRobinEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                  <RotateCcw size={18} className={roundRobinEnabled ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Auto Round-Robin Assignment</p>
                  <p className="text-xs text-muted-foreground">New leads are automatically distributed evenly across available agents</p>
                </div>
              </div>
              <button
                onClick={() => setRoundRobinEnabled(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${roundRobinEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${roundRobinEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${overflowPool ? 'bg-amber-500/10' : 'bg-muted'}`}>
                  <Users size={18} className={overflowPool ? 'text-amber-500' : 'text-muted-foreground'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Overflow Claim Pool</p>
                  <p className="text-xs text-muted-foreground">Unassigned leads go to a shared pool where agents can claim them first-come</p>
                </div>
              </div>
              <button
                onClick={() => setOverflowPool(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${overflowPool ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${overflowPool ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
              <Info size={13} className="text-info mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Commission trigger: Partnership Agreement signed via DocuSign. Auto-calculates commission based on active tier at time of close.
              </p>
            </div>
          </div>
        </Section>

        {/* Commission Tiers */}
        <Section title="Commission Tiers" icon={<DollarSign size={16} />}>
          <div className="space-y-4">
            {tiers.map(tier => (
              <div key={tier.id} className="border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    value={tier.name}
                    onChange={e => updateTier(tier.id, { name: e.target.value })}
                    className="text-sm font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-none transition-colors"
                  />
                  <button onClick={() => removeTier(tier.id)} className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-muted-foreground transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Commission Type</label>
                    <select
                      value={tier.type}
                      onChange={e => updateTier(tier.id, { type: e.target.value as CommissionTier['type'] })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="flat">Flat Fee</option>
                      <option value="percentage">% of First-Year Revenue</option>
                      <option value="hybrid">Hybrid (Flat + Residual)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Portfolios</label>
                    <div className="flex flex-wrap gap-1">
                      {PORTFOLIOS.map(p => (
                        <button
                          key={p}
                          onClick={() => {
                            const has = tier.portfolios.includes(p);
                            updateTier(tier.id, { portfolios: has ? tier.portfolios.filter(x => x !== p) : [...tier.portfolios, p] });
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            tier.portfolios.includes(p) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-primary/10'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(tier.type === 'flat' || tier.type === 'hybrid') && (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Flat Amount ($)</label>
                      <input
                        type="number"
                        value={tier.flatAmount}
                        onChange={e => updateTier(tier.id, { flatAmount: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                  )}
                  {tier.type === 'percentage' && (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">% of Revenue</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tier.percentage}
                        onChange={e => updateTier(tier.id, { percentage: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                  )}
                  {tier.type === 'hybrid' && (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Residual %</label>
                      <input
                        type="number"
                        step="0.1"
                        value={tier.residualPercentage}
                        onChange={e => updateTier(tier.id, { residualPercentage: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Description</label>
                    <input
                      value={tier.description}
                      onChange={e => updateTier(tier.id, { description: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addTier}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all w-full justify-center"
            >
              <Plus size={14} />
              Add Tier
            </button>
          </div>
        </Section>

        {/* Clawback Conditions */}
        <Section title="Clawback Conditions" icon={<AlertTriangle size={16} />}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Define when commissions are reversed if a homeowner cancels after signing.</p>
            {clawbacks.map(rule => (
              <div key={rule.id} className="border border-border rounded-xl p-4 grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Window (Days)</label>
                  <input
                    type="number"
                    value={rule.windowDays}
                    onChange={e => updateClawback(rule.id, { windowDays: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Clawback %</label>
                  <input
                    type="number"
                    value={rule.percentage}
                    onChange={e => updateClawback(rule.id, { percentage: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Condition</label>
                    <input
                      value={rule.condition}
                      onChange={e => updateClawback(rule.id, { condition: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <button onClick={() => removeClawback(rule.id)} className="p-2 rounded-lg hover:bg-danger/10 hover:text-danger text-muted-foreground transition-colors mb-0.5">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={addClawback}
              className="flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all w-full justify-center"
            >
              <Plus size={14} />
              Add Clawback Rule
            </button>
          </div>
        </Section>

        {/* Payout Schedule */}
        <Section title="Payout Schedule" icon={<Clock size={16} />}>
          <div className="space-y-3">
            {[
              { value: 'immediate', label: 'Immediate on Close', desc: 'Commission paid as soon as deal closes — fastest for agents, higher risk for TRAVLR' },
              { value: 'biweekly', label: 'Bi-Weekly', desc: 'Commissions batch-paid every two weeks on a fixed schedule' },
              { value: 'monthly', label: 'Monthly', desc: 'Commissions paid once per month on a fixed date' },
              { value: 'after_clawback', label: 'After Clawback Window', desc: 'Safest for TRAVLR — commission held until clawback window expires' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                payoutSchedule.type === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
              }`}>
                <input
                  type="radio"
                  name="payoutSchedule"
                  value={opt.value}
                  checked={payoutSchedule.type === opt.value}
                  onChange={() => setPayoutSchedule(prev => ({ ...prev, type: opt.value as PayoutSchedule['type'] }))}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* Stripe Connect Placeholder */}
        <Section title="Stripe Connect — Agent Payouts" icon={<CreditCard size={16} />}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Stripe Secret Key Required</p>
                <p className="text-xs text-amber-700 mt-0.5">Add your Stripe secret key to <code className="bg-amber-100 px-1 rounded">.env</code> as <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code> to enable live payouts.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: CheckCircle, label: 'Stripe Connect Onboarding', desc: 'Auto-create connected accounts on agent invite', ready: true },
                { icon: DollarSign, label: 'Automated Payout Transfers', desc: 'One-click payout processing per schedule', ready: true },
                { icon: Zap, label: 'Settlement Tracking', desc: 'Track transfer status and settlement dates', ready: true },
                { icon: Users, label: 'Agent Bank Verification', desc: 'Stripe handles KYC and bank account verification', ready: true },
              ].map(({ icon: Icon, label, desc, ready }) => (
                <div key={label} className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-success" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    <span className="text-[10px] font-medium text-success">Ready to activate</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </AppLayout>
  );
}
