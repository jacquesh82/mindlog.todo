import { config } from '../config.js';
import { ServiceUnavailable } from '../errors.js';
import type { EmbeddingProvider } from './provider.js';

const MODEL = 'text-embedding-3-small';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = `openai:${MODEL}`;
  readonly dimension = config.embeddingDim;

  async embed(texts: string[]): Promise<number[][]> {
    if (!config.openaiApiKey) {
      throw ServiceUnavailable('OPENAI_API_KEY is not configured');
    }
    if (texts.length === 0) return [];

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({ input: texts, model: MODEL }),
    });
    if (!res.ok) {
      throw ServiceUnavailable(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    // Ensure original order regardless of API ordering.
    return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
