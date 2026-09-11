import 'server-only';

const VAPI_BASE_URL = 'https://api.vapi.ai';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getVapiConfig() {
  return {
    apiKey: requiredEnv('VAPI_PRIVATE_API_KEY'),
    assistantId: requiredEnv('VAPI_INTERVIEW_ASSISTANT_ID'),
    phoneNumberId: requiredEnv('VAPI_INTERVIEW_PHONE_NUMBER_ID'),
  };
}

export interface StartVapiCallInput {
  to: string;
  candidateName?: string;
  variableValues?: Record<string, string>;
}

export async function startVapiCall(input: StartVapiCallInput) {
  const { apiKey, assistantId, phoneNumberId } = getVapiConfig();

  const response = await fetch(`${VAPI_BASE_URL}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: {
        number: input.to,
        ...(input.candidateName ? { name: input.candidateName } : {}),
      },
      ...(input.variableValues
        ? { assistantOverrides: { variableValues: input.variableValues } }
        : {}),
    }),
    cache: 'no-store',
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Vapi rejected the call request';
    throw new Error(providerMessage);
  }

  if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
    throw new Error('Vapi did not return a call ID');
  }

  return {
    id: body.id,
    status: 'status' in body && typeof body.status === 'string' ? body.status : undefined,
  };
}

export async function stopVapiCall(callId: string) {
  const { apiKey } = getVapiConfig();

  const response = await fetch(`${VAPI_BASE_URL}/call/${encodeURIComponent(callId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'ended' }),
    cache: 'no-store',
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Vapi rejected the stop request';
    throw new Error(providerMessage);
  }
}
