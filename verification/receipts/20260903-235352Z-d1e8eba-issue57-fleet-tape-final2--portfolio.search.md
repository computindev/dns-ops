---
receipt: verification-receipt/v0
run_id: 20260903-235352Z-d1e8eba-issue57-fleet-tape-final2
feature_id: portfolio.search
profile: critical
surface: web
sha: d1e8eba230b1fe15fc9e46db3f6dd0727dd2d05b
code_digest: df21e5b5817695a1d8e2b20c9f6ed7648e9a83a7f9e914897223f96c6f3a7a13
dirty: false
untracked: 0
status: passed
reason: ""
verifier: builder
verifier_session: ""
evidence_dir: verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2
created_at: 2026-09-03T23:54:13.533Z
---

# Receipt: portfolio.search — passed

## Observations (expected → seen)
- `/portfolio` showed **Portfolio workflows**, **Portfolio Search**, and **Built-in views**; the Query field accepted input → confirmed by the live drive on the final rebased tree (which also renders the new 24h fleet tape panel).
- Filling Query fired a real `POST /api/portfolio/search` returning HTTP 200 JSON with `domains[]` → readback captured.
- **Mail broken** button issued a real POST with `findingTypePrefix: "mail."` and `severities: ["high","critical"]`; **Expiring evidence** with `snapshotOlderThanDays: 30`; **Incomplete coverage** with `coverage: "incomplete"`, button exposed `aria-pressed="true"`, and re-activation cleared view criteria → captured in `readback/built-in-view-requests.json`.
- Doctor reported web health HTTP 200 healthy before the drive; server served this exact worktree (cwd verified).
- This drive validates the `portfolio.search` surface affected by the issue #57 diff: `apps/web/app/routes/portfolio.tsx` (FleetTapePanel mount) and `apps/web/hono/routes/portfolio.ts` (GET `/api/portfolio/tape`). The fleet tape digest itself is covered by focused unit tests (`apps/web/hono/lib/fleet-tape.test.ts`, 5 cases: window filter, tenant isolation, first-snapshot flag, diff counts, newest-first sort), the MCP tool contract test (12 tools, read-only DOMAIN_READ), and the auth-policy matrix entry for `/api/portfolio/tape`.

## Forbidden (… → confirmed absent)
- Sign-in warning used as success → absent; local e2e tenant/actor headers returned authenticated results.
- Class selectors → harness used semantic roles/labels only.
- DNS apply/write paths → fleet tape is read-only; no mutations issued.

## Read-back
- `readback/portfolio-search.json` and `readback/built-in-view-requests.json` contain real request/response JSON.
- `trace.zip`, `portfolio-search.png`, `video/*.webm`, `console.log`, and `failed-requests.log` captured from the live drive.

## Notes
- First drive attempt after the rebase hit the known 15s wait-for-response flake on the "cleared" roundtrip (cold HMR recompile); second drive passed. Harness is unchanged from master HEAD.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/console.log | log | aux · unrecognized .log | 7cd79c949d09e30b0051eb276be41dc440aebb8576b8428a1b6fcb6b72bc8684 |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/env.txt | env | aux | 9fdbf2331b4e3021f0b90386172d73033ddb546cd1601e82c8c9f90862fd090c |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/failed-requests.log | log | aux · unrecognized .log | 036d0082daab1199eb409e21e7350449a1805899047a255063ab81a721b0fd0d |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/observations.md | md | aux · unrecognized .md | 29a4f2f1d3efa3c8b486189e5cf3dea4b02a03f76fe4e8ac85fc6aeeaf366c33 |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/portfolio-search.png | png | evidence · 1280x5229 | 8ac844a4935ab26d7e49495a3567eb0f501eec5b773edc17db06eac72bc3a1fa |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/readback/built-in-view-requests.json | readback | evidence | f9f1bf24c3395369ef8a06f51b03c9a1d9b795827f0cecec78ef3d1db3145458 |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/readback/portfolio-expiry.json | readback | evidence | 3baf0f4ac8437ab13fbd5302b75f34259ba6b933606a39e89d7b822651528e34 |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/readback/portfolio-search.json | readback | evidence | 6e6cd88049738c49f0179aaa770c1b287ff5d86669d3822aec9fe91a7b0e3ab0 |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/trace.zip | trace | evidence · playwright trace | 1de5cbd670b84b93a3bf5d13081b7d5ad370a0d8944b16d1315c023973486a7b |
| verification/runs/20260903-235352Z-d1e8eba-issue57-fleet-tape-final2/video/15fc11b30753b8e8f79d045cb084b9cc.webm | video | evidence | 06258a5d60c59bf4968e215a7831b77f7028d66fac717cfc22c9e1686eff1010 |
