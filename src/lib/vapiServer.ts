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

const RESCHEDULE_INSTRUCTIONS = `If the candidate says they are busy, driving, at work, unavailable, unable to talk, or asks to do the interview later, do not pressure them or score this negatively. Acknowledge them and ask whether they would like to reschedule. If they agree, use get_interview_availability with the interviewId and candidateId variables and their requested date, time of day, and timezone. Offer only slots returned by that tool, in the candidate's local timezone. Require explicit confirmation before calling reschedule_interview. Never claim a time is booked until reschedule_interview returns ok=true. If it returns SLOT_NO_LONGER_AVAILABLE, call get_interview_availability again. After a successful reschedule, confirm the exact date, time, and timezone, then end the call politely with the endCall tool. A reschedule request is not a negative interview signal.`;

function toolBaseUrl() {
  const configured = process.env.VAPI_TOOL_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL?.trim();
  return vercelUrl ? `https://${vercelUrl}` : null;
}

async function getRescheduleAssistantOverride(apiKey: string, assistantId: string) {
  const baseUrl = toolBaseUrl();
  if (!baseUrl) return { model: { messages: [{ role: 'system', content: RESCHEDULE_INSTRUCTIONS }] } };
  const toolSecret = process.env.VAPI_TOOL_SECRET || process.env.VAPI_WEBHOOK_SECRET;
  if (!toolSecret) throw new Error('VAPI_TOOL_SECRET is not configured');

  const assistantResponse = await fetch(`${VAPI_BASE_URL}/assistant/${encodeURIComponent(assistantId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  const assistant = await assistantResponse.json().catch(() => null);
  const existingMessages = assistant?.model?.messages && Array.isArray(assistant.model.messages) ? assistant.model.messages : [];
  return {
    model: {
      messages: [...existingMessages, { role: 'system', content: RESCHEDULE_INSTRUCTIONS }],
      tools: [
        { type: 'endCall' },
        {
          type: 'function',
          function: {
            name: 'get_interview_availability',
            description: 'Retrieve real open 25-minute interview slots in the candidate local timezone.',
            parameters: {
              type: 'object',
              properties: {
                interviewId: { type: 'string' },
                candidateId: { type: 'string' },
                candidateTimezone: { type: 'string' },
                preferredDate: { type: 'string' },
                preferredTime: { type: 'string' },
                preferredTimeOfDay: { type: 'string', enum: ['morning', 'afternoon', 'evening'] },
                searchDays: { type: 'number' },
              },
              required: ['interviewId', 'candidateId'],
            },
          },
          server: { url: `${baseUrl}/api/interviews/vapi/availability`, secret: toolSecret },
        },
        {
          type: 'function',
          function: {
            name: 'reschedule_interview',
            description: 'Atomically book a candidate-confirmed interview slot and re-queue the canonical interview.',
            parameters: {
              type: 'object',
              properties: {
                interviewId: { type: 'string' },
                candidateId: { type: 'string' },
                selectedScheduledAt: { type: 'string' },
                scheduledLocalDate: { type: 'string' },
                scheduledLocalTime: { type: 'string' },
                scheduledTimezone: { type: 'string' },
              },
              required: ['interviewId', 'candidateId', 'selectedScheduledAt', 'scheduledTimezone'],
            },
          },
          server: { url: `${baseUrl}/api/interviews/vapi/reschedule`, secret: toolSecret },
        },
      ],
    },
  };
}

export async function startVapiCall(input: StartVapiCallInput) {
  const { apiKey, assistantId, phoneNumberId } = getVapiConfig();
  const rescheduleOverride = await getRescheduleAssistantOverride(apiKey, assistantId);

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
        model: rescheduleOverride.model,
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
