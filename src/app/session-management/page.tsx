'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Shield, Monitor, Smartphone, Globe, MapPin, Clock, LogOut, Key, CheckCircle, AlertTriangle, RefreshCw, Copy, Eye, EyeOff, Lock, Unlock, Wifi, Activity } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type DeviceType = 'desktop' | 'mobile' | 'tablet';
type SessionStatus = 'active' | 'expired' | 'revoked';

interface Session {
  id: string;
  deviceType: DeviceType;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  country: string;
  status: SessionStatus;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

interface LoginHistoryItem {
  id: string;
  deviceType: DeviceType;
  deviceName: string;
  browser: string;
  ipAddress: string;
  location: string;
  timestamp: string;
  success: boolean;
  failureReason?: string;
}

interface RecoveryCode {
  code: string;
  used: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockSessions: Session[] = [
  { id: 'sess-1', deviceType: 'desktop', deviceName: 'MacBook Pro 16"', browser: 'Chrome 127', os: 'macOS 14.5', ipAddress: '192.168.1.105', location: 'Austin, TX', country: 'US', status: 'active', lastActive: 'Now', createdAt: '2 hours ago', isCurrent: true },
  { id: 'sess-2', deviceType: 'mobile', deviceName: 'iPhone 15 Pro', browser: 'Safari 17', os: 'iOS 17.5', ipAddress: '172.16.0.42', location: 'Austin, TX', country: 'US', status: 'active', lastActive: '3 hours ago', createdAt: '1 day ago', isCurrent: false },
  { id: 'sess-3', deviceType: 'desktop', deviceName: 'Windows PC', browser: 'Edge 126', os: 'Windows 11', ipAddress: '10.0.0.88', location: 'Denver, CO', country: 'US', status: 'active', lastActive: '2 days ago', createdAt: '5 days ago', isCurrent: false },
  { id: 'sess-4', deviceType: 'tablet', deviceName: 'iPad Air', browser: 'Safari 17', os: 'iPadOS 17.4', ipAddress: '203.0.113.45', location: 'Miami, FL', country: 'US', status: 'expired', lastActive: '8 days ago', createdAt: '10 days ago', isCurrent: false },
  { id: 'sess-5', deviceType: 'desktop', deviceName: 'Linux Workstation', browser: 'Firefox 128', os: 'Ubuntu 24.04', ipAddress: '198.51.100.22', location: 'Chicago, IL', country: 'US', status: 'revoked', lastActive: '12 days ago', createdAt: '14 days ago', isCurrent: false },
];

const mockLoginHistory: LoginHistoryItem[] = [
  { id: 'lh-1', deviceType: 'desktop', deviceName: 'MacBook Pro 16"', browser: 'Chrome 127', ipAddress: '192.168.1.105', location: 'Austin, TX', timestamp: 'Today, 9:14 AM', success: true },
  { id: 'lh-2', deviceType: 'mobile', deviceName: 'iPhone 15 Pro', browser: 'Safari 17', ipAddress: '172.16.0.42', location: 'Austin, TX', timestamp: 'Yesterday, 7:32 PM', success: true },
  { id: 'lh-3', deviceType: 'desktop', deviceName: 'Unknown Device', browser: 'Chrome 126', ipAddress: '185.220.101.33', location: 'Frankfurt, DE', timestamp: 'Aug 16, 3:47 AM', success: false, failureReason: 'Invalid password' },
  { id: 'lh-4', deviceType: 'desktop', deviceName: 'Windows PC', browser: 'Edge 126', ipAddress: '10.0.0.88', location: 'Denver, CO', timestamp: 'Aug 15, 11:20 AM', success: true },
  { id: 'lh-5', deviceType: 'desktop', deviceName: 'Unknown Device', browser: 'Firefox 127', ipAddress: '91.108.4.0', location: 'Moscow, RU', timestamp: 'Aug 14, 2:15 AM', success: false, failureReason: '2FA code incorrect' },
  { id: 'lh-6', deviceType: 'tablet', deviceName: 'iPad Air', browser: 'Safari 17', ipAddress: '203.0.113.45', location: 'Miami, FL', timestamp: 'Aug 12, 4:55 PM', success: true },
];

const mockRecoveryCodes: RecoveryCode[] = [
  { code: 'TRVL-A4K2-9XMN', used: false },
  { code: 'TRVL-B7P1-3QWE', used: false },
  { code: 'TRVL-C9R5-8ZVB', used: true },
  { code: 'TRVL-D2S6-1YHJ', used: false },
  { code: 'TRVL-E8T3-5ULC', used: false },
  { code: 'TRVL-F1U7-4NKD', used: false },
  { code: 'TRVL-G6V4-7MPF', used: false },
  { code: 'TRVL-H3W9-2OQG', used: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const deviceIcons: Record<DeviceType, React.ElementType> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Smartphone,
};

const sessionStatusConfig: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Active', color: 'text-green-700', bg: 'bg-green-50' },
  expired: { label: 'Expired', color: 'text-slate-500', bg: 'bg-slate-100' },
  revoked: { label: 'Revoked', color: 'text-red-600', bg: 'bg-red-50' },
};

// ─── Active Sessions Tab ──────────────────────────────────────────────────────

function ActiveSessionsTab() {
  const [sessions, setSessions] = useState(mockSessions);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeAllConfirm, setRevokeAllConfirm] = useState(false);

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    await new Promise(r => setTimeout(r, 800));
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'revoked' as SessionStatus } : s));
    setRevoking(null);
  };

  const handleRevokeAll = async () => {
    setRevokeAllConfirm(false);
    for (const s of sessions.filter(s => !s.isCurrent && s.status === 'active')) {
      await new Promise(r => setTimeout(r, 200));
      setSessions(prev => prev.map(sess => sess.id === s.id ? { ...sess, status: 'revoked' as SessionStatus } : sess));
    }
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const otherActiveSessions = activeSessions.filter(s => !s.isCurrent);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Sessions', value: activeSessions.length, color: 'text-green-600', bg: 'bg-green-50', icon: Wifi },
          { label: 'Other Devices', value: otherActiveSessions.length, color: 'text-blue-600', bg: 'bg-blue-50', icon: Monitor },
          { label: 'Revoked', value: sessions.filter(s => s.status === 'revoked').length, color: 'text-red-600', bg: 'bg-red-50', icon: Lock },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.bg}`}><s.icon size={18} className={s.color} /></div>
            <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-2xl font-bold text-slate-900">{s.value}</p></div>
          </div>
        ))}
      </div>

      {/* Revoke All Banner */}
      {otherActiveSessions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">{otherActiveSessions.length} other active session{otherActiveSessions.length !== 1 ? 's' : ''} detected. Revoke all if you don't recognize them.</p>
          </div>
          {!revokeAllConfirm ? (
            <button onClick={() => setRevokeAllConfirm(true)} className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 whitespace-nowrap">Revoke All Others</button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 font-medium">Confirm?</span>
              <button onClick={handleRevokeAll} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Yes, Revoke</button>
              <button onClick={() => setRevokeAllConfirm(false)} className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100">Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.map(session => {
          const DeviceIcon = deviceIcons[session.deviceType];
          const sc = sessionStatusConfig[session.status];
          return (
            <div key={session.id} className={`bg-white rounded-xl border p-4 ${session.isCurrent ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200'}`}>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${session.status === 'active' ? 'bg-blue-50' : 'bg-slate-100'}`}>
                  <DeviceIcon size={20} className={session.status === 'active' ? 'text-blue-600' : 'text-slate-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{session.deviceName}</p>
                    {session.isCurrent && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Current Session</span>}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Globe size={11} />{session.browser} · {session.os}</span>
                    <span className="flex items-center gap-1"><MapPin size={11} />{session.location}</span>
                    <span className="flex items-center gap-1"><Activity size={11} />IP: {session.ipAddress}</span>
                    <span className="flex items-center gap-1"><Clock size={11} />Last active: {session.lastActive}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Session started: {session.createdAt}</p>
                </div>
                {!session.isCurrent && session.status === 'active' && (
                  <button onClick={() => handleRevoke(session.id)} disabled={revoking === session.id} className="shrink-0 text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1 disabled:opacity-50">
                    {revoking === session.id ? <RefreshCw size={11} className="animate-spin" /> : <LogOut size={11} />}
                    Revoke
                  </button>
                )}
                {session.status === 'revoked' && <span className="shrink-0 text-xs text-slate-400 flex items-center gap-1"><Lock size={11} />Revoked</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Login History Tab ────────────────────────────────────────────────────────

function LoginHistoryTab() {
  const suspiciousCount = mockLoginHistory.filter(h => !h.success).length;

  return (
    <div className="space-y-4">
      {suspiciousCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">{suspiciousCount} failed login attempt{suspiciousCount !== 1 ? 's' : ''} detected</p>
            <p className="text-xs text-red-600 mt-0.5">Review the entries below. If you don't recognize these attempts, consider changing your password and enabling 2FA.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Login History</h3>
          <p className="text-xs text-slate-500 mt-0.5">Last 30 days of login activity across all devices</p>
        </div>
        <div className="divide-y divide-slate-100">
          {mockLoginHistory.map(item => {
            const DeviceIcon = deviceIcons[item.deviceType];
            return (
              <div key={item.id} className={`flex items-start gap-4 px-5 py-4 ${!item.success ? 'bg-red-50/40' : ''}`}>
                <div className={`p-2.5 rounded-lg shrink-0 ${item.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <DeviceIcon size={16} className={item.success ? 'text-green-600' : 'text-red-600'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-800">{item.deviceName}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {item.success ? '✓ Success' : '✗ Failed'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Globe size={11} />{item.browser}</span>
                    <span className="flex items-center gap-1"><MapPin size={11} />{item.location}</span>
                    <span className="flex items-center gap-1"><Activity size={11} />IP: {item.ipAddress}</span>
                  </div>
                  {item.failureReason && <p className="text-xs text-red-600 mt-1 font-medium">Reason: {item.failureReason}</p>}
                </div>
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{item.timestamp}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── 2FA Setup Tab ────────────────────────────────────────────────────────────

function TwoFactorTab() {
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [setupStep, setSetupStep] = useState<'idle' | 'scan' | 'verify' | 'codes' | 'done'>('idle');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [codes] = useState<RecoveryCode[]>(mockRecoveryCodes);
  const [disableConfirm, setDisableConfirm] = useState(false);

  const qrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=otpauth://totp/TRAVLR:admin@travlr.com?secret=JBSWY3DPEHPK3PXP&issuer=TRAVLR';

  const handleVerify = async () => {
    if (verifyCode.length !== 6) { setVerifyError('Enter a 6-digit code'); return; }
    setVerifying(true);
    await new Promise(r => setTimeout(r, 1000));
    if (verifyCode === '123456' || verifyCode.length === 6) {
      setSetupStep('codes');
      setVerifyError('');
    } else {
      setVerifyError('Invalid code. Please try again.');
    }
    setVerifying(false);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyAllCodes = () => {
    const allCodes = codes.filter(c => !c.used).map(c => c.code).join('\n');
    navigator.clipboard.writeText(allCodes).catch(() => {});
    setCopiedCode('all');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleFinish = () => {
    setTwoFAEnabled(true);
    setSetupStep('done');
  };

  const handleDisable = async () => {
    setDisableConfirm(false);
    await new Promise(r => setTimeout(r, 500));
    setTwoFAEnabled(false);
    setSetupStep('idle');
    setVerifyCode('');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Status Card */}
      <div className={`rounded-xl border p-5 ${twoFAEnabled ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${twoFAEnabled ? 'bg-green-100' : 'bg-slate-200'}`}>
              {twoFAEnabled ? <Shield size={22} className="text-green-600" /> : <Unlock size={22} className="text-slate-500" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Two-Factor Authentication</p>
              <p className={`text-xs mt-0.5 ${twoFAEnabled ? 'text-green-700' : 'text-slate-500'}`}>
                {twoFAEnabled ? '✓ Enabled — Your account is protected with 2FA' : 'Not enabled — Add an extra layer of security'}
              </p>
            </div>
          </div>
          {twoFAEnabled ? (
            !disableConfirm ? (
              <button onClick={() => setDisableConfirm(true)} className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50">Disable 2FA</button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700 font-medium">Confirm disable?</span>
                <button onClick={handleDisable} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Yes, Disable</button>
                <button onClick={() => setDisableConfirm(false)} className="text-xs px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg">Cancel</button>
              </div>
            )
          ) : (
            setupStep === 'idle' && (
              <button onClick={() => setSetupStep('scan')} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
                <Shield size={12} />
                Enable 2FA
              </button>
            )
          )}
        </div>
      </div>

      {/* Setup Flow */}
      {setupStep === 'scan' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</div>
            <h3 className="text-sm font-semibold text-slate-800">Scan QR Code with Authenticator App</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Use Google Authenticator, Authy, or any TOTP-compatible app to scan this code.</p>
          <div className="flex items-start gap-6">
            <div className="bg-white border-2 border-slate-200 rounded-xl p-3 shrink-0">
              <img src={qrCodeUrl} alt="2FA QR Code" width={160} height={160} className="rounded" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-600 mb-2">Or enter this key manually:</p>
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <code className="text-xs font-mono text-slate-700 flex-1 break-all">JBSWY3DPEHPK3PXP</code>
                <button onClick={() => handleCopyCode('JBSWY3DPEHPK3PXP')} className="text-slate-400 hover:text-slate-600 shrink-0">
                  {copiedCode === 'JBSWY3DPEHPK3PXP' ? <CheckCircle size={13} className="text-green-500" /> : <Copy size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Account: admin@travlr.com · Issuer: TRAVLR</p>
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={() => setSetupStep('verify')} className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Continue →</button>
          </div>
        </div>
      )}

      {setupStep === 'verify' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</div>
            <h3 className="text-sm font-semibold text-slate-800">Verify Your Authenticator Code</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Enter the 6-digit code from your authenticator app to confirm setup.</p>
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={e => { setVerifyCode(e.target.value.replace(/\D/g, '')); setVerifyError(''); }}
              className="w-36 text-center text-2xl font-mono tracking-widest border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleVerify} disabled={verifyCode.length !== 6 || verifying} className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium">
              {verifying ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
          </div>
          {verifyError && <p className="text-xs text-red-600 mt-2">{verifyError}</p>}
          <p className="text-[10px] text-slate-400 mt-3">For demo purposes, any 6-digit code will work.</p>
        </div>
      )}

      {setupStep === 'codes' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</div>
            <h3 className="text-sm font-semibold text-slate-800">Save Your Recovery Codes</h3>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">Save these codes in a safe place. Each code can only be used once. If you lose access to your authenticator app, you'll need these to sign in.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {codes.map(c => (
              <div key={c.code} className={`flex items-center justify-between px-3 py-2 rounded-lg border font-mono text-xs ${c.used ? 'bg-slate-50 border-slate-200 text-slate-400 line-through' : 'bg-white border-slate-200 text-slate-800'}`}>
                <span>{c.code}</span>
                {!c.used && (
                  <button onClick={() => handleCopyCode(c.code)} className="text-slate-400 hover:text-slate-600 ml-2">
                    {copiedCode === c.code ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-between">
            <button onClick={handleCopyAllCodes} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              {copiedCode === 'all' ? <CheckCircle size={12} className="text-green-500" /> : <Copy size={12} />}
              {copiedCode === 'all' ? 'Copied!' : 'Copy All Codes'}
            </button>
            <button onClick={handleFinish} className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2">
              <CheckCircle size={14} />
              I've Saved My Codes — Finish Setup
            </button>
          </div>
        </div>
      )}

      {(setupStep === 'done' || twoFAEnabled) && setupStep !== 'idle' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800">2FA Successfully Enabled!</p>
            <p className="text-xs text-green-600 mt-0.5">Your account is now protected. You'll be asked for a code on each new login.</p>
          </div>
        </div>
      )}

      {/* Recovery Codes Section (when 2FA is enabled) */}
      {twoFAEnabled && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Recovery Codes</h3>
              <p className="text-xs text-slate-500 mt-0.5">{codes.filter(c => !c.used).length} of {codes.length} codes remaining</p>
            </div>
            <button onClick={() => setShowCodes(!showCodes)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
              {showCodes ? <EyeOff size={12} /> : <Eye size={12} />}
              {showCodes ? 'Hide Codes' : 'View Codes'}
            </button>
          </div>
          {showCodes && (
            <div className="grid grid-cols-2 gap-2">
              {codes.map(c => (
                <div key={c.code} className={`flex items-center justify-between px-3 py-2 rounded-lg border font-mono text-xs ${c.used ? 'bg-slate-50 border-slate-200 text-slate-400 line-through' : 'bg-white border-slate-200 text-slate-800'}`}>
                  <span>{c.code}</span>
                  {c.used && <span className="text-[9px] text-slate-400 ml-2 no-underline not-italic font-sans">Used</span>}
                  {!c.used && (
                    <button onClick={() => handleCopyCode(c.code)} className="text-slate-400 hover:text-slate-600 ml-2">
                      {copiedCode === c.code ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { icon: Shield, title: 'What is 2FA?', desc: 'Two-factor authentication adds a second verification step when you sign in, protecting your account even if your password is compromised.', color: 'text-blue-600', bg: 'bg-blue-50' },
          { icon: Key, title: 'Recovery Codes', desc: 'Use recovery codes if you lose access to your authenticator app. Each code is single-use. Store them securely offline.', color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(card => (
          <div key={card.title} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${card.bg} shrink-0`}><card.icon size={16} className={card.color} /></div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{card.title}</p>
              <p className="text-xs text-slate-500 mt-1">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SessionManagementPage() {
  const [activeTab, setActiveTab] = useState<'sessions' | 'history' | '2fa'>('sessions');

  const tabs = [
    { key: 'sessions', label: 'Active Sessions', icon: Monitor },
    { key: 'history', label: 'Login History', icon: Clock },
    { key: '2fa', label: '2FA & Recovery', icon: Shield },
  ] as const;

  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Session Management</h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage active login sessions, review device history, and configure two-factor authentication</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Shield size={13} className="text-blue-500" />
              <span>Account Security</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'sessions' && <ActiveSessionsTab />}
          {activeTab === 'history' && <LoginHistoryTab />}
          {activeTab === '2fa' && <TwoFactorTab />}
        </div>
      </div>
    </AppLayout>
  );
}
