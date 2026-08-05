export type SpfAnalysisScope = 'FIRST_LEVEL_ONLY';

export interface FirstLevelSpfAssessment {
  scope: SpfAnalysisScope;
  directDnsLookupTerms: number;
  includeDomains: string[];
  redirectDomain?: string;
  status: 'DIRECT_SYNTAX_VALID' | 'DIRECT_SYNTAX_INVALID' | 'UNKNOWN';
  completeEvaluation: false;
  limitation: string;
}
