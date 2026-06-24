import { config } from '../config.js';
import type { EmbeddingProvider } from './provider.js';

/**
 * Deterministic, dependency-free embeddings for tests / offline use.
 * Hashes each token into a fixed-dimension bag-of-words vector and L2-normalizes,
 * so cosine similarity reflects token overlap (a query sharing words with a task
 * ranks that task higher) — enough to exercise the RAG paths without a model.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'fake';
  readonly dimension = config.embeddingDim;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  private embedOne(text: string): number[] {
    const v = new Array<number>(this.dimension).fill(0);
    for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      let h = 2166136261;
      for (let i = 0; i < token.length; i++) {
        h = (h ^ token.charCodeAt(i)) >>> 0;
        h = (h * 16777619) >>> 0;
      }
      v[h % this.dimension]! += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}
