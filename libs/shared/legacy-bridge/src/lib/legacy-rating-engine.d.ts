export interface LegacyPolicyInput {
  hazard: number | string;
  lossRatio: number | string;
  tiv: number | string;
  deductible: number | string;
}
declare class LegacyRatingEngine {
  constructor(options?: Record<string, unknown>);
  calls: number;
  score(policy: LegacyPolicyInput): number;
  grade(score: number): 'A' | 'B' | 'C' | 'D' | 'E';
}
export default LegacyRatingEngine;
