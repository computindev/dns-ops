import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { InternalSignalKind } from '@dns-ops/contracts';

/**
 * Closed-world mapping from case kind (InternalSignalKind) to its approved
 * playbook in docs/playbooks/. The excerpt is parsed from the document itself:
 * no LLM, and no second copy of the playbook content to drift out of date.
 */
const CASE_KIND_PLAYBOOKS: Record<InternalSignalKind, string> = {
  DOMAIN_EXPIRING_SOON: 'domain-expiry',
  TLS_CERTIFICATE_REGRESSION: 'tls-regression',
  REDIRECT_TOPOLOGY_REGRESSION: 'redirect-regression',
  HOMEPAGE_INDEXABILITY_REGRESSION: 'indexability-regression',
  MAIL_DNS_CONFIGURATION_REGRESSION: 'mail-dns-configuration-regression',
  // There is no HTTP-health probe/evaluator (day-0 gate 1 marks the condition
  // DISABLED), so an unavailable-endpoint case is a missing-evidence case and
  // uses the unknown-evidence playbook.
  HTTP_ENDPOINT_UNAVAILABLE: 'unknown-evidence',
};

export interface CasePlaybook {
  caseKind: string;
  playbookId: string;
  title: string;
  sections: Record<string, string>;
}

function playbookPath(playbookId: string): string {
  // Resolved from this source file so both the dev server and vitest find
  // docs/playbooks regardless of process cwd.
  return fileURLToPath(new URL(`../../../../docs/playbooks/${playbookId}.md`, import.meta.url));
}

function splitSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = line.slice(3).trim();
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

/** Returns the playbook excerpt for a case kind, or null for unknown kinds. */
export async function loadCasePlaybook(caseKind: string): Promise<CasePlaybook | null> {
  const playbookId = CASE_KIND_PLAYBOOKS[caseKind as InternalSignalKind];
  if (!playbookId) return null;
  const markdown = await readFile(playbookPath(playbookId), 'utf-8');
  const title = /^# (.+)$/m.exec(markdown)?.[1] ?? playbookId;
  return { caseKind, playbookId, title, sections: splitSections(markdown) };
}
