import { config } from '../config.js';
import type { EmbeddingProvider } from './provider.js';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Local embeddings via transformers.js (no API key, runs in-process).
 * The model is downloaded on first use and cached on disk.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = `local:${MODEL}`;
  readonly dimension = config.embeddingDim;
  // The transformers pipeline is heavy; load it lazily on first embed call.
  private extractor: Promise<(texts: string[], opts: object) => Promise<{ tolist(): number[][] }>> | null =
    null;

  private getExtractor() {
    if (!this.extractor) {
      this.extractor = import('@huggingface/transformers').then(
        ({ pipeline }) => pipeline('feature-extraction', MODEL) as unknown as Promise<
          (texts: string[], opts: object) => Promise<{ tolist(): number[][] }>
        >,
      );
    }
    return this.extractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  }
}
