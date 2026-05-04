import { t as te, f as fc, m as mc, y as ye, p as pc, F as Fo, $ as $o } from '../nitro/nitro.mjs';
export { b as AlertRepository, e as AuditEventRepository, j as DkimSelectorRepository, r as DomainNoteRepository, M as DomainTagRepository, V as FindingRepository, n as LegacyAccessLogRepository, A as MailEvidenceRepository, L as MismatchReportRepository, s as MonitoredDomainRepository, a as ObservationRepository, c as ProviderBaselineRepository, x as RecordSetRepository, l as RemediationRepository, d as RulesetVersionRepository, g as SavedFilterRepository, h as ShadowComparisonRepository, o as SharedReportRepository, i as SimpleDatabaseAdapter, k as SnapshotRepository, S as SuggestionRepository, _ as TemplateOverrideRepository, q as adjudicationEnum, u as alertStatusEnum, v as alerts, w as auditActionEnum, z as auditEvents, B as baselineStatusEnum, C as blastRadiusEnum, D as collectionStatusEnum, E as confidenceEnum, G as createAdapterFromConfig, H as createClient, I as createD1Adapter, J as createD1Client, K as createPostgresAdapter, N as createPostgresClient, O as createSimpleAdapter, T as dkimSelectors, P as domainNotes, Q as domainTags, R as domains, U as fieldComparisonStatusEnum, X as findings, W as fleetReportStatusEnum, Y as isDbError, Z as legacyAccessLogs, a0 as legacyToolTypeEnum, a1 as mailEvidence, a2 as mailProviderEnum, a3 as mapDatabaseError, a4 as mismatchReports, a5 as monitoredDomains, a6 as monitoringScheduleEnum, a7 as observations, a8 as parseSSLConfig, a9 as partitionDbResults, aa as probeStatusEnum, ab as probeTypeEnum, ac as providerBaselines, ad as recordSets, ae as remediationPriorityEnum, af as remediationRequests, ag as remediationStatusEnum, ah as resultStateEnum, ai as riskPostureEnum, aj as rulesetVersions, ak as savedFilters, al as selectorConfidenceEnum, am as selectorProvenanceEnum, an as sessions, ao as severityEnum, ap as shadowComparisons, aq as shadowStatusEnum, ar as sharedReportStatusEnum, as as sharedReportVisibilityEnum, at as sharedReports, au as snapshots, av as suggestions, aw as templateOverrides, ax as toNotFoundError, ay as toTenantIsolationError, az as unwrapDbResultOr, aA as users, aB as vantageTypeEnum, aC as zoneManagementEnum } from '../nitro/nitro.mjs';
import { Result } from 'better-result';
export { Result } from 'better-result';
import { eq } from 'drizzle-orm';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:async_hooks';
import 'vinxi/lib/invariant';
import 'vinxi/lib/path';
import 'node:url';
import '@tanstack/router-core';
import 'hono';
import 'drizzle-orm/pg-core';
import 'hono/factory';
import 'drizzle-orm/d1';
import 'drizzle-orm/node-postgres';
import 'events';
import 'util';
import 'crypto';
import 'dns';
import 'fs';
import 'net';
import 'tls';
import 'path';
import 'stream';
import 'string_decoder';
import 'node:fs/promises';
import '@node-rs/argon2';
import 'react/jsx-runtime';
import '@tanstack/react-query';
import '@tanstack/react-router';
import 'react';
import 'react-dom';
import '@tanstack/history';
import 'node:stream';
import 'react-dom/server';
import 'node:stream/web';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
class R {
  constructor(e) {
    __publicField(this, "repo");
    this.repo = e;
  }
  async findByIdResult(e) {
    return fc(() => this.repo.findById(e), "Domain", e);
  }
  async findByNameResult(e, t) {
    const s = await fc(() => t ? this.repo.findByNameAndTenant(e, t) : this.repo.findByName(e), "Domain", e);
    return t && s.isOk() ? mc(s.value, s.value.tenantId, t, "Domain") : s;
  }
  async findByNameForTenantResult(e, t) {
    const s = await this.repo.findByNameForTenant(e, t);
    if (!s) {
      const a = await this.repo.findByName(e);
      return (a == null ? void 0 : a.tenantId) && a.tenantId !== t ? Result.err(ye.tenantIsolation("Domain", t, a.tenantId)) : Result.err(ye.notFound("Domain", `${e} (tenant: ${t})`));
    }
    return Result.ok(s);
  }
  async createResult(e) {
    if (!e.name) return Result.err(new ye({ message: "Domain name is required", code: "CONSTRAINT_VIOLATION", table: "Domain", operation: "create" }));
    if (e.tenantId) {
      if (await this.repo.findByNameAndTenant(e.name, e.tenantId)) return Result.err(ye.alreadyExists("Domain", `${e.name} (tenant: ${e.tenantId})`));
    } else {
      const t = await this.repo.findByName(e.name);
      if (t && !t.tenantId) return Result.err(ye.alreadyExists("Domain", `${e.name} (global)`));
    }
    return pc(() => this.repo.create(e), (t) => new ye({ message: t instanceof Error ? t.message : "Failed to create domain", code: "QUERY_FAILED", table: "Domain", operation: "create" }));
  }
  async findOrCreateResult(e) {
    return pc(() => this.repo.findOrCreate(e), (t) => new ye({ message: t instanceof Error ? t.message : "Failed to find or create domain", code: "QUERY_FAILED", table: "Domain", operation: "findOrCreate" }));
  }
  async updateResult(e, t) {
    return await this.repo.findById(e) ? fc(() => this.repo.update(e, t), "Domain", e) : Result.err(ye.notFound("Domain", e));
  }
  async updateForTenantResult(e, t, s) {
    const a = await this.findByIdResult(e);
    if (a.isErr()) return a;
    const o = mc(a.value, a.value.tenantId, s, "Domain");
    return o.isErr() ? o : fc(() => this.repo.update(e, t), "Domain", e);
  }
  async deleteResult(e) {
    return fc(() => this.repo.delete(e), "Domain", e);
  }
  async deleteForTenantResult(e, t) {
    const s = await this.findByIdResult(e);
    if (s.isErr()) return s;
    const a = mc(s.value, s.value.tenantId, t, "Domain");
    return a.isErr() ? a : fc(() => this.repo.delete(e), "Domain", e);
  }
  async searchByNameResult(e, t) {
    return pc(() => this.repo.searchByName(e, t), (s) => new ye({ message: s instanceof Error ? s.message : "Search failed", code: "QUERY_FAILED", table: "Domain", operation: "search" }));
  }
  async findAllResult(e, t) {
    return pc(() => this.repo.findAll(e, t), (s) => new ye({ message: s instanceof Error ? s.message : "Find all failed", code: "QUERY_FAILED", table: "Domain", operation: "findAll" }));
  }
}
function V(p) {
  return new R(p);
}
class q {
  constructor(e) {
    __publicField(this, "db");
    this.db = e;
  }
  async findById(e) {
    return await this.db.selectOne(Fo, eq(Fo.id, e)) || null;
  }
  async findByTenant(e, t = 100) {
    return (await this.db.selectWhere(Fo, eq(Fo.tenantId, e))).sort((a, o) => {
      const y = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      return (o.createdAt ? new Date(o.createdAt).getTime() : 0) - y;
    }).slice(0, t);
  }
  async findByTenantAndStatus(e, t, s = 100) {
    return (await this.findByTenant(e, s * 2)).filter((o) => o.status === t).slice(0, s);
  }
  async create(e) {
    return this.db.insert(Fo, e);
  }
  async markProcessing(e) {
    return await this.db.update(Fo, { status: "processing", startedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }, eq(Fo.id, e)), this.findById(e);
  }
  async complete(e, t, s) {
    return await this.db.update(Fo, { status: "completed", summary: t, domainResults: s, completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }, eq(Fo.id, e)), this.findById(e);
  }
  async markFailed(e, t) {
    return await this.db.update(Fo, { status: "failed", errorMessage: t, completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }, eq(Fo.id, e)), this.findById(e);
  }
  async delete(e) {
    return await this.db.delete(Fo, eq(Fo.id, e)), true;
  }
  async countByStatus(e) {
    const t = await this.findByTenant(e, 1e3), s = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const a of t) s[a.status] = (s[a.status] || 0) + 1;
    return s;
  }
}
class $ {
  constructor(e) {
    __publicField(this, "db");
    this.db = e;
  }
  async findById(e) {
    return await this.db.selectOne($o, eq($o.id, e)) || null;
  }
  async findBySnapshotId(e) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).sort((s, a) => {
      const o = s.hostname.localeCompare(a.hostname);
      return o !== 0 ? o : s.probeType.localeCompare(a.probeType);
    });
  }
  async findBySnapshotAndType(e, t) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).filter((a) => a.probeType === t).sort((a, o) => a.hostname.localeCompare(o.hostname));
  }
  async findByHostname(e, t) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).filter((a) => a.hostname === t);
  }
  async findSuccessfulSmtpProbes(e) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).filter((s) => s.probeType === "smtp_starttls" && s.success);
  }
  async findFailedProbes(e) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).filter((s) => !s.success);
  }
  async findSlowProbes(e, t) {
    return (await this.db.selectWhere($o, eq($o.snapshotId, e))).filter((a) => a.responseTimeMs !== null && a.responseTimeMs >= t);
  }
  async findByTimeRange(e, t) {
    return (await this.db.select($o)).filter((a) => a.probedAt >= e && a.probedAt <= t);
  }
  async create(e) {
    return this.db.insert($o, e);
  }
  async createMany(e) {
    return e.length === 0 ? [] : this.db.insertMany($o, e);
  }
  async countByStatus(e) {
    const t = await this.db.selectWhere($o, eq($o.snapshotId, e)), s = { success: 0, timeout: 0, refused: 0, error: 0, other: 0 };
    for (const a of t) switch (a.status) {
      case "success":
        s.success++;
        break;
      case "timeout":
        s.timeout++;
        break;
      case "refused":
        s.refused++;
        break;
      case "error":
        s.error++;
        break;
      default:
        s.other++;
    }
    return s;
  }
  async getSummary(e) {
    const t = await this.db.selectWhere($o, eq($o.snapshotId, e)), s = {};
    let a = 0, o = 0, y = 0, f = 0;
    for (const m of t) s[m.probeType] = (s[m.probeType] || 0) + 1, m.success ? y++ : f++, m.responseTimeMs !== null && (a += m.responseTimeMs, o++);
    return { total: t.length, successful: y, failed: f, byType: s, avgResponseTimeMs: o > 0 ? Math.round(a / o) : null };
  }
}
class E {
  constructor(e) {
    __publicField(this, "repo");
    this.repo = e;
  }
  async findByIdResult(e) {
    return fc(() => this.repo.findById(e), "Snapshot", e);
  }
  async findByDomainResult(e, t) {
    return pc(() => this.repo.findByDomain(e, t), (s) => new ye({ message: s instanceof Error ? s.message : "Failed to find snapshots", code: "QUERY_FAILED", table: "Snapshot", operation: "findByDomain", identifier: e }));
  }
  async findLatestByDomainResult(e) {
    const t = await this.repo.findLatestByDomain(e);
    return Result.ok(t);
  }
  async requireLatestByDomainResult(e) {
    const t = await this.repo.findLatestByDomain(e);
    return t ? Result.ok(t) : Result.err(ye.notFound("Snapshot", `latest for domain: ${e}`));
  }
  async findRecentByDomainResult(e, t) {
    return pc(() => this.repo.findRecentByDomain(e, t), (s) => new ye({ message: s instanceof Error ? s.message : "Failed to check recent snapshot", code: "QUERY_FAILED", table: "Snapshot", operation: "findRecentByDomain", identifier: e }));
  }
  async createResult(e) {
    return e.domainId ? pc(() => this.repo.create(e), (t) => new ye({ message: t instanceof Error ? t.message : "Failed to create snapshot", code: "QUERY_FAILED", table: "Snapshot", operation: "create" })) : Result.err(new ye({ message: "Domain ID is required", code: "CONSTRAINT_VIOLATION", table: "Snapshot", operation: "create" }));
  }
  async updateErrorResult(e, t) {
    const s = await this.findByIdResult(e);
    return s.isErr() ? s : fc(() => this.repo.updateError(e, t), "Snapshot", e);
  }
  async updateDurationResult(e, t) {
    const s = await this.findByIdResult(e);
    return s.isErr() ? s : fc(() => this.repo.updateDuration(e, t), "Snapshot", e);
  }
  async updateRulesetVersionResult(e, t) {
    const s = await this.findByIdResult(e);
    return s.isErr() ? s : fc(() => this.repo.updateRulesetVersion(e, t), "Snapshot", e);
  }
  async listResult(e) {
    return pc(() => this.repo.list(e), (t) => new ye({ message: t instanceof Error ? t.message : "Failed to list snapshots", code: "QUERY_FAILED", table: "Snapshot", operation: "list" }));
  }
  async countByDomainResult(e) {
    return pc(() => this.repo.countByDomain(e), (t) => new ye({ message: t instanceof Error ? t.message : "Failed to count snapshots", code: "QUERY_FAILED", table: "Snapshot", operation: "countByDomain", identifier: e }));
  }
  async findNeedingBackfillResult(e, t) {
    return pc(() => this.repo.findNeedingBackfill(e, t), (s) => new ye({ message: s instanceof Error ? s.message : "Failed to find backfill candidates", code: "QUERY_FAILED", table: "Snapshot", operation: "findNeedingBackfill" }));
  }
}
function j(p) {
  return new E(p);
}

export { ye as DbError, te as DomainRepository, R as DomainRepositoryResults, q as FleetReportRepository, $ as ProbeObservationRepository, E as SnapshotRepositoryResults, pc as dbResult, fc as dbResultOrNotFound, mc as ensureTenantIsolation, Fo as fleetReports, $o as probeObservations, V as withDomainResults, j as withSnapshotResults };
//# sourceMappingURL=index-BHdYYgJK.mjs.map
