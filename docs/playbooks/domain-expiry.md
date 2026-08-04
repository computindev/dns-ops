# Domain expiry

## What the condition proves

A fresh RDAP observation reports that the registered domain expiration event is within the configured warning threshold and the event timestamp is later than the observation timestamp.

## What it does not prove

It does not prove registrar auto-renew status, billing health, registry grace-period behavior, or that renewal will fail. Missing, redacted, inconsistent, or stale RDAP data is `UNKNOWN`, not an expiry signal.

## Deterministic evidence

- normalized domain and RDAP authority queried;
- response status and observation time;
- expiration event value and source field;
- evidence freshness and threshold used.

## Purpose applicability

Applies to every registered domain in the approved portfolio, including redirect-only and observation-only domains. Public suffixes and unregistered test names are not applicable.

## Operator checks

1. Confirm the domain is in the approved portfolio.
2. Confirm the RDAP response belongs to the exact domain.
3. Check the registrar directly for renewal state, payment method, and registry lock.
4. Identify the renewal owner.

## Safe next action

Contact the declared renewal owner with the observed date and threshold. Do not change registrar settings or payment details through DNS Ops.

## Verification

Resolve only after a newer successful RDAP observation reports an expiration date outside the threshold or an operator dismisses the case with documented non-applicability.

## Escalation boundary

Escalate immediately when the date is inside the critical threshold, ownership is unknown, or registrar evidence conflicts with RDAP. DNS Ops remains read-only.
