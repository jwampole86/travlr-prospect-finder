'use client';

import React, { useState } from 'react';

const LOGO_URL = 'https://app.staytrvlr.com/assets/images/app_logo.png';
const PRIMARY = '#1a5276';
const SECONDARY = '#2e86c1';

const baseWrapper = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TRAVLR Vacation Homes</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${PRIMARY};padding:32px 40px;text-align:center;">
              <img src="${LOGO_URL}" alt="TRAVLR Vacation Homes" width="140" style="display:block;margin:0 auto 12px auto;max-width:140px;" />
              <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;">Vacation Home Management</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px 40px;">
${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f6f9;padding:24px 40px;text-align:center;border-top:1px solid #dde3ec;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#64748b;">TRAVLR Vacation Homes &bull; <a href="https://app.staytrvlr.com" style="color:${SECONDARY};text-decoration:none;">app.staytrvlr.com</a></p>
              <p style="margin:0;font-size:12px;color:#94a3b8;">You received this email because you have an account with TRAVLR. If you did not request this, you can safely ignore it.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const templates = [
  {
    id: 'confirm-signup',
    name: 'Confirm Signup',
    subject: 'Confirm your TRAVLR account',
    description: 'Sent after a user registers — asks them to verify their email address.',
    supabaseKey: 'Confirm signup',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">Confirm your email address</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">Welcome to <strong>TRAVLR Vacation Homes</strong>! We're excited to have you on board.</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">Please confirm your email address by clicking the button below. This link will expire in 24 hours.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Confirm Email Address</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>`,
  },
  {
    id: 'invite-user',name: 'Invite User',subject: "You\'ve been invited to TRAVLR",description: 'Sent when you invite someone from the Users tab to create an account.',supabaseKey: 'Invite user',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">You've been invited to TRAVLR</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">You've been invited to join <strong>TRAVLR Vacation Homes</strong> — a platform for managing vacation rental properties and homeowner relationships.</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">Click the button below to accept your invitation and set up your account. This link will expire in 24 hours.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Accept Invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>`,
  },
  {
    id: 'magic-link',name: 'Magic Link / OTP',subject: 'Your TRAVLR sign-in link',description: 'Sends a one-time sign-in link or one-time password for passwordless login.',supabaseKey: 'Magic Link',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">Sign in to TRAVLR</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">Here is your one-time sign-in link for <strong>TRAVLR Vacation Homes</strong>. This link is valid for 10 minutes and can only be used once.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Sign In to TRAVLR</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not request this sign-in link, you can safely ignore this email. Your account remains secure.</p>`,
  },
  {
    id: 'change-email',name: 'Change Email Address',subject: 'Confirm your new email address — TRAVLR',description: 'Asks users to verify their new email address after changing it in settings.',supabaseKey: 'Change Email Address',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">Confirm your new email address</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">You recently requested to change the email address associated with your <strong>TRAVLR Vacation Homes</strong> account.</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">Click the button below to confirm this change. If you did not make this request, please contact support immediately.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Confirm New Email</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>`,
  },
  {
    id: 'reset-password',name: 'Reset Password',subject: 'Reset your TRAVLR password',description: 'Sends a password reset link or code when a user requests it.',supabaseKey: 'Reset Password',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">Reset your password</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">We received a request to reset the password for your <strong>TRAVLR Vacation Homes</strong> account.</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">Click the button below to choose a new password. This link will expire in 1 hour.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>`,
  },
  {
    id: 'reauthentication',name: 'Reauthentication',subject: 'Verify your identity — TRAVLR',description: 'Asks users to verify their identity before a sensitive operation.',supabaseKey: 'Reauthentication',
    body: `              <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#0d1b2a;">Verify your identity</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#374151;">A sensitive action was requested on your <strong>TRAVLR Vacation Homes</strong> account and we need to verify it's really you.</p>
              <p style="margin:0 0 28px 0;font-size:15px;line-height:1.6;color:#374151;">Click the button below to confirm your identity and proceed. This link will expire shortly.</p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
                <tr>
                  <td style="background-color:#1a5276;border-radius:8px;padding:14px 32px;">
                    <a href="{{ .ConfirmationURL }}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Verify My Identity</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;">Or copy and paste this link into your browser:<br /><a href="{{ .ConfirmationURL }}" style="color:#2e86c1;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">If you did not initiate this action, please contact support immediately as your account may be at risk.</p>`,
  },
];

export default function SupabaseEmailTemplatesPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'html' | 'preview'>('html');
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0].id);

  const selected = templates.find(t => t.id === selectedTemplate)!;
  const fullHtml = baseWrapper(selected.body);

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Supabase Email Templates</h1>
          <p className="text-muted-foreground text-sm">
            Copy each template's HTML and paste it into{' '}
            <strong>Supabase Dashboard → Authentication → Email Templates</strong>.
            All templates include the TRAVLR logo and branded styling.
          </p>
        </div>

        {/* Instructions Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3">
          <div className="text-blue-600 mt-0.5">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">How to apply these templates</p>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>Go to your <strong>Supabase Dashboard</strong></li>
              <li>Navigate to <strong>Authentication → Configuration → Emails → Templates</strong></li>
              <li>Select the matching template tab (e.g. "Confirm signup")</li>
              <li>Copy the HTML below and paste it into the <strong>Message body</strong> field</li>
              <li>Update the <strong>Subject</strong> field with the subject shown below</li>
              <li>Click <strong>Save</strong></li>
            </ol>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Template List */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</p>
              </div>
              <div className="divide-y divide-border">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedTemplate === t.id
                        ? 'bg-primary/10 border-l-2 border-l-primary' :'hover:bg-muted'
                    }`}
                  >
                    <p className={`text-sm font-medium ${selectedTemplate === t.id ? 'text-primary' : 'text-foreground'}`}>
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Template Detail */}
          <div className="lg:col-span-3">
            <div className="bg-card border border-border rounded-lg overflow-hidden">

              {/* Template Header */}
              <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{selected.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">Supabase tab:</span>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground">{selected.supabaseKey}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(selected.id + '-html', fullHtml)}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: copiedId === selected.id + '-html' ? '#16a34a' : PRIMARY,
                    color: '#ffffff',
                  }}
                >
                  {copiedId === selected.id + '-html' ? (
                    <>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy HTML
                    </>
                  )}
                </button>
              </div>

              {/* Subject Line */}
              <div className="px-6 py-3 bg-muted/40 border-b border-border flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Subject</span>
                <span className="text-sm text-foreground font-medium flex-1">{selected.subject}</span>
                <button
                  onClick={() => handleCopy(selected.id + '-subject', selected.subject)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {copiedId === selected.id + '-subject' ? (
                    <span className="text-green-600">Copied!</span>
                  ) : (
                    <>
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveTab('html')}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'html' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  HTML Code
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'preview' ?'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Preview
                </button>
              </div>

              {/* Content */}
              {activeTab === 'html' ? (
                <div className="relative">
                  <pre className="p-6 text-xs font-mono text-foreground bg-muted/20 overflow-auto max-h-[500px] whitespace-pre-wrap break-all leading-relaxed">
                    {fullHtml}
                  </pre>
                </div>
              ) : (
                <div className="p-4 bg-gray-100">
                  <iframe
                    srcDoc={fullHtml}
                    title={`Preview: ${selected.name}`}
                    className="w-full rounded border border-border bg-white"
                    style={{ height: '500px' }}
                    sandbox="allow-same-origin"
                  />
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Quick Reference */}
        <div className="mt-6 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">All 6 Templates — Quick Reference</h3>
          </div>
          <div className="divide-y divide-border">
            {templates.map(t => (
              <div key={t.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground hidden sm:block">{t.supabaseKey}</span>
                  <button
                    onClick={() => {
                      setSelectedTemplate(t.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    View →
                  </button>
                  <button
                    onClick={() => handleCopy(t.id + '-quick', baseWrapper(t.body))}
                    className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted transition-colors text-foreground"
                  >
                    {copiedId === t.id + '-quick' ? '✓ Copied' : 'Copy HTML'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
