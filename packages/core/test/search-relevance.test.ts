import { describe, expect, it } from 'vitest';
import { isRelevantHit, significantTerms } from '../src/domain/search-relevance.js';

const TH = { minScore: 0.2, strongScore: 0.5 };

describe('significantTerms', () => {
  it('lowercases, splits and drops 1-char/punctuation noise', () => {
    expect(significantTerms('Financial Report!')).toEqual(['financial', 'report']);
    expect(significantTerms('a # @ TOTO#')).toEqual(['toto']);
  });

  it('folds diacritics so accents are ignored', () => {
    expect(significantTerms('Conférence')).toEqual(['conference']);
  });
});

describe('isRelevantHit', () => {
  const terms = significantTerms('eurocommons');

  it('drops hits below the absolute floor', () => {
    expect(isRelevantHit(0.1, 'eurocommons', terms, TH)).toBe(false);
  });

  it('keeps a hit that shares a query term above the floor', () => {
    expect(isRelevantHit(0.88, 'Conférence eurocommons', terms, TH)).toBe(true);
  });

  it('drops near-centroid junk: above floor, no shared word, weak score', () => {
    expect(isRelevantHit(0.28, 'TOTO#', terms, TH)).toBe(false);
    expect(isRelevantHit(0.27, 'blafdslfkmfdfsdfdsfds', terms, TH)).toBe(false);
  });

  it('keeps a strong semantic match even without a shared word', () => {
    expect(isRelevantHit(0.62, 'unrelated wording', terms, TH)).toBe(true);
  });

  it('matches accent-insensitively against the hit text', () => {
    expect(isRelevantHit(0.3, 'la conference annuelle', significantTerms('Conférence'), TH)).toBe(true);
  });
});
