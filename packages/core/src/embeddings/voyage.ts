import { config } from '../config.js';
import { ServiceUnavailable } from '../errors.js';
import type { EmbeddingProvider } from './provider.js';

const MODEL = 'voyage-3';

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly id = `voyage:${MODEL}`;
  readonly dimension = config.embeddingDim;

  async embed(texts: string[]): Promise<number[][]> {
    if (!config.voyageApiKey) {
      throw ServiceUnavailable('VOYAGE_API_KEY is not configured');
    }
    if (texts.length === 0) return [];

    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.voyageApiKey}`,
      },
      body: JSON.stringify({ input: texts, model: MODEL }),
    });
    if (!res.ok) {
      throw ServiceUnavailable(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}
