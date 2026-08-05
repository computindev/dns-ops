import type { GuidanceOnlySuggestion } from '@dns-ops/contracts';
import type { Suggestion } from '@dns-ops/db';
import { guidanceForFindingType } from '@dns-ops/rules';

export function guidanceForPersistedFinding(findingType: string): GuidanceOnlySuggestion {
  return (
    guidanceForFindingType(findingType) ?? {
      kind: 'GUIDANCE_ONLY',
      title: 'Review the evidence and applicable operator playbook',
      explanation:
        'Confirm ownership, dependencies, and exact provider context before planning any change.',
      playbookId: 'operations.manual-evidence-review',
      requiresProviderConfirmation: false,
      executableMutation: null,
    }
  );
}

export function sanitizePersistedSuggestion(
  suggestion: Suggestion,
  findingType: string
): Suggestion {
  const guidance = guidanceForPersistedFinding(findingType);
  return {
    ...suggestion,
    title: guidance.title,
    description: guidance.explanation,
    action: `Playbook: ${guidance.playbookId}`,
    reviewOnly: true,
  };
}
