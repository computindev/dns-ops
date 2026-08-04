# Mail DNS configuration regression

## What the condition proves

A fresh authoritative DNS observation for an approved mail test or managed mail name materially differs from its accepted baseline and matches the exact mail condition key.

## What it does not prove

It does not prove real-message delivery, sender authorization, recursive SPF compliance, DKIM signing behavior, or DMARC message outcomes. Missing authoritative evidence and unresolved SPF dependencies are setup/evidence gaps.

## Deterministic evidence

- exact queried name/type and accepted baseline;
- authoritative nameserver, response code, AA flag, TTL, answer, and time;
- recursive response only as supporting evidence;
- first-level SPF or RFC 9989 DMARC limitations where applicable.

## Purpose applicability

Applies only to declared mail domains and authorized non-production mail fixtures. It must not infer mail purpose from a record alone.

## Operator checks

1. Confirm domain purpose, provider, and authorized sender inventory.
2. Compare provider-issued values with authoritative evidence.
3. Check change history, TTL, propagation window, and rollback owner.
4. Treat DKIM selectors and report destinations as provider/operator evidence, never guesses.

## Safe next action

Follow the provider-confirmed playbook and normal reviewed DNS process. DNS Ops and MCP remain read-only and provide no ready-to-apply generic record.

## Verification

Resolve only after a newer authoritative observation clears the exact condition. Reintroduction reopens the same case.

## Escalation boundary

Escalate before any production mail change, when provider context is incomplete, or when authoritative servers disagree.
