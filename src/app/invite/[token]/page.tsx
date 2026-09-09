'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Lock, User, Mail, ArrowRight } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

interface InviteData {
  id: string;
  invite_token: string;
  email: string;
  first_name: string;
  last_name: string;
  assigned_portfolios: string[];
  role: string;
  status: string;
  expires_at: string;
}

type PageState = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success';

export default function InviteSetupPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('Invalid invite link.');
      setPageState('invalid');
      return;
    }

    fetch(`/api/agent-invite/validate/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErrorMsg(data.error);
          setPageState('invalid');
        } else {
          setInvite(data.invite);
          setPageState('valid');
        }
      })
      .catch(() => {
        setErrorMsg('Unable to validate invite. Please try again.');
        setPageState('invalid');
      });
  }, [token]);

  const passwordStrength = (): { label: string; color: string; pct: number } => {
    if (password.length === 0) return { label: '', color: '', pct: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { label: 'Weak', color: 'bg-red-500', pct: 20 };
    if (score <= 2) return { label: 'Fair', color: 'bg-amber-500', pct: 45 };
    if (score <= 3) return { label: 'Good', color: 'bg-blue-500', pct: 70 };
    return { label: 'Strong', color: 'bg-emerald-500', pct: 100 };
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setPageState('submitting');

    try {
      // Complete account setup via API
      const res = await fetch('/api/agent-invite/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          firstName: invite?.first_name,
          lastName: invite?.last_name,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setFormError(data.error || 'Account setup failed. Please try again.');
        setPageState('valid');
        return;
      }

      // Sign in the newly created user
      const supabase = createClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: invite!.email,
        password,
      });

      if (signInErr) {
        setFormError('Account created! Please sign in at the login page.');
        setPageState('success');
        return;
      }

      setPageState('success');

      // Redirect agents to agent-workspace, others to main dashboard
      // OnboardingTourEngine will auto-launch because agent_onboarding_completed_at is null
      setTimeout(() => {
        router.push('/agent-workspace');
      }, 2000);
    } catch {
      setFormError('An unexpected error occurred. Please try again.');
      setPageState('valid');
    }
  }

  const strength = passwordStrength();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <AppLogo className="h-9" />
        </div>

        {/* Loading */}
        {pageState === 'loading' && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Validating your invite…</p>
          </div>
        )}

        {/* Invalid / Expired */}
        {pageState === 'invalid' && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-foreground mb-2">Invite Unavailable</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">{errorMsg}</p>
            <p className="text-xs text-muted-foreground">
              Contact your admin to request a new invite link.
            </p>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <h1 className="text-lg font-bold text-foreground mb-2">Account Created!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Welcome to TRAVLR Pro, {invite?.first_name}. You're being redirected to the platform now — your onboarding tour will start automatically.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Redirecting to dashboard…
            </div>
          </div>
        )}

        {/* Setup Form */}
        {(pageState === 'valid' || pageState === 'submitting') && invite && (
          <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-5 border-b border-border">
              <h1 className="text-xl font-bold text-foreground mb-1">Set Up Your Account</h1>
              <p className="text-sm text-muted-foreground">
                You've been invited to join TRAVLR Pro as an Agent.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Pre-filled info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <User size={11} className="text-muted-foreground" />
                    First Name
                  </label>
                  <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg text-foreground">
                    {invite.first_name}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Last Name</label>
                  <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg text-foreground">
                    {invite.last_name}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Mail size={11} className="text-muted-foreground" />
                  Email Address
                </label>
                <div className="px-3 py-2 text-sm bg-muted/50 border border-border rounded-lg text-foreground">
                  {invite.email}
                </div>
                <p className="text-[11px] text-muted-foreground">This is your login email — it cannot be changed here.</p>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Lock size={11} className="text-muted-foreground" />
                  Create Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    className="w-full px-3 py-2 pr-10 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${strength.color}`}
                        style={{ width: `${strength.pct}%` }}
                      />
                    </div>
                    <p className={`text-[11px] font-medium ${strength.pct >= 70 ? 'text-emerald-500' : strength.pct >= 45 ? 'text-amber-500' : 'text-red-500'}`}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    className="w-full px-3 py-2 pr-10 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-[11px] text-red-500">Passwords don't match.</p>
                )}
              </div>

              {/* Role info */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <User size={11} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Role: Agent</p>
                  <p className="text-[11px] text-muted-foreground">Homeowner Outreach &amp; Business Development</p>
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertCircle size={13} />
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={pageState === 'submitting'}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {pageState === 'submitting' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Creating Account…
                  </>
                ) : (
                  <>
                    Create Account & Start Tour
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <p className="text-[11px] text-center text-muted-foreground">
                After setup, you'll complete a mandatory platform orientation tour before accessing your dashboard.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
