import { useId, useState } from 'react';

interface PasteFinding {
  type: string;
  title: string;
  description: string;
  severity: string;
}

interface PasteResponse {
  kind?: string;
  findings?: PasteFinding[];
  summary?: { totalFindings: number };
  error?: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-danger',
  high: 'text-danger',
  medium: 'text-warning',
  low: 'text-text',
  info: 'text-muted',
};

/**
 * Paste dig output or a bounce header (issue #56) and evaluate it through the
 * snapshot ruleset without collecting anything. Results are labeled as pasted
 * evidence, never persisted as snapshot findings.
 */
export function PasteEvidencePanel({ domain }: { domain: string }) {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<PasteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const headingId = `${useId()}-paste-evidence-heading`;
  const inputId = `${useId()}-paste-evidence-input`;

  const analyze = async () => {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/paste/findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ domain, content }),
      });
      setResult((await response.json()) as PasteResponse);
    } catch {
      setResult({ error: 'Paste analysis request failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ds-panel portfolio-panel" aria-labelledby={headingId}>
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-lg font-medium text-ink" id={headingId}>
          Paste evidence
        </h3>
        <p className="text-sm text-muted">
          Paste dig output or a bounce header for {domain}. It is evaluated with the snapshot
          ruleset and marked as pasted evidence — not collected, not saved.
        </p>
      </div>
      <div className="space-y-3 p-4">
        <label className="sr-only" htmlFor={inputId}>
          Pasted dig output or bounce header
        </label>
        <textarea
          id={inputId}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={6}
          disabled={busy}
          placeholder={
            'example.com. 300 IN MX 10 mail.example.com.\n—or—\nAuthentication-Results: mx; spf=pass smtp.mailfrom=user@example.com'
          }
          className="ds-input w-full rounded-lg border border-line px-3 py-2 font-mono text-xs focus:border-brand focus:ring-2 focus:ring-focus"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={analyze}
            disabled={busy || content.trim().length === 0}
            className="ds-button ds-button--primary ds-button--sm"
          >
            {busy ? 'Analyzing…' : 'Analyze pasted evidence'}
          </button>
        </div>

        {result?.error && (
          <p className="rounded-lg border border-danger bg-danger-surface p-3 text-sm text-danger">
            {result.error}
          </p>
        )}

        {result && !result.error && (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Pasted evidence ({result.kind}) — {result.summary?.totalFindings ?? 0} finding
              {result.summary?.totalFindings === 1 ? '' : 's'}. Not collected, not saved.
            </p>
            <ul className="space-y-2">
              {(result.findings ?? []).map((finding) => (
                <li key={finding.type} className="rounded-lg border border-line p-3">
                  <p className="text-sm font-medium text-ink">
                    <span className={SEVERITY_COLOR[finding.severity] ?? 'text-text'}>
                      [{finding.severity}]
                    </span>{' '}
                    {finding.title}
                  </p>
                  <p className="mt-1 text-sm text-muted">{finding.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
