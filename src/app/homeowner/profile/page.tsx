'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, Phone, Building2, Bell, Save, CheckCircle, Camera, Lock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';


interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface NotifPrefs {
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  notify_booking_confirmed: boolean;
  notify_booking_cancelled: boolean;
  notify_payout_processed: boolean;
  notify_payout_failed: boolean;
  notify_maintenance_update: boolean;
  notify_document_ready: boolean;
  digest_frequency: string;
}

const TABS = [
  { key: 'profile', label: 'Profile Info', icon: User },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'security', label: 'Security', icon: Lock },
];

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-muted'}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function HomeownerProfilePage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'security'>('profile');
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '',
  });
  const [notifs, setNotifs] = useState<NotifPrefs>({
    email_enabled: true, sms_enabled: false, in_app_enabled: true,
    notify_booking_confirmed: true, notify_booking_cancelled: true,
    notify_payout_processed: true, notify_payout_failed: true,
    notify_maintenance_update: true, notify_document_ready: true,
    digest_frequency: 'realtime',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [profileResult, notifResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle(),
      ]);
      const profileData = profileResult.data;
      const notifData = notifResult.data;
      if (profileData) {
        setProfile({
          full_name: profileData.full_name || user?.user_metadata?.full_name || '',
          email: user?.email || '',
          phone: profileData.phone || '',
          address: profileData.address || '',
          city: profileData.city || '',
          state: profileData.state || '',
          zip: profileData.zip || '',
        });
      } else {
        setProfile(prev => ({ ...prev, full_name: user?.user_metadata?.full_name || '', email: user?.email || '' }));
      }
      if (notifData) {
        setNotifs(prev => ({ ...prev, ...notifData }));
      }
      setLoading(false);
    })();
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        full_name: profile.full_name,
        phone: profile.phone,
        address: profile.address,
        city: profile.city,
        state: profile.state,
        zip: profile.zip,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    setSaving(false);
    if (error) toast.error('Failed to save profile');
    else toast.success('Profile updated');
  }

  async function handleSaveNotifs() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...notifs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) toast.error('Failed to save preferences');
    else toast.success('Notification preferences saved');
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Password updated successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    }
  }

  const displayName = profile.full_name || user?.email?.split('@')[0] || 'Owner';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-5">
        <h1 className="text-xl font-bold text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Update your personal information, contact details, and notification preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 lg:gap-6 p-6 max-w-4xl">
        {/* Avatar + nav */}
        <div className="flex flex-col gap-4 lg:w-52 shrink-0">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-xl">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold">
                {initials}
              </div>
              <button className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted transition-all">
                <Camera size={11} className="text-muted-foreground" />
              </button>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex lg:flex-col gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left w-full ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <Icon size={15} className="shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5">

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <User size={14} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Personal Information</h2>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={profile.full_name}
                      onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                      placeholder="Your full name"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={profile.email}
                        disabled
                        className="w-full pl-8 pr-3 py-2 text-sm bg-muted border border-border rounded-lg text-muted-foreground cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Email changes require identity verification. Contact support.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+1 (555) 000-0000"
                        className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 size={13} className="text-primary" />
                    <h3 className="text-xs font-semibold text-foreground">Mailing Address</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-foreground mb-1.5">Street Address</label>
                      <input
                        type="text"
                        value={profile.address}
                        onChange={e => setProfile(p => ({ ...p, address: e.target.value }))}
                        placeholder="123 Main St"
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1.5">City</label>
                      <input
                        type="text"
                        value={profile.city}
                        onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                        placeholder="Denver"
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">State</label>
                        <input
                          type="text"
                          value={profile.state}
                          onChange={e => setProfile(p => ({ ...p, state: e.target.value }))}
                          placeholder="CO"
                          maxLength={2}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1.5">ZIP</label>
                        <input
                          type="text"
                          value={profile.zip}
                          onChange={e => setProfile(p => ({ ...p, zip: e.target.value }))}
                          placeholder="80202"
                          maxLength={10}
                          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                    Save Profile
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <Bell size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Delivery Channels</h2>
                </div>
                <div className="px-5 py-2">
                  <Toggle checked={notifs.in_app_enabled} onChange={v => setNotifs(p => ({ ...p, in_app_enabled: v }))} label="In-App Notifications" description="Bell icon alerts inside the portal" />
                  <Toggle checked={notifs.email_enabled} onChange={v => setNotifs(p => ({ ...p, email_enabled: v }))} label="Email Notifications" description="Alerts sent to your account email" />
                  <Toggle checked={notifs.sms_enabled} onChange={v => setNotifs(p => ({ ...p, sms_enabled: v }))} label="SMS Notifications" description="Text alerts to your registered phone" />
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <CheckCircle size={14} className="text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Alert Types</h2>
                </div>
                <div className="px-5 py-2">
                  <Toggle checked={notifs.notify_booking_confirmed} onChange={v => setNotifs(p => ({ ...p, notify_booking_confirmed: v }))} label="Booking Confirmed" />
                  <Toggle checked={notifs.notify_booking_cancelled} onChange={v => setNotifs(p => ({ ...p, notify_booking_cancelled: v }))} label="Booking Cancelled" />
                  <Toggle checked={notifs.notify_payout_processed} onChange={v => setNotifs(p => ({ ...p, notify_payout_processed: v }))} label="Payout Processed" />
                  <Toggle checked={notifs.notify_payout_failed} onChange={v => setNotifs(p => ({ ...p, notify_payout_failed: v }))} label="Payout Failed" />
                  <Toggle checked={notifs.notify_maintenance_update} onChange={v => setNotifs(p => ({ ...p, notify_maintenance_update: v }))} label="Maintenance Updates" />
                  <Toggle checked={notifs.notify_document_ready} onChange={v => setNotifs(p => ({ ...p, notify_document_ready: v }))} label="Documents Ready" />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotifs}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                  Save Preferences
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Lock size={14} className="text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Change Password</h2>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                  <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">Choose a strong password with at least 8 characters, including numbers and symbols.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleChangePassword}
                    disabled={pwSaving || !newPassword || !confirmPassword}
                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {pwSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={14} />}
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
