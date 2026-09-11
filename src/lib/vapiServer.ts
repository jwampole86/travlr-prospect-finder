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

  const callResponse = await fetch(`${VAPI_BASE_URL}/call/${encodeURIComponent(callId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
  });
  const callBody = await callResponse.json().catch(() => null);
  if (!callResponse.ok) {
    const providerMessage =
      callBody && typeof callBody === 'object' && 'message' in callBody && typeof callBody.message === 'string'
        ? callBody.message
        : `Vapi could not find call ${callId}`;
    throw new Error(providerMessage);
  }

  const controlUrl =
    callBody && typeof callBody === 'object' && 'monitor' in callBody && callBody.monitor && typeof callBody.monitor === 'object' && 'controlUrl' in callBody.monitor && typeof callBody.monitor.controlUrl === 'string'
      ? callBody.monitor.controlUrl
      : null;
  if (!controlUrl) {
    throw new Error('Vapi did not provide a live control URL for this call. Enable call control on the interview assistant.');
  }

  const response = await fetch(controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'end-call' }),
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
