# DNS Ops — Domain Operations Product and MCP Discussion Brief

## The idea

DNS Ops should evolve from a DNS/mail workbench into a **Domain Operations Control Plane**.

> It helps the person or agent responsible for many domains understand what changed, what matters, why it happened, who must act, what can be changed safely and whether the issue was truly resolved.

This document is strategic context. It does not expand the authoritative Phase 0–1 scope.

## Why

A domain depends on many disconnected systems:

```text
Registrar
DNS
Hosting/CDN
Certificates
Email receiving
Email senders
Repositories
Analytics
Clients and owners
```

Most tools analyze only one layer. DNS Ops can correlate them and close the operational loop.

## Product loop

```text
Inventory
→ Observe
→ Deterministic facts
→ Policy evaluation
→ Signal
→ Investigation case
→ Explain
→ Simulate
→ Approve
→ Execute
→ Verify
```

## Architectural rule

- Software collects facts, detects signals, applies policy, simulates and verifies.
- One Lead Domain Analyst may later investigate ambiguous cases end to end.
- Narrow tools or subagents gather evidence, but do not make independent decisions.
- Humans own risk, approvals, product rules and future graph changes.
- Every result remains evidence-backed.
- `UNKNOWN` is valid and must be actionable.
- Every resolved case requires a fresh scan.

## MCP

DNS Ops should expose a remote MCP server so Buzz, ChatGPT, Claude, Codex and other agents can use it.

MCP is an **adapter** over the product core, not the location of business logic.

The approved Phase 0–1 MCP surface is narrower than the long-term option and is defined only by the execution contract.

Long-term candidate capabilities include:

```text
portfolio_list
domain_search
domain_get_profile
domain_get_posture
snapshot_compare
evidence_get
signal_list
case_get
case_list
case_open
case_set_disposition
scan_request
simulation_request
```

External writes later require:

- least-privilege scopes;
- tenant isolation;
- deterministic simulation;
- durable approval;
- idempotency;
- audit;
- fresh verification.

WebMCP is separate and optional later.

## Main conceptual pivot

Move from:

```text
finding → generic suggestion
```

to:

```text
signal → accountable case → verified resolution
```

## First internal outcome

An internal operator can:

1. open the domain portfolio;
2. see which cases need attention;
3. understand the issue in simple language;
4. inspect technical evidence;
5. record the next action;
6. request a rescan;
7. prove the case resolved or reopened.

First evidence surfaces:

- RDAP/expiration;
- DNS and mail;
- TLS;
- redirects;
- availability;
- selected headers;
- homepage robots/canonical/indexability.

## Commercial hypothesis

Likely future ICP:

- agencies;
- consultants;
- small MSPs;
- internal digital teams;

managing approximately 20–300 domains.

They do not need another score. They need:

- trusted signals;
- one coherent case;
- safe remediation;
- client-ready explanations;
- proof of resolution;
- recurring operational evidence.

Internal dogfooding cannot validate multi-human ownership, client communication or willingness to pay. Those require a later second-human design-partner pilot.

## Differentiation

DNS Ops can correlate across layers:

- certificate versus CAA;
- sender configuration versus SPF/DKIM/DMARC;
- canonical versus redirect versus sitemap;
- expiry versus renewal responsibility;
- deployment versus `noindex`;
- provider change versus regression;
- remediation versus fresh verification.

## What not to build now

- generic SEO suite;
- full attack-surface management;
- deep crawler;
- autonomous production writes;
- universal score;
- WebMCP requirement;
- a swarm of specialized reasoning agents;
- commercial ownership and client surfaces before external evidence.

## Recommended sequence

```text
Repository truth
→ trustworthy evidence
→ human case loop
→ deterministic MCP harness
→ connect Buzz later
→ one Lead Domain Analyst later
→ internal proof
→ controlled remediation
→ commercial pilots
```

## Decision sentence

> DNS Ops should be useful without AI, more powerful with an agent, and never less trustworthy because an agent is involved.
