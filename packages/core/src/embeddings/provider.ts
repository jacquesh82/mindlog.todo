import { config } from '../config.js';
import { FakeEmbeddingProvider } from './fake.js';
import { LocalEmbeddingProvider } from './local.js';
import { OpenAIEmbeddingProvider } from './openai.js';
import { VoyageEmbeddingProvider } from './voyage.js';

export interface EmbeddingProvider {
  readonly id: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

let provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (provider) return provider;
  switch (config.embeddingProvider) {
    case 'voyage':
      provider = new VoyageEmbeddingProvider();
      break;
    case 'openai':
      provider = new OpenAIEmbeddingProvider();
      break;
    case 'fake':
      provider = new FakeEmbeddingProvider();
      break;
    case 'local':
    default:
      provider = new LocalEmbeddingProvider();
      break;
  }
  return provider;
}

/** Embed a single text, returning one vector. */
export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await getEmbeddingProvider().embed([text]);
  return vec ?? [];
}
