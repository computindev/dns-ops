# Signal Room Design System

The production interface uses Signal Room as its visual foundation: a cool, evidence-first operator surface with strong reading hierarchy and restrained cobalt actions.

## Source of truth

- `apps/web/app/styles/tokens.css` defines color, type, spacing, motion, radius, and elevation tokens.
- `apps/web/tailwind.config.js` exposes those tokens to Tailwind semantic utilities.
- `apps/web/app/styles/app.css` defines the shared primitives.

Use the semantic names (`surface`, `ink`, `muted`, `line`, `brand`, `success`, `warning`, `danger`, and `unknown`) rather than raw palette utilities in new operator UI.

## Foundations

- **Canvas and surfaces:** cool-tinted canvas, white work surface, and muted evidence surface.
- **Typography:** Space Grotesk for operational UI; IBM Plex Mono only for metadata, identifiers, and compact labels.
- **Evidence status:** `unknown` is visually distinct from `success`. Partial evidence must use `unknown`, never a healthy status treatment.
- **Motion:** button feedback is limited to background-color and one-pixel press movement. Focus rings are immediate and visible.

## Primitives

| Primitive | API / class | Use |
| --- | --- | --- |
| Button | `Button` | Actions with primary, secondary, danger, or quiet hierarchy; supports default, hover, focus, active, disabled, loading, error, and success states. |
| Panel | `ds-panel`, `ds-panel--muted` | One containment level for data or supporting evidence. |
| Badge | `ds-badge ds-badge--<tone>` | Compact status labels using `neutral`, `info`, `success`, `warning`, `danger`, or `unknown`. |
| Kicker | `ds-kicker` | Short operational metadata, not decorative section labels. |
| Input | `ds-input` | Form fields with stable borders, immediate focus ring, disabled, and invalid states. |

## Adoption order

1. Cases & Signals queue and case detail.
2. Domain 360 evidence, baseline acceptance, and history.
3. Portfolio operational panels.
4. Auth and administrative surfaces.

The system intentionally does not alter data contracts, authorization behavior, or existing route responsibilities.
