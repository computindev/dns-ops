# Redirect topology regression

## What the condition proves

A fresh bounded HTTP probe shows that an approved source URL no longer reaches its accepted canonical destination through the expected redirect topology.

## What it does not prove

It does not prove user impact from every geography, SEO loss, or malicious redirection. A timeout, blocked probe, stale baseline, or unvalidated redirect hop is `UNKNOWN` and belongs in setup/evidence.

## Deterministic evidence

- source URL and accepted baseline identifier;
- each status code and normalized `Location` target;
- per-hop DNS/IP safety validation;
- final URL, hop limit, timestamps, and truncation/error state.

## Purpose applicability

Applies to redirect-only domains and web domains with an explicitly declared canonical destination. Mail-only and undeclared domains are not automatically evaluated.

## Operator checks

1. Confirm the intended canonical URL with the domain owner.
2. Inspect CDN, edge, load-balancer, and application redirect rules.
3. Check whether a planned migration changed the accepted baseline.
4. Verify every redirect target remains organization-controlled.

## Safe next action

Use the owning platform's reviewed change and rollback process. Do not copy a generic redirect rule from DNS Ops.

## Verification

Resolve only after a newer probe matches the accepted source-to-destination topology. Reintroduction reopens the same condition without a duplicate case.

## Escalation boundary

Escalate redirects to unowned domains, loops, private-network targets, or authentication/token-bearing URLs. Stop probing when hop safety cannot be established.
