# Builder evidence — issue #74 SMTP STARTTLS trust follow-up

- **Base**: `052f21ef161e3b826e578536760fe662684e96c3` (clean PR tip requested)
- **Applied authorized fixes**: local commit `fe5f593bd7d66460eeaff5b908391b290afa6ab6` (status gate, string-valued SMTP `authorizationError`, repository regression coverage)
- **Code commit under test**: `d6a41951584cc2f19796d76e9d5ddd0571585e60`
- **Code digest**: `0f13a8092a42e9ecc969bb1c81e4bd16be4962829f3eac538d7bbf5cab0886d5`
- **Builder run**: `20260902-143549Z-d6a4195-smtp-starttls-trust-final`
- **Scope**: local isolated managed worktree only; no canonical edits, push, PR, deploy, provider mutation, or credentials.

## Verification surface

The dedicated critical feature is `smtp.starttls-trust` (`surface: api`, mapped in `.agents/skills/verify-dns-ops/features/smtp.starttls-trust.md`). The project-local helper `.agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts` drives the real collector Hono route authorization tests, SMTP/TLS production functions, persistence mapper, and `ProbeObservationRepository`. Deterministic fixtures replace only DNS, TCP, TLS, and persistence external boundaries. `ENABLE_ACTIVE_PROBES=false` is forced for the helper; no provider host or credential is reachable.

The helper's evidence is retained at:

- `verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/cli-collector-trust-tests.txt`
- `verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/cli-built-repository-proof.txt`
- `verification/runs/20260902-143549Z-d6a4195-smtp-starttls-trust-final/readback/verification-boundaries.json`

## Coverage observed

- Valid trusted STARTTLS: negotiated TLS, `success:true`, `tlsTrusted:true`, chain and hostname authorization true; command transcript contains only EHLO/STARTTLS/QUIT.
- Expired, hostname-mismatch, and untrusted-chain certificates: diagnostic certificate retained, trust false, error preserved, and no QUIT on untrusted TLS.
- String and `Error` authorization diagnostics: `DEPTH_ZERO_SELF_SIGNED_CERT` and `certificate has expired` preserved by the SMTP/TLS paths.
- Forged and legacy persisted rows: all repository read boundaries fail closed while preserving diagnostics; trusted and non-SMTP controls remain successful.
- Contradictory status: complete trust fields with `status:'timeout'` remains unsuccessful, keeps timeout status/error, and is excluded from successful queries/counts.
- Negative invariants: no AUTH/MAIL FROM/RCPT TO/DATA commands; SSRF special/private/loopback/IPv6 answers create no socket; checked public IP is pinned; DNS/connect/banner/EHLO/STARTTLS/TLS cumulative deadlines destroy sockets; route rejects missing/stale/untrusted evidence, caller DNS arrays, foreign hostnames, and non-25 ports.
- Independent read-back: built repository proof checks by-id, snapshot/type, hostname, failed, slow, time-range, status counts, summary, and mapper output; adapter rows remain unchanged. Route tests independently inspect response JSON, adapter state, probe invocation count, and tenant allowlist state.

## Quality gates

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` | OK, 1319 packages installed |
| `bun run build` | OK, Turbo 8/8 tasks |
| `bunx vitest run` | OK, 189 files passed, 3 skipped; 3008 passed, 54 skipped |
| `bun run test` | OK; same Vitest result, controlled-live harness 45 passed, migrations 1 skipped, verify-kit test passed |
| `bun run typecheck` | OK, Turbo 14/14 tasks |
| `bun run lint` | OK, Turbo 8/8 tasks |
| `VERIFY_RUN_DIR=... bun .agents/skills/verify-dns-ops/harness/smtp-starttls-trust.mts` | OK, 6 focused files, 134 tests passed; built proof ALL CHECKS PASSED |
| `node .agents/verify-kit/verify.mjs features` | OK; `smtp.starttls-trust` listed as critical API feature |
| `node .agents/verify-kit/verify.mjs lint-map --fresh` | OK, 0 errors (24 existing route-looking warnings) |
| `node .agents/verify-kit/verify.mjs lint-selectors` | OK, 5 files, 0 errors |
| `git diff --check` | OK |
| `ubs --diff .` | 0 critical; 2 intentional warnings for `rejectUnauthorized:false` in diagnostic TLS fixtures/production path, required to retain invalid-certificate evidence before explicit trust evaluation |
| `ubs --staged` | OK when the implementation commit was staged; no changed files after commit |

## Receipt status

`verification/receipts/20260902-143549Z-d6a4195-smtp-starttls-trust-final--smtp.starttls-trust.md` is a **builder** receipt only and is provisional. No fresh receipt was fabricated. The critical feature still requires an independent fresh verifier at the exact final code tree before merge.
