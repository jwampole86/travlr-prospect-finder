import 'server-only';
import { completion } from '@rocketnew/llm-sdk';

const API_KEYS: Record<string, string | undefined> = {
  OPEN_AI: process.env.OPENAI_API_KEY,
  ANTHROPIC: process.env.ANTHROPIC_API_KEY,
  GEMINI: process.env.GEMINI_API_KEY,
  PERPLEXITY: process.env.PERPLEXITY_API_KEY,
};

/**
 * Chat completion for server code (API routes). The browser helper in chatCompletion.ts posts to a relative URL, which a server
 * cannot fetch, so routes call the provider directly. Same response shape: choices[0].message.content.
 */
export async function getServerChatCompletion(provider: string, model: string, messages: object[], parameters: object = {}) {
  const apiKey = API_KEYS[provider];
  if (!apiKey) throw new Error(`${provider} API key is not configured`);
  return completion({ model, messages, stream: false, api_key: apiKey, ...parameters } as never) as Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
}
