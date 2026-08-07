import type { Confidence, ResultState, Severity, ZoneManagement } from '@dns-ops/contracts';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'unknown';

interface BadgeProps {
  children: React.ReactNode;
  tone: BadgeTone;
}

function Badge({ children, tone }: BadgeProps) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}

export function ZoneManagementBadge({ type }: { type: ZoneManagement }) {
  const config = {
    managed: { tone: 'success' as const, label: 'Managed Zone' },
    unmanaged: { tone: 'warning' as const, label: 'Unmanaged (Targeted)' },
    unknown: { tone: 'unknown' as const, label: 'Unknown' },
  };
  const { tone, label } = config[type];

  return <Badge tone={tone}>{label}</Badge>;
}

export function ResultStateBadge({ state }: { state: ResultState }) {
  const config = {
    complete: { tone: 'success' as const, label: 'Complete' },
    partial: { tone: 'unknown' as const, label: 'Partial' },
    failed: { tone: 'danger' as const, label: 'Failed' },
  };
  const { tone, label } = config[state];

  return <Badge tone={tone}>{label}</Badge>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tones = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info',
    info: 'neutral',
  } as const;

  return <Badge tone={tones[severity]}>{severity}</Badge>;
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const tones = {
    certain: 'success',
    high: 'info',
    medium: 'warning',
    low: 'unknown',
    heuristic: 'unknown',
  } as const;

  return <Badge tone={tones[level]}>{level}</Badge>;
}
