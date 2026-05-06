import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AuthPending } from '../components/AuthPending.js';
import { DomainInput } from '../components/DomainInput.js';
import { requireAuthGuard } from '../lib/auth-guard.js';

interface HomeSearchParams {
  domain?: string;
  addToPortfolio?: boolean;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearchParams => ({
    domain:
      typeof search.domain === 'string' && search.domain.length > 0 ? search.domain : undefined,
    addToPortfolio: search.addToPortfolio === 'true' || search.addToPortfolio === true,
  }),
  beforeLoad: async ({ search }) => {
    await requireAuthGuard();
    if (search.domain) {
      throw redirect({
        to: '/domain/$domain',
        params: { domain: search.domain },
        search: { addToPortfolio: search.addToPortfolio || undefined },
      });
    }
  },
  pendingComponent: AuthPending,
  component: HomeComponent,
});

function HomeComponent() {
  const navigate = useNavigate();

  const handleDomainSubmit = (domain: string, options?: { addToPortfolio: boolean }) => {
    navigate({
      to: '/domain/$domain',
      params: { domain },
      search: { addToPortfolio: options?.addToPortfolio || undefined },
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">DNS Ops Workbench</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Professional DNS analysis and mail security diagnostics. Identify misconfigurations,
          validate delegation chains, and ensure mail deliverability.
        </p>
      </div>

      {/* Quick Analyze */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="block text-sm font-medium text-gray-700 mb-2">Analyze any domain</p>
            <DomainInput onSubmit={handleDomainSubmit} />
            <div className="mt-3 text-sm text-gray-500">
              <p>Examples: example.com, google.com, your-domain.com</p>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <FeatureCard
          icon="globe"
          title="DNS Analysis"
          description="Query A, AAAA, MX, TXT, NS, SOA, CAA, and DNSKEY records from multiple vantage points worldwide."
        />
        <FeatureCard
          icon="shield"
          title="Mail Security"
          description="Validate SPF, DMARC, DKIM, MTA-STS, and TLS-RPT. Get actionable recommendations."
        />
        <FeatureCard
          icon="chart"
          title="Rules-Based Findings"
          description="Review snapshot metadata, DNS evidence, and mail diagnostics with deterministic checks."
        />
      </div>

      {/* Scope Clarification */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100 mb-8">
        <h2 className="font-semibold text-gray-900 mb-3">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Targeted Inspection
            </h3>
            <p className="text-sm text-gray-600">
              Analyze any domain instantly. Review DNS evidence immediately, then use operator
              access for refreshes and deeper diagnostics.
            </p>
            <ul className="mt-2 text-sm text-gray-500 space-y-1">
              <li>• Point-in-time snapshots</li>
              <li>• Multi-resolver verification</li>
              <li>• Mail configuration checks</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-green-800 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Managed Zones{' '}
              <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                Portfolio
              </span>
            </h3>
            <p className="text-sm text-gray-600">
              Add domains to your portfolio for monitoring, alert triage, shared reporting, and
              ongoing operator workflows. Ideal for domains you own or manage.
            </p>
            <ul className="mt-2 text-sm text-gray-500 space-y-1">
              <li>• Monitored domains and alert triage</li>
              <li>• Shared reports for stakeholders</li>
              <li>• Broader portfolio tooling phased in</li>
            </ul>
            <div className="mt-4">
              <Link
                to="/portfolio"
                className="focus-ring inline-flex min-h-10 items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Open Portfolio Workspace
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FeatureCard
          icon="folder"
          title="Portfolio Workspace"
          description="Open the operator workspace for monitoring, alert triage, shared reports, and later phased portfolio workflows."
        />
        <FeatureCard
          icon="document"
          title="Rules Engine"
          description="Deterministic analysis with versioned rulesets. Findings include evidence and remediation suggestions."
        />
      </div>
    </div>
  );
}

type FeatureIconType = 'globe' | 'shield' | 'chart' | 'folder' | 'document';

const FEATURE_ICONS: Record<FeatureIconType, React.ReactNode> = {
  globe: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
    />
  ),
  shield: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  ),
  chart: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
    />
  ),
  folder: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
    />
  ),
  document: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  ),
};

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: FeatureIconType;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="w-8 h-8 text-blue-500 mb-3">
        <svg
          aria-hidden="true"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {FEATURE_ICONS[icon]}
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
