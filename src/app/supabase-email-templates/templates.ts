export interface AuthEmailTemplate {
  id: string;
  name: string;
  subject: string;
  description: string;
  supabaseKey: string;
  body: string;
}

const LOGO_URL = 'https://app.staytrvlr.com/assets/images/app_logo.png';
const PRIMARY = '#1a5276';
const SECONDARY = '#2e86c1';

export const buildEmailHtml = (content: string) => `<!DOCTYPE html>
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
          <tr>
            <td style="background-color:${PRIMARY};padding:32px 40px;text-align:center;">
              <img src="${LOGO_URL}" alt="TRAVLR Vacation Homes" width="140" style="display:block;margin:0 auto 12px auto;max-width:140px;" />
              <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;">Vacation Home Management</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 32px 40px;">
${content}
            </td>
          </tr>
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

export const AUTH_EMAIL_TEMPLATES: AuthEmailTemplate[] = [
  {
    id: 'confirm-signup',
    name: 'Confirm signup',
    subject: 'Confirm your TRAVLR account',
    description: 'Sent after a user registers so they can verify their email address.',
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
    id: 'invite-user',
    name: 'Invite user',
    subject: "You've been invited to TRAVLR",
    description: 'Sent when an admin invites a teammate to create an account.',
    supabaseKey: 'Invite user',
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
    id: 'magic-link',
    name: 'Magic link / OTP',
    subject: 'Your TRAVLR sign-in link',
    description: 'Used for passwordless sign-in and one-time login links.',
    supabaseKey: 'Magic Link',
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
    id: 'change-email',
    name: 'Change email address',
    subject: 'Confirm your new email address — TRAVLR',
    description: 'Sent after a user changes their email address in account settings.',
    supabaseKey: 'Change Email Address',
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
    id: 'reset-password',
    name: 'Reset password',
    subject: 'Reset your TRAVLR password',
    description: 'Sent when a user requests a password reset.',
    supabaseKey: 'Reset Password',
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
    id: 'reauthentication',
    name: 'Reauthentication',
    subject: 'Verify your identity — TRAVLR',
    description: 'Used before sensitive account actions that require re-verification.',
    supabaseKey: 'Reauthentication',
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
