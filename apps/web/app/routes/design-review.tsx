import { createFileRoute } from '@tanstack/react-router';
import { useId } from 'react';
import { AuthPending } from '../components/AuthPending.js';
import { requireAuthGuard } from '../lib/auth-guard.js';
import '../styles/design-review.css';

export const Route = createFileRoute('/design-review')({
  beforeLoad: async () => {
    await requireAuthGuard();
  },
  pendingComponent: AuthPending,
  component: DesignReview,
});

function DesignReview() {
  const signalRoomId = useId();
  const fieldManualId = useId();
  const controlDeckId = useId();
  const directions = [
    { id: signalRoomId, name: 'Signal Room', descriptor: 'Evidence-first triage' },
    { id: fieldManualId, name: 'Field Manual', descriptor: 'Investigation as a record' },
    { id: controlDeckId, name: 'Control Deck', descriptor: 'Command-oriented response' },
  ];

  return (
    <div className="design-review-shell">
      <header className="review-intro">
        <div>
          <p className="review-kicker">DNS Ops Workbench · designer review</p>
          <h1>Three ways to make evidence operational.</h1>
        </div>
        <p className="review-summary">
          A visual comparison for the Cases &amp; Signals workspace and its adjacent Domain 360
          evidence workflow. Interface records are illustrative—not connected to product data.
        </p>
      </header>

      <nav className="review-picker" aria-label="Design directions">
        {directions.map((direction) => (
          <a href={`#${direction.id}`} key={direction.id}>
            <span>{direction.name}</span>
            <small>{direction.descriptor}</small>
          </a>
        ))}
      </nav>

      <main>
        <SignalRoom sectionId={signalRoomId} />
        <FieldManual sectionId={fieldManualId} />
        <ControlDeck sectionId={controlDeckId} signalRoomId={signalRoomId} />
      </main>
    </div>
  );
}

function SignalRoom({ sectionId }: { sectionId: string }) {
  const titleId = useId();

  return (
    <section className="variation signal-room" id={sectionId} aria-labelledby={titleId}>
      <aside className="signal-rail" aria-label="Signal Room sections">
        <span className="signal-wordmark">DNS / OPS</span>
        <div className="signal-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="signal-rail-label">Cases</span>
      </aside>
      <div className="signal-content">
        <header className="signal-heading">
          <div>
            <p>Direction 01 · Workbench</p>
            <h2 id={titleId}>Signal Room</h2>
          </div>
          <button className="signal-button" type="button">
            Open case
          </button>
        </header>

        <div className="signal-layout">
          <section className="signal-queue" aria-label="Case queue">
            <div className="queue-title">
              <h3>Case queue</h3>
              <span>Illustrative</span>
            </div>
            <button type="button" className="case-row is-current">
              <span className="severity-dot" aria-hidden="true" />
              <span>
                <strong>Mail DNS posture requires review</strong>
                <small>domain.example · evidence is incomplete</small>
              </span>
              <b>Open</b>
            </button>
            <button type="button" className="case-row">
              <span className="severity-dot is-muted" aria-hidden="true" />
              <span>
                <strong>TLS baseline has not been accepted</strong>
                <small>domain.example · setup action</small>
              </span>
              <b>Setup</b>
            </button>
            <button type="button" className="case-row" disabled>
              <span className="severity-dot is-muted" aria-hidden="true" />
              <span>
                <strong>Additional queue data</strong>
                <small>Available when a tenant is connected</small>
              </span>
              <b>—</b>
            </button>
          </section>

          <article className="signal-detail">
            <div className="detail-topline">
              <p>CASE STATUS · OPEN</p>
              <button className="text-action" type="button">
                View history
              </button>
            </div>
            <h3>Mail DNS posture requires review</h3>
            <p className="detail-lede">
              The surface keeps a condition, its proof, and its disposition in one working view. It
              does not call missing coverage healthy.
            </p>
            <dl className="evidence-list">
              <div>
                <dt>Signal state</dt>
                <dd>
                  <span className="state-mark">●</span> Actionable unknown
                </dd>
              </div>
              <div>
                <dt>Evidence source</dt>
                <dd>Snapshot record · identifier pending</dd>
              </div>
              <div>
                <dt>Lifecycle rule</dt>
                <dd>Fresh evidence is required to resolve</dd>
              </div>
            </dl>
            <div className="case-actions">
              <button className="signal-button" type="button">
                Set disposition
              </button>
              <button className="signal-button secondary" type="button">
                Attach note
              </button>
            </div>
          </article>
        </div>

        <footer className="signal-footer">
          <span>Direction: narrow navigation, wide evidence canvas.</span>
          <span>Suitable for: sustained operator triage.</span>
        </footer>
      </div>
    </section>
  );
}

function FieldManual({ sectionId }: { sectionId: string }) {
  const titleId = useId();

  return (
    <section className="variation field-manual" id={sectionId} aria-labelledby={titleId}>
      <header className="manual-masthead">
        <p>Domain operations record · design direction 02</p>
        <div>
          <span>DNS OPS</span>
          <span>FIELD MANUAL</span>
          <span>Evidence issue</span>
        </div>
      </header>

      <article className="manual-article">
        <p className="manual-date">A case is not a dashboard tile.</p>
        <h2 id={titleId}>Field Manual</h2>
        <p className="manual-lede">
          This direction treats a domain investigation as a durable record: what was observed, what
          remains unknown, and what an operator may responsibly decide next.
        </p>

        <section className="manual-section">
          <h3>What the operator sees first</h3>
          <p>
            The condition is stated in plain language before controls appear. Coverage, source, and
            freshness are visible beside the conclusion so an unknown result cannot be mistaken for
            a clean one.
          </p>
          <div className="manual-note">
            <span>OBSERVATION</span>
            <p>
              Evidence completeness: <strong>not established</strong>
            </p>
          </div>
        </section>

        <section className="manual-section">
          <h3>What the operator can do</h3>
          <p>
            Accept an observed baseline, request a scan, or record a disposition. The action is
            secondary to the evidence chain rather than separated into a generic control panel.
          </p>
          <div className="manual-actions">
            <button type="button">Inspect evidence</button>
            <button type="button" className="manual-outline">
              Record disposition
            </button>
          </div>
        </section>

        <blockquote>
          “The visual system should make evidence absence legible—not paint it green.”
        </blockquote>

        <section className="manual-section">
          <h3>Where it belongs</h3>
          <p>
            Domain 360 history, baseline acceptance, and case detail share one reading rhythm.
            Portfolio remains the index; the individual domain remains the source record.
          </p>
        </section>
      </article>

      <footer className="manual-footer">
        <p>Make the operational record readable enough to trust.</p>
        <div>
          <span>DNS Ops Workbench</span>
          <span>Direction: long-form investigation</span>
        </div>
      </footer>
    </section>
  );
}

function ControlDeck({ sectionId, signalRoomId }: { sectionId: string; signalRoomId: string }) {
  const titleId = useId();

  return (
    <section className="variation control-deck" id={sectionId} aria-labelledby={titleId}>
      <header className="deck-command">
        <code>
          <span>&gt;</span> dns-ops <a href={`#${sectionId}`}>--cases</a>{' '}
          <a href={`#${sectionId}`}>--evidence</a> <a href={`#${sectionId}`}>--activity</a>
          <b aria-hidden="true">▮</b>
        </code>
      </header>

      <div className="deck-hero">
        <p>Direction 03 · Manifesto / terminal</p>
        <h2 id={titleId}>
          UNKNOWN IS A STATE.
          <br />
          NOT A PASS.
        </h2>
        <div className="deck-hero-copy">
          <p>
            A command-oriented operator surface for teams who investigate evidence gaps as actively
            as confirmed configuration faults.
          </p>
          <button type="button">Review case</button>
        </div>
      </div>

      <section className="deck-grid" aria-label="Control Deck case preview">
        <div className="deck-pane deck-pane-ink">
          <p>Current condition</p>
          <strong>Coverage incomplete</strong>
          <span>Domain evidence cannot support a clean finding.</span>
        </div>
        <div className="deck-pane">
          <p>Allowed next action</p>
          <strong>Request fresh scan</strong>
          <span>Operator action is recorded with tenant and actor context.</span>
        </div>
        <div className="deck-pane">
          <p>Lifecycle protection</p>
          <strong>Resolve with proof</strong>
          <span>Stale evidence cannot close a case.</span>
        </div>
      </section>

      <section className="deck-log" aria-label="Illustrative activity log">
        <div>
          <span>ACTIVITY / ILLUSTRATIVE</span>
          <span>STATUS</span>
        </div>
        <p>
          <code>case.open</code>
          <span>Awaiting operator disposition</span>
        </p>
        <p>
          <code>evidence.read</code>
          <span>Source retained with the case</span>
        </p>
        <p>
          <code>scan.request</code>
          <span>Requires tenant-scoped authorization</span>
        </p>
      </section>

      <footer className="deck-footer">
        <strong>DNS OPS</strong>
        <span>Evidence before automation.</span>
        <a href={`#${signalRoomId}`}>Return to directions</a>
      </footer>
    </section>
  );
}
