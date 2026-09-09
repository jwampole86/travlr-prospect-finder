import { NextRequest, NextResponse } from 'next/server';
import { downloadSignedDocuments } from '@/lib/services/docusignService';
import { createClient } from '@supabase/supabase-js';
import { activityService } from '@/lib/services/activityService';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

/**
 * DocuSign Connect Webhook handler.
 * Receives envelope status change events from DocuSign and updates
 * signing_sessions + signing_signers in Supabase.
 *
 * Configure in DocuSign Admin → Connect → Add Configuration:
 *   URL: https://travlrpro3047.builtwithrocket.new/api/docusign/webhook
 *   Events: envelope-completed, envelope-voided, envelope-declined,
 *           recipient-completed, recipient-viewed, recipient-declined
 */

/** Generate a random secure password for new homeowner accounts */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/** Send homeowner welcome email with login credentials via Resend */
async function sendHomeownerCredentials(opts: {
  email: string;
  name: string;
  address: string;
  password: string;
  loginUrl: string;
}): Promise<void> {
  const { email, name, address, password, loginUrl } = opts;

  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #2563eb;">Welcome to TRAVLR, ${name}!</h2>
      <p>Your Partnership Agreement for <strong>${address}</strong> has been signed — congratulations on taking this step!</p>
      <p>We've created your Homeowner Portal account so you can track your property's performance, documents, bookings, and revenue all in one place.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <h3 style="margin-bottom: 8px;">Your Login Credentials</h3>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 6px 12px 6px 0; font-weight: 600; color: #6b7280; width: 100px;">Email</td>
          <td style="padding: 6px 0;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px 6px 0; font-weight: 600; color: #6b7280;">Password</td>
          <td style="padding: 6px 0; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${password}</td>
        </tr>
      </table>
      <p style="margin-top: 24px;">
        <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Log In to Your Homeowner Dashboard →
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
        For security, we recommend changing your password after your first login. If you have any questions, reply to this email or contact your TRAVLR property manager directly.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">TRAVLR Vacation Homes · travlrpro3047.builtwithrocket.new</p>
    </div>
  `;

  const { error } = await getResendClient().emails.send({
    from: getResendFrom(),
    to: [email],
    subject: `Your TRAVLR Homeowner Portal is ready — ${address}`,
    html: htmlBody,
  });

  if (error) throw new Error(`Resend homeowner welcome email failed: ${error.message}`);
}

export async function POST(req: NextRequest) {
  try {
    // DocuSign sends XML or JSON depending on Connect config
    // We configure JSON (Connect → Data Format → JSON)
    const body = await req.json() as {
      event?: string;
      apiVersion?: string;
      uri?: string;
      retryCount?: number;
      configurationId?: number;
      generatedDateTime?: string;
      data?: {
        accountId?: string;
        envelopeId?: string;
        envelopeSummary?: {
          status?: string;
          completedDateTime?: string;
          voidedDateTime?: string;
          voidedReason?: string;
          recipients?: {
            signers?: Array<{
              email?: string;
              name?: string;
              status?: string;
              signedDateTime?: string;
              viewedDateTime?: string;
              declinedDateTime?: string;
              declinedReason?: string;
            }>;
          };
        };
      };
    };

    const envelopeId = body.data?.envelopeId;
    const envelopeSummary = body.data?.envelopeSummary;
    const envelopeStatus = envelopeSummary?.status?.toLowerCase();

    if (!envelopeId) {
      return NextResponse.json({ received: true });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Find the session by envelope ID
    const { data: session } = await supabase
      .from('signing_sessions')
      .select('id, lead_id, lead_address, lead_state, user_id')
      .eq('envelope_id', envelopeId)
      .single();

    if (!session) {
      console.warn('[webhook] No session found for envelope:', envelopeId);
      return NextResponse.json({ received: true });
    }

    // ── Update session status ──────────────────────────────────────────────
    const statusMap: Record<string, string> = {
      completed: 'completed',
      voided: 'voided',
      declined: 'declined',
    };

    const newStatus = statusMap[envelopeStatus ?? ''];
    if (newStatus) {
      const updatePayload: Record<string, unknown> = { session_status: newStatus };

      if (newStatus === 'completed') {
        updatePayload.docusign_completed_at = envelopeSummary?.completedDateTime ?? new Date().toISOString();

        // Download and store signed PDF + certificate
        try {
          const { pdfBase64, certificateBase64 } = await downloadSignedDocuments(envelopeId);
          // Store as data URIs (in production, upload to Supabase Storage)
          updatePayload.signed_pdf_url = `data:application/pdf;base64,${pdfBase64}`;
          updatePayload.certificate_url = `data:application/pdf;base64,${certificateBase64}`;
        } catch (downloadErr) {
          console.warn('[webhook] Could not download signed docs:', downloadErr);
        }
      }

      if (newStatus === 'voided') {
        updatePayload.voided_at = envelopeSummary?.voidedDateTime ?? new Date().toISOString();
        updatePayload.voided_reason = envelopeSummary?.voidedReason ?? 'Voided via DocuSign';
      }

      await supabase
        .from('signing_sessions')
        .update(updatePayload)
        .eq('id', session.id);
    }

    // ── Update per-signer status ───────────────────────────────────────────
    const signers = envelopeSummary?.recipients?.signers ?? [];
    for (const signer of signers) {
      if (!signer.email) continue;

      const signerStatusMap: Record<string, string> = {
        completed: 'signed',
        signed: 'signed',
        viewed: 'viewed',
        delivered: 'viewed',
        declined: 'declined',
        voided: 'voided',
        sent: 'sent',
      };

      const signerStatus = signerStatusMap[signer.status?.toLowerCase() ?? ''] ?? 'sent';

      const signerUpdate: Record<string, unknown> = { signer_status: signerStatus };
      if (signer.signedDateTime) signerUpdate.signed_at = signer.signedDateTime;
      if (signer.viewedDateTime) signerUpdate.viewed_at = signer.viewedDateTime;
      if (signer.declinedDateTime) signerUpdate.declined_at = signer.declinedDateTime;
      if (signer.declinedReason) signerUpdate.decline_reason = signer.declinedReason;

      await supabase
        .from('signing_signers')
        .update(signerUpdate)
        .eq('session_id', session.id)
        .eq('signer_email', signer.email);
    }

    // ── Log to activity timeline ───────────────────────────────────────────
    if (newStatus === 'completed') {
      // Update lead stage to 'Under Contract' on completion
      await supabase
        .from('leads')
        .update({ stage: 'Under Contract' })
        .eq('id', session.lead_id);

      // Create homeowner onboarding record to trigger post-signing flow
      try {
        const { data: existingOnboarding } = await supabase
          .from('homeowner_onboarding')
          .select('id')
          .eq('lead_id', session.lead_id)
          .maybeSingle();

        if (!existingOnboarding) {
          await supabase.from('homeowner_onboarding').insert({
            lead_id: session.lead_id,
            signing_session_id: session.id,
            stripe_connect_status: 'not_started',
            listing_activated: false,
          });

          // Set lead onboarding status to in_progress
          await supabase
            .from('leads')
            .update({ onboarding_status: 'in_progress' })
            .eq('id', session.lead_id);
        }
      } catch (onboardingErr) {
        console.warn('[webhook] Could not create onboarding record:', onboardingErr);
      }

      // ── Auto-create homeowner Supabase account ─────────────────────────
      // Find the primary signer's email and name from the envelope
      const primarySigner = signers.find((s) => s.status?.toLowerCase() === 'completed' || s.status?.toLowerCase() === 'signed') ?? signers[0];

      if (primarySigner?.email) {
        try {
          const homeownerEmail = primarySigner.email;
          const homeownerName = primarySigner.name ?? 'Homeowner';

          // Check if a Supabase auth user already exists for this email
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find((u) => u.email === homeownerEmail);

          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travlrpro3047.builtwithrocket.new';
          const homeownerDashboardUrl = `${siteUrl}/homeowner`;

          if (!existingUser) {
            // Create new auth user with a temporary password
            const tempPassword = generateTempPassword();

            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
              email: homeownerEmail,
              password: tempPassword,
              email_confirm: true, // skip email confirmation — we're sending credentials directly
              user_metadata: {
                full_name: homeownerName,
                role: 'homeowner',
                lead_id: session.lead_id,
                lead_address: session.lead_address,
                onboarding_redirect: '/homeowner/onboarding',
              },
            });

            if (createError) {
              console.warn('[webhook] Could not create homeowner auth user:', createError.message);
            } else if (newUser?.user) {
              // Upsert into user_profiles with homeowner role
              await supabase.from('user_profiles').upsert({
                id: newUser.user.id,
                email: homeownerEmail,
                full_name: homeownerName,
                role: 'homeowner',
                lead_id: session.lead_id,
              }, { onConflict: 'id' });

              // Send credentials email via Resend
              try {
                await sendHomeownerCredentials({
                  email: homeownerEmail,
                  name: homeownerName,
                  address: session.lead_address ?? 'your property',
                  password: tempPassword,
                  loginUrl: homeownerDashboardUrl,
                });
              } catch (emailErr) {
                console.warn('[webhook] Could not send homeowner credentials email:', emailErr);
              }

              // Log account creation to activity timeline
              activityService.record({
                leadId: session.lead_id,
                leadAddress: session.lead_address ?? undefined,
                leadState: session.lead_state ?? undefined,
                eventType: 'note_added',
                description: `Homeowner portal account created for ${homeownerEmail} — login credentials sent`,
                detail: `Auto-provisioned on DocuSign completion. User ID: ${newUser.user.id}`,
                source: 'docusign_webhook',
                metadata: { envelopeId, sessionId: session.id, homeownerUserId: newUser.user.id },
              }).catch(() => {});
            }
          } else {
            // User already exists — send a password reset / magic link instead
            const { error: resetError } = await supabase.auth.admin.generateLink({
              type: 'magiclink',
              email: homeownerEmail,
              options: { redirectTo: homeownerDashboardUrl },
            });

            if (resetError) {
              console.warn('[webhook] Could not generate magic link for existing homeowner:', resetError.message);
            }
          }
        } catch (accountErr) {
          console.warn('[webhook] Homeowner account provisioning error:', accountErr);
        }
      }

      // ── Create/update commission payout record for the assigned agent ──────
      try {
        // Find the agent assigned to this lead
        const { data: leadData } = await supabase
          .from('leads')
          .select('assigned_agent_id, price, estimated_net_monthly')
          .eq('id', session.lead_id)
          .single();

        if (leadData?.assigned_agent_id) {
          // Look up the applicable commission rule for this agent
          const { data: commissionRule } = await supabase
            .from('commission_rules')
            .select('rate_percent, flat_amount, rule_type, agent_classification')
            .eq('agent_id', leadData.assigned_agent_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Calculate commission amount
          let commissionAmount = 0;
          const monthlyRevenue = leadData.estimated_net_monthly ?? 0;

          if (commissionRule) {
            if (commissionRule.rule_type === 'percentage' && commissionRule.rate_percent) {
              commissionAmount = Math.round((monthlyRevenue * commissionRule.rate_percent) / 100);
            } else if (commissionRule.rule_type === 'flat' && commissionRule.flat_amount) {
              commissionAmount = commissionRule.flat_amount;
            }
          } else {
            // Default: 10% of first month's estimated net revenue
            commissionAmount = Math.round(monthlyRevenue * 0.10);
          }

          // Upsert commission payout record
          const { error: commissionErr } = await supabase
            .from('agent_commission_payouts')
            .upsert({
              agent_id: leadData.assigned_agent_id,
              lead_id: session.lead_id,
              envelope_id: envelopeId,
              commission_amount: commissionAmount,
              commission_basis: monthlyRevenue,
              rate_percent: commissionRule?.rate_percent ?? 10,
              agent_classification: commissionRule?.agent_classification ?? 'unknown',
              status: 'pending',
              trigger_event: 'docusign_completed',
              docusign_completed_at: envelopeSummary?.completedDateTime ?? new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'lead_id,agent_id' });

          if (commissionErr) {
            console.warn('[webhook] Commission record upsert error:', commissionErr.message);
          } else {
            // Also update the running totals on the payout summary row
            await supabase.rpc('increment_agent_commission', {
              p_agent_id: leadData.assigned_agent_id,
              p_amount: commissionAmount,
            }).catch(() => {
              // RPC may not exist yet — non-fatal, the individual record is already created
            });

            activityService.record({
              leadId: session.lead_id,
              leadAddress: session.lead_address ?? undefined,
              leadState: session.lead_state ?? undefined,
              eventType: 'note_added',
              description: `Commission record created: $${commissionAmount.toLocaleString()} pending for agent`,
              detail: `DocuSign envelope ${envelopeId} completed. Commission basis: $${monthlyRevenue}/mo net`,
              source: 'docusign_webhook',
              metadata: { envelopeId, agentId: leadData.assigned_agent_id, commissionAmount },
            }).catch(() => {});
          }
        }
      } catch (commissionErr) {
        console.warn('[webhook] Commission creation error:', commissionErr);
      }
      // ── End commission creation ────────────────────────────────────────────

      // Log activity (fire-and-forget)
      activityService.record({
        leadId: session.lead_id,
        leadAddress: session.lead_address ?? undefined,
        leadState: session.lead_state ?? undefined,
        eventType: 'stage_changed',
        description: 'Partnership Agreement signed — lead moved to Under Contract',
        detail: `DocuSign envelope ${envelopeId} completed`,
        newValue: 'Under Contract',
        source: 'docusign_webhook',
        metadata: { envelopeId, sessionId: session.id },
      }).catch(() => {});
    }

    if (newStatus === 'voided') {
      activityService.record({
        leadId: session.lead_id,
        leadAddress: session.lead_address ?? undefined,
        leadState: session.lead_state ?? undefined,
        eventType: 'stage_changed',
        description: 'Partnership Agreement signing voided',
        detail: envelopeSummary?.voidedReason ?? 'Voided',
        source: 'docusign_webhook',
        metadata: { envelopeId, sessionId: session.id },
      }).catch(() => {});
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[docusign-webhook] error:', message);
    // Always return 200 to DocuSign to prevent retries on our errors
    return NextResponse.json({ received: true, warning: message });
  }
}
