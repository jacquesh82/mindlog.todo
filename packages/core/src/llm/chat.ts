import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailable } from '../errors.js';
import { providerOf } from './models.js';

// Unified chat-completion façade across LLM providers. Each call is one-shot
// (system + single user message) and reports token usage so callers can log /
// meter it. Provider is derived from the model id.

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatRequest {
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens: number;
}

export async function chatComplete(req: ChatRequest): Promise<ChatResult> {
  if (!req.apiKey) throw ServiceUnavailable('No API key configured for the AI provider');
  return providerOf(req.model) === 'openai' ? openai(req) : anthropic(req);
}

async function anthropic(req: ChatRequest): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: req.apiKey });
  const message = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.prompt }],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return {
    text,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

async function openai(req: ChatRequest): Promise<ChatResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${req.apiKey}` },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw ServiceUnavailable(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (json.choices?.[0]?.message?.content ?? '').trim(),
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}
