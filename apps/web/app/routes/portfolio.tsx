import { createFileRoute, Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { AlertsPanel } from '../components/AlertsPanel.js';
import { AuditLogPanel } from '../components/AuditLogPanel.js';
import { AuthPending } from '../components/AuthPending.js';
import { BuiltInViewsPanel } from '../components/BuiltInViewsPanel.js';
import { FleetReportsPanel } from '../components/FleetReportsPanel.js';
import { FleetTapePanel } from '../components/FleetTapePanel.js';
import { LiveDrillsPanel } from '../components/LiveDrillsPanel.js';
import { MonitoredDomainsPanel } from '../components/MonitoredDomainsPanel.js';
import { PortfolioSearchPanel } from '../components/PortfolioSearchPanel.js';
import { SavedFiltersPanel } from '../components/SavedFiltersPanel.js';
import { SharedReportsPanel } from '../components/SharedReportsPanel.js';
import { TemplateOverridesPanel } from '../components/TemplateOverridesPanel.js';
import { requireAuthGuard } from '../lib/auth-guard.js';
import { type BuiltInView, type BuiltInViewId, getBuiltInView } from '../lib/built-in-views.js';
import { type CurrentFilters, EMPTY_CURRENT_FILTERS } from '../lib/portfolio-filters.js';

export const Route = createFileRoute('/portfolio')({
  beforeLoad: async () => {
    await requireAuthGuard();
  },
  pendingComponent: AuthPending,
  component: PortfolioWorkspace,
});

function PortfolioWorkspace() {
  const workspaceTitleId = useId();
  const [currentFilters, setCurrentFilters] = useState<CurrentFilters>(EMPTY_CURRENT_FILTERS);
  const [activeViewId, setActiveViewId] = useState<BuiltInViewId | null>(null);
  const activeView = activeViewId ? getBuiltInView(activeViewId) : null;

  const handleSelectView = (view: BuiltInView) => {
    setActiveViewId(view.id);
    setCurrentFilters(view.currentFilters);
  };

  const handleClearView = () => {
    setActiveViewId(null);
    setCurrentFilters(EMPTY_CURRENT_FILTERS);
  };

  return (
    <section className="portfolio-workspace" aria-labelledby={workspaceTitleId}>
      <header className="ds-panel portfolio-workspace__header">
        <div>
          <p className="ds-kicker">Operator workspace</p>
          <h1 id={workspaceTitleId}>Portfolio workflows</h1>
          <p>
            This route exposes the supported operator surface for monitoring, alert triage, fleet
            reporting, saved filters, shared reports, and tenant governance workflows.
          </p>
        </div>
        <Link to="/" className="ds-button ds-button--secondary ds-button--md">
          Return to Home
        </Link>
      </header>

      <BuiltInViewsPanel
        activeView={activeViewId}
        onSelectView={handleSelectView}
        onClearView={handleClearView}
      />

      <div className="portfolio-workspace__search-grid">
        <PortfolioSearchPanel
          currentFilters={currentFilters}
          onFiltersChange={setCurrentFilters}
          activeView={activeView}
          onClearView={handleClearView}
        />
        <SavedFiltersPanel currentFilters={currentFilters} onLoadFilter={setCurrentFilters} />
      </div>

      <MonitoredDomainsPanel />
      <AlertsPanel />
      <LiveDrillsPanel />
      <SharedReportsPanel />
      <FleetReportsPanel />
      <FleetTapePanel />
      <TemplateOverridesPanel />
      <AuditLogPanel />

      <aside className="ds-panel ds-panel--muted portfolio-workspace__notice">
        Mail diagnostics and remediation requests are available from the Domain 360 mail tab. Domain
        notes and tags live on the Domain 360 overview surface. Saved filters drive the portfolio
        search workspace directly.
      </aside>
    </section>
  );
}
