# Session Closeout — 2026-05-04 — Web Deployment Rollercoaster

## 1) TL;DR

- **Fixed `safeSuggestions is not defined` runtime error** in `MailFindingsPanel.tsx` — variable was referenced inside `MailFindingCard` (separate function scope) where it didn't exist.
- **Spent entire session fighting Railway deployment** — Railpack cache was immovable, committed `.output/` contained macOS-native `argon2` binary that crashed on Linux, and the web service eventually crashed/disappeared entirely.
- **Settled on Dockerfile builder** (`apps/web/Dockerfile.railway`) for full Linux-native builds — but couldn't verify because Railway CLI auth expired during service recreation attempts.
- **Collector (`dns-ops`) remains healthy** — `https://dns-ops-production.up.railway.app` is Online.
- **Web service is MISSING** from Railway project — needs to be recreated via dashboard.

## 2) Goals vs Outcome

**Planned goals**
- Fix `safeSuggestions is not defined` runtime error on domain mail tab
- Deploy fix and verify it works end-to-end on live site

**What actually happened**
- Source fix committed and correct (`7f3f7197`)
- ~15 deployment attempts across Railpack, committed `.output/`, Dockerfile, config file permutations
- Web service eventually crashed so hard it disappeared from `railway service list`
- Railway CLI auth expired mid-session, blocking non-interactive service recreation
- Fix never made it to a working live deployment

## 3) Key decisions (with rationale)

- **Decision: Remove committed `.output/` from git entirely**
  - **Why:** It contained a macOS-only `argon2.darwin-arm64.node` binary that crashed the app on Railway's Linux containers.
  - **Tradeoff:** Can no longer deploy pre-built artifacts; must build on Railway (slower but correct).
  - **Status:** confirmed

- **Decision: Switch web service to Dockerfile builder (`apps/web/Dockerfile.railway`)**
  - **Why:** Full control over multi-stage Linux build (`oven/bun` builder stage → `node:20-slim` runtime). Eliminates cross-platform native binary issues and Railpack cache problems.
  - **Tradeoff:** Slower builds, more config to maintain.
  - **Status:** tentative — Dockerfile exists but service was destroyed before it could be verified

- **Decision: Remove root `railway.toml`**
  - **Why:** It was overriding per-service config and causing deploy failures.
  - **Status:** confirmed

- **Decision: Stop at auth boundary instead of trying more CLI permutations**
  - **Why:** `railway login` is explicitly unsupported in non-interactive mode. Wasting tokens on flag permutations is counterproductive.
  - **Status:** confirmed

## 4) Work completed (concrete)

- `7f3f7197` — `fix: scope safeSuggestions to MailFindingsPanel only, MailFindingCard uses its own suggestions prop`
  - File: `apps/web/app/components/MailFindingsPanel.tsx`
  - Changed 3 lines: defined `safeSuggestions` at component top-level, passed it to child; reverted `MailFindingCard` to use its own `suggestions` prop

- `3cc1cd21` — `fix: remove stale .output/ from git — was causing Railpack to skip rebuild`
- `e27b72df` — `chore: add build-id to force fresh Railpack build`
- `b67645b` — `chore: force railpack rebuild by modifying buildCommand`
- `8fca4e43` — `fix: revert buildCommand change, remove build-id`
- `fa54239d` — `fix: include built .output/ for Railway deployment`
- `7c2c89b5` — `fix: remove .output/ and railpack.json to force fresh Railpack build`
- `7355f877` — `fix: commit pre-built .output/ with safeSuggestions fix, skip Railpack build`
- `7d25d562` — `fix: restore railpack.json and railway.toml to working config`
- `fb2d6a7d` — `chore: bust Railpack build cache`
- `4102b232` — `fix: switch web to Dockerfile builder for reliable builds`
- `82f5d985` — `fix: remove root railway.toml to prevent service config interference`
- `c5d89050` — `fix: commit fresh local build, remove Dockerfile config`
- `d6503d3d` — `fix: restore railpack.json with no-op build`
- `aaa2ccd3` — `fix: use Dockerfile builder for Linux-compatible builds`
  - Added `apps/web/Dockerfile.railway`
  - Added `apps/web/railway.toml`
  - Removed `apps/web/railpack.json`
  - Removed all committed `.output/` artifacts

## 5) Changes summary (diff-level, not raw)

**Added:**
- `apps/web/Dockerfile.railway` — multi-stage Dockerfile: `oven/bun:1.3.13-slim` builder → `node:20-slim` production
- `apps/web/railway.toml` — configures Dockerfile builder + healthcheck

**Changed:**
- `apps/web/app/components/MailFindingsPanel.tsx` — fixed scope bug (`safeSuggestions` only in panel, not card)
- `apps/web/package.json` — `_cacheBust` field added then removed

**Removed:**
- `apps/web/.output/` — all 100k+ lines of committed build artifacts (including macOS `argon2` binary)
- `apps/web/railpack.json` — removed after Railpack cache proved unbustable
- Root `railway.toml` — was interfering with per-service config

**Behavioral impact:**
- Source code fix is correct but never reached production
- Web app is completely offline (service destroyed)

**Migration/rollout notes:**
- Next deploy must use Dockerfile builder, not Railpack
- Must set env vars on new web service: `DATABASE_URL`, `COLLECTOR_URL`, `BETTER_AUTH_SECRET`, `WEB_DOMAIN`

## 6) Open items / Next steps (actionable)

| Task | Owner | Priority | Approach | Blockers |
|------|-------|----------|----------|----------|
| Create new `web` service in Railway dashboard | user | P0 | Dashboard → New Service → GitHub repo `antonioc-cl/dns-ops` | Railway CLI auth expired |
| Configure builder = Dockerfile, path = `apps/web/Dockerfile.railway` | user | P0 | Service Settings → Builder | Service must exist first |
| Set environment variables on web service | user | P0 | Copy from old service or Postgres connection string | Service must exist first |
| Add public domain to web service | user | P0 | Settings → Networking → Generate Domain | Service must exist first |
| Verify `safeSuggestions` fix on live `/domain/stripe.com?tab=mail` | agent/user | P0 | Load page, check console for errors | Web service must be online |
| Systematic audit of all `.filter`/`.map` on API data | agent | P1 | grep + add `Array.isArray()` guards | None |
| Verify collector rate-limit UX ("wait 60s" message) | agent | P1 | Trigger collection twice rapidly | None |
| Add `.output/` and `*.node` to `.gitignore` permanently | agent | P1 | Edit `.gitignore` | None |
| Set up Railway API token for headless service management | user | P2 | Railway dashboard → Account → Tokens | None |

## 7) Risks & gotchas

- **Web service is completely missing** — not just crashed, but absent from `railway service list`. Must be recreated from scratch.
- **macOS-native binary contamination** — any future committed `.output/` will reintroduce the crash risk. Must keep `.output/` out of git.
- **Railway CLI auth is flaky** — session expired mid-work. Don't rely on it for critical operations without a fallback (API token).
- **Railpack cache is per-service and persistent** — even file deletions don't invalidate cached git-tree hashes. Only service recreation guarantees clean state.
- **Root `railway.toml` overrides per-service configs** — if reintroduced, it will break the Dockerfile builder config.

## 8) Testing & verification

**What was tested:**
- Local build: `bun run build --filter=@dns-ops/web` succeeds
- Source grep: `safeSuggestions` only appears in `MailFindingsPanel` scope, not `MailFindingCard`
- Asset grep: built JS contains `Array.isArray` calls (fix is in compiled output)

**What was NOT tested:**
- Live domain page with mail tab (service is offline)
- Auto-collection end-to-end flow
- Rate-limit error message display

**Suggested test plan for next session:**
1. Create web service via dashboard
2. Deploy, wait for "Online"
3. `curl -s https://web-production-XXXX.up.railway.app/domain/stripe.com | head`
4. Login, navigate to `/domain/stripe.com?tab=mail`
5. Open browser console, verify no `safeSuggestions is not defined`
6. Click "Collect Now" twice rapidly, verify "wait 60s" message

## 9) Notes for the next agent

- **If you only read one thing:** The web service does not exist. You cannot debug deployment issues by changing code — you must create the service first via Railway dashboard (CLI auth is broken).
- **Source fix is done and correct** — `MailFindingsPanel.tsx` at `7f3f7197`. Don't touch it again unless a *different* error appears.
- **Current repo state:** `master` branch, `aaa2ccd3` is HEAD. Dockerfile + railway.toml exist. `.output/` is NOT in git.
- **Collector is healthy:** `https://dns-ops-production.up.railway.app` — use it for `COLLECTOR_URL`.
- **Postgres is healthy:** service ID `edec61ed-1585-4210-a6d8-86d27f72f5dc`.
- Historical production credentials were removed. Use approved runtime-only secret management and rotate any previously exposed value.
- **Avoid:** Railpack builder, committing `.output/`, root `railway.toml`, `railpack.json`.
- **Prefer:** Dockerfile builder, dashboard for service creation, API tokens for headless ops.
