// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Minimal OpenAI-compatible chat-completions client (works with OpenAI, Azure OpenAI gateways, vLLM, Ollama, ...).
export class LlmError extends Error {
  /** @param {string} message @param {number} [status] The provider's HTTP status, when it answered. */
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {{ chat: (args: { messages: unknown[], tools: unknown[], signal?: AbortSignal }) => Promise<{ content: string | null, tool_calls?: any[] }> } | null}
 */
export function createLlm(env, fetchImpl = fetch) {
  if (!env.AVA_LLM_API_KEY) return null;
  const base = (env.AVA_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = env.AVA_LLM_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(env.AVA_LLM_TIMEOUT_MS) || 30000;
  return {
    async chat({ messages, tools, signal }) {
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal ? AbortSignal.any?.([signal, timeout]) ?? timeout : timeout;
      let res;
      try {
        res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AVA_LLM_API_KEY}` },
          body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
          signal: combined
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new LlmError(err?.name === 'TimeoutError' ? 'language model timed out' : 'language model unreachable');
      }
      if (!res.ok) throw new LlmError(`language model responded ${res.status}`, res.status);
      const body = await res.json();
      const message = body?.choices?.[0]?.message;
      if (!message) throw new LlmError('language model returned no message');
      return message;
    }
  };
}
