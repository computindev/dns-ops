/**
 * Non-executable operator guidance. Generic findings must use this shape until
 * provider, domain-purpose, and proposed-value context are complete.
 */
export interface GuidanceOnlySuggestion {
  kind: 'GUIDANCE_ONLY';
  title: string;
  explanation: string;
  playbookId: string;
  requiresProviderConfirmation: boolean;
  executableMutation: null;
}
