import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AuthPending } from '../components/AuthPending.js';
import { AlertsPanel } from '../components/AlertsPanel.js';
import { AuditLogPanel } from '../components/AuditLogPanel.js';
import { FleetReportsPanel } from '../components/FleetReportsPanel.js';
import { MonitoredDomainsPanel } from '../components/MonitoredDomainsPanel.js';
import { PortfolioSearchPanel } from '../components/PortfolioSearchPanel.js';
import { SavedFiltersPanel } from '../components/SavedFiltersPanel.js';
import { SharedReportsPanel } from '../components/SharedReportsPanel.js';
import { TemplateOverridesPanel } from '../components/TemplateOverridesPanel.js';
import { requireAuthGuard } from '../lib/auth-guard.js';
import { type CurrentFilters, EMPTY_CURRENT_FILTERS } from '../lib/portfolio-filters.js';

export const Route = createFileRoute('/portfolio')({
  beforeLoad: async () => {
    await requireAuthGuard();
  },
  pendingComponent: AuthPending,
  component: PortfolioWorkspace,
});

function PortfolioWorkspace() {
  const [currentFilters, setCurrentFilters] = useState<CurrentFilters>(EMPTY_CURRENT_FILTERS);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Operator workspace
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Portfolio workflows</h1>
        <p className="mt-4 text-gray-700">
          This route now exposes the supported operator surface for monitoring, alert triage, fleet
          reporting, saved filters, shared reports, and tenant governance workflows.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/"
            className="focus-ring inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Return to Home
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <PortfolioSearchPanel currentFilters={currentFilters} onFiltersChange={setCurrentFilters} />
        <SavedFiltersPanel currentFilters={currentFilters} onLoadFilter={setCurrentFilters} />
      </div>

      <MonitoredDomainsPanel />
      <AlertsPanel />
      <SharedReportsPanel />
      <FleetReportsPanel />
      <TemplateOverridesPanel />
      <AuditLogPanel />

      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Mail diagnostics and remediation requests are available from the Domain 360 mail tab. Domain
        notes and tags now live on the Domain 360 overview surface. Saved filters now drive the
        portfolio search workspace directly.
      </div>
    </div>
  );
}
