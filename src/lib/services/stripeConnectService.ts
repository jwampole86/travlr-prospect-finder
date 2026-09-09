/**
 * Stripe Connect Placeholder Service
 * Scaffolded for payout account verification.
 * Add STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env when ready.
 *
 * Production flow:
 *  1. createConnectAccount() → creates a Stripe Express account for the homeowner
 *  2. createAccountLink() → returns onboarding URL for the homeowner to verify bank details
 *  3. getAccountStatus() → checks verification status
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';

export interface StripeConnectAccount {
  accountId: string;
  status: 'not_started' | 'pending' | 'verified' | 'failed';
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: string[];
}

/**
 * Creates a Stripe Express connected account for a homeowner.
 * PLACEHOLDER — returns a mock response until Stripe credentials are added.
 */
export async function createConnectAccount(params: {
  email: string;
  name: string;
  leadId: string;
}): Promise<{ accountId: string; error?: string }> {
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'your-stripe-secret-key-here') {
    // Placeholder: return a mock account ID
    console.warn('[StripeConnect] No Stripe secret key configured — returning placeholder account ID');
    return { accountId: `acct_placeholder_${params.leadId.slice(0, 8)}` };
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/accounts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'express',
        email: params.email,
        'capabilities[transfers][requested]': 'true',
        'business_type': 'individual',
        'metadata[lead_id]': params.leadId,
      }),
    });
    const data = await res.json() as { id?: string; error?: { message: string } };
    if (data.error) return { accountId: '', error: data.error.message };
    return { accountId: data.id ?? '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { accountId: '', error: msg };
  }
}

/**
 * Creates an account link for the homeowner to complete Stripe onboarding.
 * PLACEHOLDER — returns a mock URL until Stripe credentials are added.
 */
export async function createAccountLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<{ url: string; error?: string }> {
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'your-stripe-secret-key-here') {
    console.warn('[StripeConnect] No Stripe secret key configured — returning placeholder URL');
    return { url: '#stripe-connect-placeholder' };
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        account: params.accountId,
        refresh_url: params.refreshUrl,
        return_url: params.returnUrl,
        type: 'account_onboarding',
      }),
    });
    const data = await res.json() as { url?: string; error?: { message: string } };
    if (data.error) return { url: '', error: data.error.message };
    return { url: data.url ?? '' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { url: '', error: msg };
  }
}

/**
 * Retrieves the verification status of a Stripe Connect account.
 * PLACEHOLDER — returns mock status until Stripe credentials are added.
 */
export async function getAccountStatus(accountId: string): Promise<StripeConnectAccount> {
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY === 'your-stripe-secret-key-here' || accountId.startsWith('acct_placeholder')) {
    return {
      accountId,
      status: 'not_started',
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      requirements: ['Stripe credentials not yet configured'],
    };
  }

  try {
    const res = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const data = await res.json() as {
      id?: string;
      details_submitted?: boolean;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      requirements?: { currently_due?: string[] };
      error?: { message: string };
    };

    if (data.error) {
      return { accountId, status: 'failed', detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false };
    }

    const status: StripeConnectAccount['status'] =
      data.payouts_enabled ? 'verified': data.details_submitted ?'pending': 'not_started';

    return {
      accountId,
      status,
      detailsSubmitted: data.details_submitted ?? false,
      chargesEnabled: data.charges_enabled ?? false,
      payoutsEnabled: data.payouts_enabled ?? false,
      requirements: data.requirements?.currently_due ?? [],
    };
  } catch {
    return { accountId, status: 'failed', detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false };
  }
}
