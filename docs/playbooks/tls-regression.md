# TLS certificate regression

## What the condition proves

A fresh, allowlisted TLS probe for the declared HTTPS endpoint differs materially from its accepted baseline, such as failed hostname validation, expiration, or a shorter-than-approved validity window.

## What it does not prove

It does not prove compromise, private-key exposure, CA fault, or failure from every network. A failed or stale probe without a comparable baseline is a setup/evidence gap.

## Deterministic evidence

- exact hostname, port, resolved public address, and probe time;
- TLS handshake and hostname-verification result;
- certificate validity dates, issuer, subject/SAN, and fingerprint;
- accepted baseline identifier and comparison result.

## Purpose applicability

Applies only to domains declared to serve HTTPS on the probed hostname. Parked, mail-only, and observation-only names may be not applicable.

## Operator checks

1. Verify endpoint purpose and ownership.
2. Confirm the probe target was allowlisted and public.
3. Compare CDN/load-balancer and origin certificates where applicable.
4. Check renewal automation and recent deployment changes.

## Safe next action

Use the certificate owner's deployment and rollback process. DNS Ops supplies evidence only and does not issue, install, or rotate certificates.

## Verification

Resolve only after a newer successful probe no longer reproduces the exact condition key. Reproducing the regression reopens the same case.

## Escalation boundary

Escalate on expiration, hostname mismatch, trust failure, or unclear ownership. Never disable certificate validation as remediation.
