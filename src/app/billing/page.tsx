'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { CreditCard, Users, CheckCircle, Download, Plus, Trash2, X, ArrowRight, Shield, Zap, Crown, RefreshCw, TrendingUp } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  seats: number;
  features: string[];
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  popular?: boolean;
}

interface Seat {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
  downloadUrl: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 99,
    interval: 'month',
    seats: 3,
    features: ['Up to 3 seats', '1,000 leads/mo', 'Basic cadence', 'Email support'],
    icon: Zap,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/10',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 299,
    interval: 'month',
    seats: 10,
    features: ['Up to 10 seats', '10,000 leads/mo', 'Advanced cadence + SMS', 'ML scoring', 'Priority support'],
    icon: TrendingUp,
    iconColor: 'text-violet-400',
    iconBg: 'bg-violet-500/10',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 799,
    interval: 'month',
    seats: 999,
    features: ['Unlimited seats', 'Unlimited leads', 'Custom integrations', 'Dedicated CSM', 'SLA guarantee', 'SSO/SAML'],
    icon: Crown,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
  },
];

const mockSeats: Seat[] = [
  { id: 's1', name: 'Sarah Mitchell', email: 'sarah@travlrpro.com', role: 'admin', status: 'active', joinedAt: '2026-07-01' },
  { id: 's2', name: 'James Torres', email: 'james@travlrpro.com', role: 'agent', status: 'active', joinedAt: '2026-07-05' },
  { id: 's3', name: 'Priya Nair', email: 'priya@travlrpro.com', role: 'agent', status: 'active', joinedAt: '2026-07-10' },
  { id: 's4', name: 'Marcus Webb', email: 'marcus@travlrpro.com', role: 'agent', status: 'active', joinedAt: '2026-07-15' },
  { id: 's5', name: 'Lisa Monroe', email: 'lisa@travlrpro.com', role: 'viewer', status: 'invited', joinedAt: '2026-08-10' },
];

const mockInvoices: Invoice[] = [
  { id: 'inv-001', date: '2026-08-01', amount: 299, status: 'paid', description: 'Growth Plan — August 2026', downloadUrl: '#' },
  { id: 'inv-002', date: '2026-07-01', amount: 299, status: 'paid', description: 'Growth Plan — July 2026', downloadUrl: '#' },
  { id: 'inv-003', date: '2026-06-01', amount: 299, status: 'paid', description: 'Growth Plan — June 2026', downloadUrl: '#' },
  { id: 'inv-004', date: '2026-05-01', amount: 99, status: 'paid', description: 'Starter Plan — May 2026', downloadUrl: '#' },
  { id: 'inv-005', date: '2026-09-01', amount: 299, status: 'pending', description: 'Growth Plan — September 2026', downloadUrl: '#' },
];

const mockPaymentMethods: PaymentMethod[] = [
  { id: 'pm-1', brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2027, isDefault: true },
  { id: 'pm-2', brand: 'Mastercard', last4: '5555', expMonth: 8, expYear: 2026, isDefault: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Seat['role'] }) {
  const cfg = { admin: 'bg-amber-500/15 text-amber-400', agent: 'bg-blue-500/15 text-blue-400', viewer: 'bg-gray-700/50 text-gray-400' }[role];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cfg}`}>{role}</span>;
}

function SeatStatusBadge({ status }: { status: Seat['status'] }) {
  const cfg = {
    active: 'bg-emerald-500/15 text-emerald-400',
    invited: 'bg-amber-500/15 text-amber-400',
    suspended: 'bg-red-500/15 text-red-400',
  }[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cfg}`}>{status}</span>;
}

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  const cfg = {
    paid: 'bg-emerald-500/15 text-emerald-400',
    pending: 'bg-amber-500/15 text-amber-400',
    failed: 'bg-red-500/15 text-red-400',
  }[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cfg}`}>{status}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'seats' | 'invoices' | 'payment'>('overview');
  const [currentPlanId, setCurrentPlanId] = useState('growth');
  const [seats, setSeats] = useState<Seat[]>(mockSeats);
  const [invoices] = useState<Invoice[]>(mockInvoices);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(mockPaymentMethods);
  const [switchingPlan, setSwitchingPlan] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Seat['role']>('agent');
  const [addCardModal, setAddCardModal] = useState(false);

  const currentPlan = PLANS.find(p => p.id === currentPlanId)!;
  const activeSeats = seats.filter(s => s.status === 'active').length;
  const totalSeats = seats.length;

  const switchPlan = useCallback((plan: Plan) => {
    setSwitchingPlan(plan.id);
    setTimeout(() => {
      setCurrentPlanId(plan.id);
      setSwitchingPlan(null);
      setConfirmPlan(null);
    }, 1500);
  }, []);

  const inviteSeat = useCallback(() => {
    if (!inviteEmail.trim()) return;
    const newSeat: Seat = {
      id: `s-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      role: inviteRole,
      status: 'invited',
      joinedAt: new Date().toISOString().slice(0, 10),
    };
    setSeats(prev => [...prev, newSeat]);
    setInviteModal(false);
    setInviteEmail('');
  }, [inviteEmail, inviteRole]);

  const removeSeat = useCallback((id: string) => {
    setSeats(prev => prev.filter(s => s.id !== id));
  }, []);

  const setDefaultCard = useCallback((id: string) => {
    setPaymentMethods(prev => prev.map(pm => ({ ...pm, isDefault: pm.id === id })));
  }, []);

  const removeCard = useCallback((id: string) => {
    setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
  }, []);

  const totalMrr = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0d1117] text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Icon icon={CreditCard} className="w-6 h-6 text-violet-400" />
              Subscription & Billing
            </h1>
            <p className="text-gray-400 text-sm mt-1">Manage plans, team seats, invoices, and payment methods</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">Stripe Sandbox Mode</span>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Current Plan</p>
            <p className="text-lg font-bold text-white">{currentPlan.name}</p>
            <p className="text-xs text-gray-400">${currentPlan.price}/mo</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Team Seats</p>
            <p className="text-lg font-bold text-white">{activeSeats} / {currentPlan.seats === 999 ? '∞' : currentPlan.seats}</p>
            <p className="text-xs text-gray-400">{totalSeats} total members</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Next Invoice</p>
            <p className="text-lg font-bold text-white">${currentPlan.price}</p>
            <p className="text-xs text-gray-400">Due Sep 1, 2026</p>
          </div>
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Paid (YTD)</p>
            <p className="text-lg font-bold text-white">${totalMrr.toLocaleString()}</p>
            <p className="text-xs text-gray-400">{invoices.filter(i => i.status === 'paid').length} invoices</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#1a1f2e] rounded-lg p-1 w-fit">
          {(['overview', 'seats', 'invoices', 'payment'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {tab === 'overview' ? 'Plan Overview' : tab === 'seats' ? 'Team Seats' : tab === 'invoices' ? 'Invoices' : 'Payment Methods'}
            </button>
          ))}
        </div>

        {/* ── Plan Overview ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-3 gap-5">
            {PLANS.map(plan => {
              const isCurrent = plan.id === currentPlanId;
              const isSwitching = switchingPlan === plan.id;
              return (
                <div key={plan.id} className={`bg-[#1a1f2e] border rounded-xl p-6 relative transition-all ${isCurrent ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-[#2a3142] hover:border-[#3a4152]'}`}>
                  {plan.popular && !isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-violet-600 rounded-full text-xs font-semibold">Most Popular</div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-emerald-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Current Plan
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${plan.iconBg}`}>
                    <Icon icon={plan.icon} className={`w-6 h-6 ${plan.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1 mb-4">
                    <span className="text-3xl font-bold text-white">${plan.price}</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div className="w-full py-2.5 bg-emerald-600/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400 text-center font-medium">
                      Active Plan
                    </div>
                  ) : (
                    <button onClick={() => setConfirmPlan(plan)} disabled={isSwitching}
                      className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                      {isSwitching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Switch to {plan.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Team Seats ── */}
        {activeTab === 'seats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2 bg-[#2a3142] rounded-full w-48 overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(activeSeats / (currentPlan.seats === 999 ? activeSeats + 5 : currentPlan.seats)) * 100}%` }} />
                </div>
                <span className="text-sm text-gray-400">{activeSeats} of {currentPlan.seats === 999 ? '∞' : currentPlan.seats} seats used</span>
              </div>
              <button onClick={() => setInviteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Invite Member
              </button>
            </div>
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3142]">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {seats.map(seat => (
                    <tr key={seat.id} className="border-b border-[#2a3142] last:border-0 hover:bg-[#2a3142]/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-white">{seat.name}</p>
                          <p className="text-xs text-gray-500">{seat.email}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><RoleBadge role={seat.role} /></td>
                      <td className="px-5 py-3.5"><SeatStatusBadge status={seat.status} /></td>
                      <td className="px-5 py-3.5 text-sm text-gray-400">{seat.joinedAt}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => removeSeat(seat.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Invoices ── */}
        {activeTab === 'invoices' && (
          <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a3142]">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-[#2a3142] last:border-0 hover:bg-[#2a3142]/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-white">{inv.description}</p>
                        <p className="text-xs text-gray-500">{inv.id}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{inv.date}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-white">${inv.amount.toLocaleString()}</td>
                    <td className="px-5 py-3.5"><InvoiceStatusBadge status={inv.status} /></td>
                    <td className="px-5 py-3.5 text-right">
                      {inv.status === 'paid' && (
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0d1117] border border-[#2a3142] rounded-lg text-xs text-gray-400 hover:text-white transition-colors ml-auto">
                          <Download className="w-3 h-3" /> PDF
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Payment Methods ── */}
        {activeTab === 'payment' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setAddCardModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" /> Add Payment Method
              </button>
            </div>
            <div className="space-y-3">
              {paymentMethods.map(pm => (
                <div key={pm.id} className={`bg-[#1a1f2e] border rounded-xl p-5 flex items-center justify-between ${pm.isDefault ? 'border-violet-500/40' : 'border-[#2a3142]'}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-8 bg-[#0d1117] border border-[#2a3142] rounded-md flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{pm.brand} •••• {pm.last4}</p>
                        {pm.isDefault && <span className="px-2 py-0.5 bg-violet-500/15 text-violet-400 rounded-full text-xs font-medium">Default</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Expires {pm.expMonth.toString().padStart(2, '0')}/{pm.expYear}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!pm.isDefault && (
                      <button onClick={() => setDefaultCard(pm.id)}
                        className="px-3 py-1.5 bg-[#0d1117] border border-[#2a3142] rounded-lg text-xs text-gray-400 hover:text-white transition-colors">
                        Set Default
                      </button>
                    )}
                    <button onClick={() => removeCard(pm.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-gray-400">Payments are processed securely via <span className="text-white font-medium">Stripe</span>. Card details are never stored on our servers.</p>
            </div>
          </div>
        )}

        {/* ── Confirm Plan Switch Modal ── */}
        {confirmPlan && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Switch to {confirmPlan.name}?</h3>
                <button onClick={() => setConfirmPlan(null)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-[#0d1117] border border-[#2a3142] rounded-lg p-4 mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Current plan</span>
                  <span className="text-white">{currentPlan.name} — ${currentPlan.price}/mo</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">New plan</span>
                  <span className="text-violet-400 font-semibold">{confirmPlan.name} — ${confirmPlan.price}/mo</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-5">Changes take effect immediately. You'll be billed the prorated difference on your next invoice.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmPlan(null)} className="flex-1 px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button onClick={() => switchPlan(confirmPlan)} disabled={switchingPlan === confirmPlan.id}
                  className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  {switchingPlan === confirmPlan.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Confirm Switch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Invite Modal ── */}
        {inviteModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2"><Users className="w-4 h-4 text-violet-400" /> Invite Team Member</h3>
                <button onClick={() => setInviteModal(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Email Address *</label>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com"
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-white focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Role</label>
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Seat['role'])}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#2a3142] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-violet-500">
                    <option value="admin">Admin</option>
                    <option value="agent">Agent</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setInviteModal(false)} className="flex-1 px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
                  <button onClick={inviteSeat} disabled={!inviteEmail.trim()}
                    className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    Send Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Card Modal ── */}
        {addCardModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-violet-400" /> Add Payment Method</h3>
                <button onClick={() => setAddCardModal(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="bg-[#0d1117] border border-[#2a3142] rounded-lg p-6 flex flex-col items-center text-center gap-3 mb-4">
                <Shield className="w-10 h-10 text-violet-400" />
                <p className="text-sm text-gray-300 font-medium">Stripe Secure Payment</p>
                <p className="text-xs text-gray-500">In production, a Stripe Elements card form would appear here. Connect your Stripe publishable key to enable live card entry.</p>
                <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured
                </div>
              </div>
              <button onClick={() => setAddCardModal(false)} className="w-full px-4 py-2 border border-[#2a3142] rounded-lg text-sm text-gray-400 hover:text-white transition-colors">Close</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
