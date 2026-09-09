'use client';

import React, { useState } from 'react';
import { CreditCard, Building2, Bell, Calendar, CheckCircle, AlertCircle, Lock, Shield, Clock, DollarSign, Mail, Smartphone, Wrench, Info, Zap } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


type PaymentSchedule = 'monthly' | 'biweekly' | 'weekly';

interface NotificationPrefs {
  bookingConfirmed: boolean;
  bookingCancelled: boolean;
  newBookingRequest: boolean;
  payoutProcessed: boolean;
  payoutFailed: boolean;
  payoutScheduleReminder: boolean;
  maintenanceSubmitted: boolean;
  maintenanceStatusUpdate: boolean;
  maintenanceCompleted: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
}

const SECTION_TABS = [
  { key: 'payout', label: 'Payout Method', icon: CreditCard },
  { key: 'schedule', label: 'Payment Schedule', icon: Calendar },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

export default function HomeownerSettingsPage() {
  const [activeSection, setActiveSection] = useState<'payout' | 'schedule' | 'notifications'>('payout');
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentSchedule>('monthly');
  const [stripeConnected] = useState(false);
  const [bankLinked] = useState(false);
  const [notifs, setNotifs] = useState<NotificationPrefs>({
    bookingConfirmed: true,
    bookingCancelled: true,
    newBookingRequest: true,
    payoutProcessed: true,
    payoutFailed: true,
    payoutScheduleReminder: false,
    maintenanceSubmitted: false,
    maintenanceStatusUpdate: true,
    maintenanceCompleted: true,
    emailEnabled: true,
    smsEnabled: false,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  function toggleNotif(key: keyof NotificationPrefs) {
    setNotifs(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-5">
        <h1 className="text-xl font-bold text-foreground">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your payout method, payment schedule, and notification preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 p-6 max-w-5xl">
        {/* Sidebar nav */}
        <nav className="flex lg:flex-col gap-1 mb-4 lg:mb-0 lg:w-52 shrink-0">
          {SECTION_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key as typeof activeSection)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left w-full ${
                  isActive
                    ? 'bg-primary/10 text-primary' :'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 space-y-5">

          {/* ── PAYOUT METHOD ── */}
          {activeSection === 'payout' && (
            <div className="space-y-5">
              {/* Stripe Connect Card */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Stripe Connect</h2>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning-border">
                    Not Connected
                  </span>
                </div>
                <div className="px-5 py-5">
                  {/* Placeholder banner */}
                  <div className="flex items-start gap-3 p-4 bg-muted/60 border border-border rounded-lg mb-5">
                    <Info size={15} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Stripe Connect is being configured</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Once activated, you'll be able to connect your Stripe account to receive payouts directly to your bank. This section is ready to activate — no changes needed on your end.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    {[
                      { icon: Shield, label: 'Bank-grade security', desc: 'Encrypted via Stripe' },
                      { icon: Clock, label: 'Fast settlements', desc: '2–3 business days' },
                      { icon: DollarSign, label: 'Automatic payouts', desc: 'Per your schedule' },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="flex items-start gap-2.5 p-3 bg-muted/40 rounded-lg">
                        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon size={13} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-foreground">{label}</p>
                          <p className="text-[11px] text-muted-foreground">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/20 text-primary/60 rounded-lg text-sm font-medium cursor-not-allowed border border-primary/20"
                  >
                    <Lock size={14} />
                    Connect Stripe Account — Coming Soon
                  </button>
                  <p className="text-center text-[11px] text-muted-foreground mt-2">
                    You'll receive an email when Stripe Connect is ready to activate.
                  </p>
                </div>
              </div>

              {/* Bank Account Linking */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Bank Account</h2>
                  </div>
                  {bankLinked ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-bg text-success border border-success-border flex items-center gap-1">
                      <CheckCircle size={10} />
                      Linked
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      Not Linked
                    </span>
                  )}
                </div>
                <div className="px-5 py-5">
                  {bankLinked ? (
                    <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Chase Bank ••••4821</p>
                          <p className="text-xs text-muted-foreground">Checking · Verified</p>
                        </div>
                      </div>
                      <button className="text-xs text-danger hover:underline">Remove</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Link your bank account to receive payouts. Your account details are securely handled via Stripe.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">Account Holder Name</label>
                          <input
                            type="text"
                            placeholder="Full legal name"
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">Routing Number</label>
                          <input
                            type="text"
                            placeholder="9-digit routing number"
                            maxLength={9}
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">Account Number</label>
                          <input
                            type="text"
                            placeholder="Account number"
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1.5">Account Type</label>
                          <select className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Lock size={11} />
                        <span>Your banking details are encrypted and never stored on our servers.</span>
                      </div>
                      <button
                        disabled
                        className="flex items-center gap-2 px-4 py-2 bg-primary/20 text-primary/60 rounded-lg text-sm font-medium cursor-not-allowed border border-primary/20"
                      >
                        <Lock size={13} />
                        Link Bank Account — Requires Stripe Connect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── PAYMENT SCHEDULE ── */}
          {activeSection === 'schedule' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Calendar size={15} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Payment Schedule Preferences</h2>
              </div>
              <div className="px-5 py-5 space-y-5">
                <p className="text-sm text-muted-foreground">
                  Choose how often you'd like to receive your net payout. Payouts are processed automatically based on your selection.
                </p>

                <div className="space-y-3">
                  {([
                    {
                      value: 'monthly' as PaymentSchedule,
                      label: 'Monthly',
                      desc: 'Receive one consolidated payout on the 1st of each month for the prior month\'s revenue.',
                      badge: 'Most Popular',
                    },
                    {
                      value: 'biweekly' as PaymentSchedule,
                      label: 'Bi-Weekly',
                      desc: 'Receive payouts every two weeks — on the 1st and 15th of each month.',
                      badge: null,
                    },
                    {
                      value: 'weekly' as PaymentSchedule,
                      label: 'Weekly',
                      desc: 'Receive a payout every Monday for the prior week\'s settled revenue.',
                      badge: null,
                    },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPaymentSchedule(opt.value)}
                      className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        paymentSchedule === opt.value
                          ? 'border-primary bg-primary/5' :'border-border hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        paymentSchedule === opt.value ? 'border-primary' : 'border-muted-foreground'
                      }`}>
                        {paymentSchedule === opt.value && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                          {opt.badge && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <AlertCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Schedule changes take effect on the next payout cycle. Stripe Connect must be active to process payouts.
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
                  >
                    {saveSuccess ? <CheckCircle size={14} /> : null}
                    {saveSuccess ? 'Saved!' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeSection === 'notifications' && (
            <div className="space-y-5">
              {/* Delivery channels */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Bell size={15} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Delivery Channels</h2>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {[
                    { key: 'emailEnabled' as keyof NotificationPrefs, icon: Mail, label: 'Email Notifications', desc: 'Receive alerts to your registered email address' },
                    { key: 'smsEnabled' as keyof NotificationPrefs, icon: Smartphone, label: 'SMS Notifications', desc: 'Receive text messages for urgent alerts' },
                  ].map(({ key, icon: Icon, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <Icon size={14} className="text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                      </div>
                      <Toggle checked={notifs[key] as boolean} onChange={() => toggleNotif(key)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Booking notifications */}
              <NotifGroup
                title="Bookings"
                icon={Calendar}
                items={[
                  { key: 'bookingConfirmed', label: 'Booking Confirmed', desc: 'When a new booking is confirmed for your property' },
                  { key: 'bookingCancelled', label: 'Booking Cancelled', desc: 'When a guest cancels a reservation' },
                  { key: 'newBookingRequest', label: 'New Booking Request', desc: 'When a new inquiry or request comes in' },
                ]}
                notifs={notifs}
                onToggle={toggleNotif}
              />

              {/* Payout notifications */}
              <NotifGroup
                title="Payouts"
                icon={DollarSign}
                items={[
                  { key: 'payoutProcessed', label: 'Payout Processed', desc: 'When a payout is successfully sent to your bank' },
                  { key: 'payoutFailed', label: 'Payout Failed', desc: 'When a payout attempt fails and needs attention' },
                  { key: 'payoutScheduleReminder', label: 'Upcoming Payout Reminder', desc: '24 hours before your scheduled payout date' },
                ]}
                notifs={notifs}
                onToggle={toggleNotif}
              />

              {/* Maintenance notifications */}
              <NotifGroup
                title="Maintenance"
                icon={Wrench}
                items={[
                  { key: 'maintenanceSubmitted', label: 'Request Submitted', desc: 'When a maintenance request is created for your property' },
                  { key: 'maintenanceStatusUpdate', label: 'Status Update', desc: 'When a maintenance request status changes' },
                  { key: 'maintenanceCompleted', label: 'Request Completed', desc: 'When maintenance work is marked as completed' },
                ]}
                notifs={notifs}
                onToggle={toggleNotif}
              />

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
                >
                  {saveSuccess ? <CheckCircle size={14} /> : null}
                  {saveSuccess ? 'Saved!' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

interface NotifGroupProps {
  title: string;
  icon: React.ElementType;
  items: { key: string; label: string; desc: string }[];
  notifs: NotificationPrefs;
  onToggle: (key: keyof NotificationPrefs) => void;
}

function NotifGroup({ title, icon: Icon, items, notifs, onToggle }: NotifGroupProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon size={15} className="text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-2 divide-y divide-border">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between py-3">
            <div className="min-w-0 flex-1 pr-4">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Toggle
              checked={notifs[key as keyof NotificationPrefs] as boolean}
              onChange={() => onToggle(key as keyof NotificationPrefs)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
