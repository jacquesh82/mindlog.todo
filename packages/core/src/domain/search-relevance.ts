/**
 * Relevance gating for semantic (k-NN) search.
 *
 * A pure cosine-similarity floor isn't enough: sentence embeddings live in a
 * narrow cone, so unrelated/gibberish text still scores ~0.25–0.35 against any
 * query and slips above a low floor. To honour "if the term is absent or too
 * distant, don't show it" we combine two signals:
 *
 *   - lexical: at least one significant query term appears literally in the hit;
 *   - semantic: the cosine score is high enough to stand on its own.
 *
 * A hit is kept when it clears the absolute floor AND (matches lexically OR is a
 * strong semantic match). Near-centroid junk — weak score, no shared word — is
 * dropped, while genuine paraphrases (strong score, different words) survive.
 */

/** Lowercase + strip diacritics so "Conférence" matches a "conference" query. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Significant query terms for the lexical check (drops 1-char / punctuation noise). */
export function significantTerms(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

export interface RelevanceThresholds {
  /** Absolute cosine floor: below this a hit is always dropped. */
  minScore: number;
  /** Cosine score above which a hit is kept on semantics alone (no shared word). */
  strongScore: number;
}

/**
 * Decide whether a single hit is relevant. `text` is whatever text of the hit
 * is available for a lexical match (e.g. a task's title + description, or a
 * note's title); `terms` comes from {@link significantTerms}.
 */
export function isRelevantHit(
  score: number,
  text: string,
  terms: string[],
  { minScore, strongScore }: RelevanceThresholds,
): boolean {
  if (score < minScore) return false;
  if (score >= strongScore) return true;
  if (terms.length === 0) return false;
  const hay = fold(text);
  return terms.some((term) => hay.includes(term));
}
