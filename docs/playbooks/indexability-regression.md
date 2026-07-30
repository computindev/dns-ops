# Homepage indexability regression

## What the condition proves

A fresh bounded homepage observation differs from the accepted baseline by exposing an indexing prohibition, currently an applicable `X-Robots-Tag` or HTML robots meta directive containing `noindex`.

## What it does not prove

It does not prove that a search engine has indexed or removed a page, that rankings changed, or that canonical metadata controls indexing. Fetch failures and ambiguous parser results are setup/evidence gaps, not regressions.

## Deterministic evidence

- requested and final URL with redirect trace;
- HTTP status, observation time, and bounded body size;
- normalized `X-Robots-Tag` values;
- parsed robots meta directives;
- accepted baseline identifier.

## Purpose applicability

Applies only to public web domains declared indexable. Private applications, parked pages, redirect-only domains, and intentionally non-indexed sites are not applicable.

## Operator checks

1. Confirm the page is intended for public indexing.
2. Inspect edge headers, templates, CMS settings, and deployment changes.
3. Verify the directive applies to the relevant crawler or all crawlers.
4. Confirm the accepted baseline is still valid.

## Safe next action

Use the web owner's reviewed deployment process. DNS Ops does not modify headers, HTML, robots files, or CMS configuration.

## Verification

Resolve only after a newer observation no longer reproduces the exact indexability condition.

## Escalation boundary

Escalate when purpose is unclear, directives conflict by layer, or removing a directive could expose private content.
