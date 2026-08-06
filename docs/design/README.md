# DNS Ops — Design Review & Token Starter

Generated **2026-08-06** from `origin/master` (`c94890e`) as a hand-off package for the design team.

## Files

| File | What it is | Owner |
|---|---|---|
| `routes-and-tokens-review.html` | Polished, self-contained review: current token system + every route mapped to a job-to-be-done + UI-status matrix + priority recommendations. **Open this in a browser.** | Designers (review) |
| `design-tokens.css` | The token foundation — `:root` CSS custom properties for color, radius, shadow, spacing, typography, motion. Encodes the de-facto palette already in use and **consolidates the amber/yellow warning split**. | Designers (values) |
| `tailwind.extend.js` | Ready-to-paste Tailwind v3 `theme.extend` that exposes the tokens as utilities (`bg-brand`, `text-success`, `border-warning`, …). Additive — no existing class breaks. | Engineers (wiring) |

## What the review found (TL;DR)

1. **No formal token system exists today** — `tailwind.config.js` has an empty `extend`; the app runs on raw Tailwind defaults + ~30 lines of `app.css`. `design-tokens.css` is the proposed foundation.
2. **Warning color is split** between `amber` and `yellow` — consolidate to the single `--color-warning-*` scale.
3. **All page routes have UI** (Home, Login, Portfolio, Domain 360 with 5 tabs).
4. **The biggest functional UI gap is the Cases/Signals workspace** — the full signal→case→disposition→reopen lifecycle exists in the API/DB with no operator surface.
5. Other API-only surfaces needing a design decision: ruleset admin, migrate/health console, baseline-acceptance flow, signup page, shadow comparison, legacy tools, provider templates, MCP explorer.

## Status legend (used in the HTML matrix)

- **Built** — UI exists and is wired.
- **Partial** — surfaced indirectly; needs a dedicated surface.
- **API-only** — backend exists, no UI; needs a design decision.

## Adoption (engineers)

```js
// apps/web/tailwind.config.js
import { dnsOpsExtend } from '../../docs/design/tailwind.extend.js';
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: { ...dnsOpsExtend } },
  plugins: [],
};
```

```css
/* apps/web/app/styles/app.css — add as the FIRST line */
@import './tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

This is additive and non-breaking; new semantic utilities become available alongside existing classes.
