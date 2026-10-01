import type { Rating } from '@pnc/shared/domain';
import './legacy-rating-engine.js'; // side-effect import: the ES5 script registers itself on the global object
import type LegacyRatingEngineType from './legacy-rating-engine.js';
import type { LegacyPolicyInput } from './legacy-rating-engine.js';

// Legacy scripts attach to the global scope instead of exporting; we read it back once, in one place.
const LegacyRatingEngineCtor = (globalThis as unknown as { LegacyRatingEngine: typeof LegacyRatingEngineType }).LegacyRatingEngine;

export class LegacyRatingError extends Error {
  constructor(
    public readonly code: string,
    public readonly field?: string,
  ) {
    super(`Legacy rating engine rejected input (${code}${field ? `:${field}` : ''})`);
    this.name = 'LegacyRatingError';
  }
}

export interface LegacyRatingResult {
  score: number;
  rating: Rating;
}

/**
 * Anti-corruption layer around the ES5 engine: typed inputs, Error-based failures with stack traces,
 * and a single place to debug legacy behaviour.
 */
export class LegacyRatingAdapter {
  private readonly engine = new LegacyRatingEngineCtor();

  rate(input: LegacyPolicyInput): LegacyRatingResult {
    try {
      const score = this.engine.score(input);
      return { score, rating: this.engine.grade(score) };
    } catch (thrown) {
      // Legacy code throws strings such as "LEGACY_BAD_NUMBER:hazard".
      if (typeof thrown === 'string') {
        const [code, field] = thrown.split(':');
        throw new LegacyRatingError(code ?? 'LEGACY_UNKNOWN', field);
      }
      throw thrown;
    }
  }

  get invocations(): number {
    return this.engine.calls;
  }
}
