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
      assistantOverrides: {
        monitorPlan: { controlEnabled: true },
        ...(input.variableValues ? { variableValues: input.variableValues } : {}),
      },
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
  if (controlUrl) {
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
    return;
  }

  const providerCallId =
    callBody && typeof callBody === 'object' && 'phoneCallProviderId' in callBody && typeof callBody.phoneCallProviderId === 'string'
      ? callBody.phoneCallProviderId
      : callBody && typeof callBody === 'object' && 'transport' in callBody && callBody.transport && typeof callBody.transport === 'object' && 'callSid' in callBody.transport && typeof callBody.transport.callSid === 'string'
        ? callBody.transport.callSid
        : null;
  const authSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const accountSid = authSid?.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN?.trim() : authSid;

  const stopErrors: string[] = [];
  if (providerCallId && authSid && authToken && accountSid) {
    const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');
    const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${providerCallId}.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Status: 'completed' }).toString(),
      cache: 'no-store',
    });
    const twilioBody = await twilioResponse.json().catch(() => null);
    if (twilioResponse.ok) return;
    stopErrors.push(
      twilioBody && typeof twilioBody === 'object' && 'message' in twilioBody && typeof twilioBody.message === 'string'
        ? `Twilio: ${twilioBody.message}`
        : 'Twilio rejected the stop request',
    );
  } else {
    stopErrors.push('No usable Twilio provider call ID or Twilio credentials were available');
  }

  const updateResponse = await fetch(`${VAPI_BASE_URL}/call/${encodeURIComponent(callId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'ended' }),
    cache: 'no-store',
  });
  const updateBody = await updateResponse.json().catch(() => null);
  if (updateResponse.ok) return;
  stopErrors.push(
    updateBody && typeof updateBody === 'object' && 'message' in updateBody && typeof updateBody.message === 'string'
      ? `Vapi: ${updateBody.message}`
      : 'Vapi rejected the call update stop request',
  );

  throw new Error(stopErrors.join('; '));
}
