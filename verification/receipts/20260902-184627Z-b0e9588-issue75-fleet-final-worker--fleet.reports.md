---
receipt: verification-receipt/v0
run_id: 20260902-184627Z-b0e9588-issue75-fleet-final-worker
feature_id: fleet.reports
profile: critical
surface: web
sha: b0e9588a5ffc4616a441c9084906ee190761a3d2
code_digest: 9ec167f0d4027f7f012b1304203e78ed6633ea605391ae594c31843ad65e3f85
dirty: false
untracked: 1
status: passed
reason: ""
verifier: fresh
verifier_session: ""
evidence_dir: verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker
created_at: 2026-09-02T18:48:13.237Z
---

# Receipt: fleet.reports — passed

# Fleet reports verification

- Real local web UI at http://127.0.0.1:3320/portfolio with local collector and PostgreSQL; no provider calls.
- API report: 6 domains, 0 errors, unknownChecks=22, domainsWithIssues=2, SPF pass=1/fail=1/unknown=4.
- stale/partial/uncorrelated/never-evaluated were UNKNOWN-only with zero issues; clean PASS; broken FAIL.
- CSV import returned 200 and normalized/deduplicated two domains.
- Unauthenticated run returned 401; foreign tenant saw zero domains; malformed inventory returned 400; duplicate reads were equivalent.
- UI rendered Unknown summary and UNKNOWN/PASS/FAIL badges; screenshots and trace captured.
- Independent DB read-back confirmed persisted evidence; external browser origins were blocked (2 requests), provider side effects were absent.

## Artifacts

| path | kind | check | sha256 |
|---|---|---|---|
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/console.log | log | aux · unrecognized .log | f73abb046204c591d676339b8f4d7b45bf371070e73de3198e612a54ab5bcc5e |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/env.txt | env | aux | 490c87c238e99fc5421145feda11ef9fdc99611ef7ade205250227b045090e90 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/external-blocked.txt | txt | aux · unrecognized .txt | d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/failed-requests.log | log | aux · unrecognized .log | fa4d8b98d9aab887fe48c3880af0a0492989bab25552038456bc4f53cbf8fc1c |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/fleet-report-collapsed.png | png | evidence · 1280x4142 | 92e1153225888bcf5219d10f13aa806d0015f65b11b0daf0325165c0c67768d9 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/fleet-report-expanded.png | png | evidence · 1280x4538 | 0e830ba473e5dc9588af3add493c494abdc5798bbeb8bf9f96e09342faae8de9 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/01-fleet-report-run.json | http | evidence | e7851169ba3743407a5f3a19c4063936372900edba63dfe0b76228dc9feee59c |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/02-csv-import.json | http | evidence | dc84e00fd077d2a5592e2d46333e1d8f65d522e6d164f3919fef60409a081ba7 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/03-malformed-inventory.json | http | evidence | 3cec81cc3af40e3c893bda12df999d68eee702e971c349af01319d25fc9def44 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/04-unauthenticated.json | http | evidence | eaccb35951868d028cb5f68d01ab4a76c204764407d79046e03a651937e4496b |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/05-foreign-tenant.json | http | evidence | ba5ce90ba18da90fa03e368cccc4980b7c5779b25e38186c70226ef9f5a726c3 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/06-duplicate-1.json | http | evidence | c0465243ffd6e4cba9a3801e06e9f33f1f7167ce5599650e93a7fab6c1a72786 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/http/07-duplicate-2.json | http | evidence | 15cf522a2676bf77e0425028b38feebfce12520e54955533759a701d7a25e269 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/observations.md | md | aux · unrecognized .md | d4a137e22c01e3891d3e5785a35974aec57584b3953d4d27ec4930937a3da3a2 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/readback/fleet-fixture-db.json | readback | evidence | 6d7a3e269d763b77f9b7517a7ef01e50670ba833f017dfb6e821474856ba0e98 |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/readback/fleet-report-badges.json | readback | evidence | 723a0e394e2364b279f9128cb436545640474635755683f536e71b6fbc1a481e |
| verification/runs/20260902-184627Z-b0e9588-issue75-fleet-final-worker/trace.zip | trace | evidence · playwright trace | afbd170f4f78fea5dc1094acb36205ce8b6981d66319afeac8e15d7ceb4bf8ce |
