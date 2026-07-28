# DNS Ops — Day 0 Worksheet

**Complete before the implementation agent changes code.**  
**Founder budget:** 2 hours for portfolio/manual baseline + 1.5 hours for purpose/criticality + 1 hour for test-asset authorization.

---

# A. Decision record

- Date:
- Authority SHA supplied to agent:
- Founder/operator:
- Maximum portfolio size: **30 domains**
- Selected test DNS provider:
- Selected non-production test zone:
- Test credential created and scoped only to that zone: [ ]
- Credential stored as runtime secret, not in Git: [ ]

---

# B. Current manual-work baseline

Use actual observed time where possible. The success gate requires at least four named checks to become automated or materially shorter.

| ID | Manual check | Current method/tool | Frequency per month | Minutes per run | Domains per run | Current evidence location | Keep/replace target |
|---|---|---|---:|---:|---:|---|---|
| MAN-01 | Domain expiration | Registrar dashboards / notes |  |  |  |  |  |
| MAN-02 | Nameserver/delegation and key DNS records | `dig`, provider UI |  |  |  |  |  |
| MAN-03 | SPF/DKIM/DMARC published configuration | Manual DNS/provider inspection |  |  |  |  |  |
| MAN-04 | TLS validity and expiration | Browser/provider/manual checker |  |  |  |  |  |
| MAN-05 | HTTP availability | Browser/curl/uptime tool |  |  |  |  |  |
| MAN-06 | HTTP/HTTPS + apex/`www` redirects | Browser/curl |  |  |  |  |  |
| MAN-07 | Homepage noindex/X-Robots-Tag/canonical | Source/headers/browser |  |  |  |  |  |
| MAN-08 | MTA-STS/TLS-RPT published configuration | DNS/manual checker |  |  |  |  |  |
| MAN-09 | Portfolio inventory/ownership notes | Sheets/docs/memory |  |  |  |  |  |
| MAN-10 | Other: |  |  |  |  |  |  |

## Baseline totals

```text
Estimated manual checks per month:
Estimated manual minutes per month:
Checks selected for replacement in Phase 0–1:
1.
2.
3.
4.
Optional 5.
```

---

# C. Initial portfolio — up to 30 domains

The rows below are starter candidates from known projects. Verify ownership/operational responsibility before including them. Planned or inactive domains should normally be excluded from the first live portfolio unless they test a specific `PARKED`/`UNKNOWN` case.

Allowed purpose:

```text
WEB | MAIL | WEB_AND_MAIL | REDIRECT | PARKED | UNKNOWN
```

Allowed criticality:

```text
HIGH | NORMAL | LOW
```

| # | Domain/host candidate | Include? | Purpose | Criticality | Responsible actor | Production/client? | Notes / why included |
|---:|---|:---:|---|---|---|---|---|
| 1 | computin.dev |  |  |  | Antonio |  |  |
| 2 | portail.cl |  |  |  | Antonio |  |  |
| 3 | producit.cl |  |  |  | Antonio |  |  |
| 4 | convertirleads.cl |  |  |  | Antonio |  |  |
| 5 | computincloudhosting.com |  |  |  | Antonio |  |  |
| 6 | domu.cl |  |  |  | Antonio |  |  |
| 7 | cafetape.cl |  |  |  |  |  |  |
| 8 | patagoniavirgin.com |  |  |  |  |  |  |
| 9 | cms.patagoniavirgin.com |  |  |  |  |  |  |
| 10 | nvnm.cl |  |  |  |  |  | Google Workspace/domain-role context |
| 11 | faunaprod.cl |  |  |  |  |  |  |
| 12 | fest.faunaprod.cl |  |  |  |  |  | SES sending subdomain |
| 13 | faunaprimaverafest.cl |  |  |  |  |  | Redirect/website context |
| 14 | jdf.cl |  |  |  |  |  | Mimecast/Microsoft 365 context |
| 15 | hilaria.cl |  |  |  |  | Client |  |
| 16 | corporativo.hilaria.cl |  |  |  |  | Client |  |
| 17 | matrimonios.hilaria.events |  |  |  |  | Client |  |
| 18 | agenciavio.cl |  |  |  |  | Client/candidate | Verify current operational responsibility |
| 19 | nivelando.cl |  |  |  | Antonio | Planned | Exclude if not registered/live |
| 20 | tufichamedia.cl |  |  |  | Antonio | Planned | Exclude if not registered/live |
| 21 |  |  |  |  |  |  |  |
| 22 |  |  |  |  |  |  |  |
| 23 |  |  |  |  |  |  |  |
| 24 |  |  |  |  |  |  |  |
| 25 |  |  |  |  |  |  |  |
| 26 |  |  |  |  |  |  |  |
| 27 |  |  |  |  |  |  |  |
| 28 |  |  |  |  |  |  |  |
| 29 |  |  |  |  |  |  |  |
| 30 |  |  |  |  |  |  |  |

## Selection rules

- Include only assets Computin is actually responsible for monitoring.
- Prefer registrable domains; include a subdomain separately only when it has a distinct operational purpose or provider path.
- Do not include planned domains merely to reach 30.
- Keep the first portfolio smaller when ownership or purpose is uncertain.
- Mark client/production assets as observation-only; they are never fault-injection targets.

---

# D. Controlled test assets

These must be non-production and have no client or real mail dependency.

| Variable | Selected value | Verified safe? | Notes |
|---|---|:---:|---|
| `DNSOPS_TEST_DOMAIN` |  |  |  |
| `DNSOPS_TEST_WEB_HOST` |  |  |  |
| `DNSOPS_TEST_MAIL_SUBDOMAIN` |  |  |  |
| `DNSOPS_TEST_ZONE_ID` |  |  |  |
| `DNSOPS_TEST_PROVIDER_KIND` |  |  |  |
| Provider token secret name |  |  | Do not paste token value |
| Token fingerprint |  |  |  |

## Safety confirmations

- [ ] No production traffic.
- [ ] No customer traffic.
- [ ] No real inbound/outbound mail dependency.
- [ ] Token restricted to exactly one test zone.
- [ ] Token has only minimum zone-read and DNS-mutation permission.
- [ ] Exact mutable hostnames/record types allowlisted.
- [ ] Baseline and rollback path documented.
- [ ] TTL 60 preparation can begin before Gate 3.
- [ ] Token revocation owner identified.

---

# E. Playbook calibration slots

The agent drafts; Antonio approves the operational truth.

| Playbook | Reviewer notes | Approved? |
|---|---|:---:|
| `domain-expiry.md` |  |  |
| `tls-regression.md` |  |  |
| `redirect-regression.md` |  |  |
| `indexability-regression.md` |  |  |
| `mail-dns-configuration-regression.md` |  |  |
| `unknown-evidence.md` |  |  |

---

# F. Day 0 completion gate

Do not start implementation until:

- [ ] At least four manual checks have real frequency and time estimates.
- [ ] The initial portfolio is selected; it does not need to contain 30 domains.
- [ ] Every included domain has purpose and criticality.
- [ ] Observation-only production/client domains are marked.
- [ ] Non-production test assets are selected.
- [ ] The scoped provider token is created and stored safely.
- [ ] The previous TTL values are known so TTL-60 propagation can be scheduled.
- [ ] Authority SHA is recorded.
