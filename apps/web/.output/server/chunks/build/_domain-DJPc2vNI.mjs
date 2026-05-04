import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useState, useId, useCallback, useEffect } from 'react';
import { u, p, x } from './StateDisplay-DMFHryPA.mjs';
import { aE as ve$1, aF as xe, aG as Mt } from '../nitro/nitro.mjs';
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
import 'better-result';
import 'drizzle-orm/pg-core';
import 'drizzle-orm';
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
import '@tanstack/react-router';
import 'react-dom';
import '@tanstack/history';
import 'node:stream';
import 'react-dom/server';
import 'node:stream/web';

function Ne(t) {
  return t == null ? "UNKNOWN" : { 0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED", 6: "YXDOMAIN", 7: "YXRRSET", 8: "NXRRSET", 9: "NOTAUTH", 10: "NOTZONE" }[t] || `RCODE_${t}`;
}
function ve(t) {
  if (!t) return "";
  const a = [];
  return t.authoritative && a.push("aa"), t.truncated && a.push("tc"), t.recursionDesired && a.push("rd"), t.recursionAvailable && a.push("ra"), t.authenticated && a.push("ad"), t.checkingDisabled && a.push("cd"), a.join(" ");
}
function ee(t) {
  const a = t.name.endsWith(".") ? t.name : `${t.name}.`;
  if (t.type === "MX" && t.priority !== void 0) return `${a}	${t.ttl}	IN	${t.type}	${t.priority}	${t.data}`;
  if (t.type === "SOA") {
    const s = t.data.split(" ");
    return `${a}	${t.ttl}	IN	${t.type}	${s.join("	")}`;
  }
  return `${a}	${t.ttl}	IN	${t.type}	${t.data}`;
}
function we(t, a = {}) {
  var _a, _b, _c;
  const { showComments: s = true, showQuestion: n = true } = a, i = [];
  s && (i.push(`; <<>> DNS Ops Workbench <<>> ${t.queryName} ${t.queryType}`), i.push("; (1 server found)"), i.push(";; global options: +cmd"), i.push(";; Got answer:"));
  const l = Ne(t.responseCode), c = ve(t.flags), g = ((_a = t.answerSection) == null ? void 0 : _a.length) || 0, d = ((_b = t.authoritySection) == null ? void 0 : _b.length) || 0, o = ((_c = t.additionalSection) == null ? void 0 : _c.length) || 0;
  if (i.push(`;; ->>HEADER<<- opcode: QUERY, status: ${l}, id: ${t.id.slice(0, 4)}`), i.push(`;; flags: ${c}; QUERY: 1, ANSWER: ${g}, AUTHORITY: ${d}, ADDITIONAL: ${o}`), n) {
    i.push(""), i.push(";; QUESTION SECTION:");
    const h = t.queryName.endsWith(".") ? t.queryName : `${t.queryName}.`;
    i.push(`;${h}		IN	${t.queryType}`);
  }
  if (g > 0) {
    i.push(""), i.push(";; ANSWER SECTION:");
    for (const h of t.answerSection || []) i.push(ee(h));
  }
  if (d > 0) {
    i.push(""), i.push(";; AUTHORITY SECTION:");
    for (const h of t.authoritySection || []) i.push(ee(h));
  }
  if (o > 0) {
    i.push(""), i.push(";; ADDITIONAL SECTION:");
    for (const h of t.additionalSection || []) i.push(ee(h));
  }
  return i.push(""), i.push(`;; Query time: ${t.responseTimeMs || 0} msec`), i.push(`;; SERVER: ${t.vantageIdentifier || t.vantageType}#53`), i.push(`;; WHEN: ${new Date(t.queriedAt).toString()}`), i.push(`;; MSG SIZE rcvd: ${Ce(t)}`), i.join(`
`);
}
function Se(t, a) {
  return t.map((s) => we(s, a)).join(`

; ========================================

`);
}
function Ce(t) {
  let a = 12;
  a += t.queryName.length + 4;
  for (const s of t.answerSection || []) a += s.name.length + s.data.length + 12;
  for (const s of t.authoritySection || []) a += s.name.length + s.data.length + 12;
  for (const s of t.additionalSection || []) a += s.name.length + s.data.length + 12;
  return a;
}
function ke(t) {
  var _a;
  const a = /* @__PURE__ */ new Map();
  for (const s of t) {
    const n = `${s.queryName.toLowerCase()}|${s.queryType}`;
    a.has(n) || a.set(n, []), (_a = a.get(n)) == null ? void 0 : _a.push(s);
  }
  return a;
}
function $e(t) {
  const a = [];
  for (const s of t) s.type === "MX" && s.priority !== void 0 ? a.push(`${s.priority} ${s.data}`) : a.push(s.data);
  return [...new Set(a)];
}
function Ee(t, a) {
  if (t.length !== a.length) return false;
  const s = [...t].sort(), n = [...a].sort();
  return s.every((i, l) => i === n[l]);
}
function De(t) {
  const a = ke(t), s = [];
  for (const [n, i] of a) {
    const [l, c] = n.split("|"), g = i.filter((u) => u.status === "success"), d = i.filter((u) => u.status !== "success"), o = [], h = [], S = [], N = /* @__PURE__ */ new Map();
    for (const u of g) {
      const b = u.vantageIdentifier || u.vantageType;
      h.push(b), S.push(u.id);
      const $ = $e(u.answerSection || []);
      o.push(...$), N.set(b, $);
    }
    for (const u of d) {
      const b = u.vantageIdentifier || u.vantageType;
      h.push(`${b} (${u.status})`), S.push(u.id);
    }
    const x = [...new Set(o)];
    let D = true;
    const f = [];
    if (N.size > 1) {
      const u = N.values().next();
      if (u.value) {
        const b = u.value;
        for (const [, $] of N) if (!Ee(b, $)) {
          D = false, f.push("Values differ across vantages");
          break;
        }
      }
    }
    if (d.length > 0) {
      const u = [...new Set(d.map((b) => b.status))];
      f.push(`Failures from ${d.length} vantage(s): ${u.join(", ")}`), D = false;
    }
    const y = g.flatMap((u) => (u.answerSection || []).map((b) => b.ttl)).filter((u) => u !== void 0), C = y.length > 0 ? Math.round(y.reduce((u, b) => u + b, 0) / y.length) : 0;
    s.push({ name: l, type: c, ttl: C, values: x, sourceVantages: [...new Set(h)], sourceObservationIds: S, isConsistent: D, consolidationNotes: f.length > 0 ? f.join("; ") : void 0 });
  }
  return s;
}
function Re(t) {
  var _a;
  const a = /* @__PURE__ */ new Map();
  for (const i of t) a.has(i.type) || a.set(i.type, []), (_a = a.get(i.type)) == null ? void 0 : _a.push(i);
  const s = ["SOA", "NS", "A", "AAAA", "CNAME", "MX", "TXT", "CAA"], n = /* @__PURE__ */ new Map();
  for (const i of s) {
    const l = a.get(i);
    l && n.set(i, l);
  }
  for (const [i, l] of a) n.has(i) || n.set(i, l);
  return n;
}
function Te(t, a) {
  switch (t) {
    case "MX": {
      const s = a.match(/^(\d+)\s+(.+)$/);
      return s ? `${s[2]} (priority: ${s[1]})` : a;
    }
    case "SOA": {
      const s = a.split(" ");
      return s.length >= 2 ? `Primary: ${s[0]}, Contact: ${s[1]}` : a;
    }
    case "TXT":
      return a.replace(/^"/, "").replace(/"$/, "");
    default:
      return a;
  }
}
function Ae(t) {
  return { A: "IPv4 Address", AAAA: "IPv6 Address", CNAME: "Canonical Name", MX: "Mail Exchange", NS: "Name Server", SOA: "Start of Authority", TXT: "Text", CAA: "Certification Authority Authorization", PTR: "Pointer", SRV: "Service" }[t] || t;
}
async function Ie(t) {
  const [a, s] = await Promise.all([fetch(`/api/snapshot/${t}/delegation`, { credentials: "include" }), fetch(`/api/snapshot/${t}/delegation/issues`, { credentials: "include" })]);
  if (!a.ok) throw new Error(`Failed to load delegation: ${a.status} ${a.statusText}`);
  if (!s.ok) throw new Error(`Failed to load delegation issues: ${s.status} ${s.statusText}`);
  const [n, i] = await Promise.all([a.json(), s.json()]);
  return { delegation: n.delegation || null, issues: i.issues || [] };
}
function Fe({ snapshotId: t }) {
  const [a, s] = useState(null), { data: n, isLoading: i, error: l } = useQuery({ queryKey: ["delegation", t], queryFn: () => Ie(t), enabled: !!t });
  if (!t) return jsx("div", { "data-testid": "delegation-no-snapshot-state", children: jsx(x, { icon: "globe", title: "No delegation data available", description: "Collect a DNS snapshot to view delegation analysis.", size: "sm" }) });
  if (i) return jsx("div", { "data-testid": "delegation-loading-state", children: jsx(u, { message: "Loading delegation data..." }) });
  if (l) return jsx("div", { "data-testid": "delegation-error-state", children: jsx(p, { message: l.message }) });
  if (!(n == null ? void 0 : n.delegation)) return jsx("div", { "data-testid": "delegation-no-data-state", children: jsx(x, { icon: "globe", title: "No delegation data available", description: "Delegation collection may not have been enabled for this snapshot." }) });
  const { delegation: c, issues: g } = n;
  return jsxs("div", { className: "space-y-6", "data-testid": "delegation-panel", children: [g.length > 0 && jsx("div", { className: "space-y-3", children: g.map((d) => jsx(Me, { issue: d, isExpanded: a === `${d.type}-${d.severity}-${d.description}`, onToggle: () => s(a === `${d.type}-${d.severity}-${d.description}` ? null : `${d.type}-${d.severity}-${d.description}`) }, `${d.type}-${d.severity}-${d.description}`)) }), jsxs("section", { children: [jsx("h4", { className: "font-medium text-gray-900 mb-3", children: "Parent Zone Delegation" }), jsx("div", { className: "bg-gray-50 rounded-lg p-4", children: jsxs("div", { className: "grid grid-cols-2 gap-4", children: [jsxs("div", { children: [jsx("span", { className: "text-sm text-gray-500", children: "Domain" }), jsx("p", { className: "font-mono text-sm", children: c.domain })] }), jsxs("div", { children: [jsx("span", { className: "text-sm text-gray-500", children: "Parent Zone" }), jsx("p", { className: "font-mono text-sm", children: c.parentZone })] })] }) })] }), jsxs("section", { children: [jsx("h4", { className: "font-medium text-gray-900 mb-3", children: "Name Servers" }), jsx("div", { className: "space-y-2", children: c.nameServers.length > 0 ? c.nameServers.map((d) => jsxs("div", { className: "flex items-center justify-between p-3 bg-white border rounded-lg", children: [jsx("code", { className: "font-mono text-sm", children: d.name }), jsxs("span", { className: "text-xs text-gray-500", children: ["via ", d.source] })] }, `${d.name}-${d.source}`)) : jsx("p", { className: "text-sm text-gray-500", children: "No name servers found" }) })] }), jsxs("section", { children: [jsx("h4", { className: "font-medium text-gray-900 mb-3", children: "Glue Records" }), c.glue.length > 0 ? jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: c.glue.map((d) => jsxs("div", { className: "p-3 bg-white border rounded-lg", children: [jsx("div", { className: "font-mono text-sm", children: d.name }), jsxs("div", { className: "flex items-center gap-2 mt-1", children: [jsx("span", { className: `text-xs px-2 py-0.5 rounded ${d.type === "A" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`, children: d.type }), jsx("code", { className: "text-sm text-gray-600", children: d.address })] })] }, `${d.name}-${d.type}-${d.address}`)) }) : jsx("p", { className: "text-sm text-gray-500", children: "No glue records found" })] }), jsxs("section", { className: "flex items-center gap-3 pt-4 border-t", children: [jsx(de, { label: "DNSSEC", status: c.hasDnssec ? "present" : "absent", color: c.hasDnssec ? "green" : "gray" }), jsx(de, { label: "Divergence", status: c.hasDivergence ? "detected" : "none", color: c.hasDivergence ? "red" : "green" })] })] });
}
function Me({ issue: t, isExpanded: a, onToggle: s }) {
  var _a, _b;
  const n = t.evidence && t.evidence.length > 0, i = { critical: { bg: "bg-red-50 border-red-200", dot: "bg-red-500" }, high: { bg: "bg-orange-50 border-orange-200", dot: "bg-orange-500" }, medium: { bg: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" }, low: { bg: "bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" } }, l = i[t.severity] || i.medium;
  return jsxs("div", { className: `rounded-lg border ${l.bg}`, children: [jsx("div", { className: "p-4", children: jsxs("div", { className: "flex items-start gap-3", children: [jsx("div", { className: `w-2 h-2 rounded-full mt-2 ${l.dot}` }), jsxs("div", { className: "flex-1", children: [jsx("h4", { className: "font-medium text-gray-900", children: t.description }), jsxs("p", { className: "text-sm text-gray-600 mt-1 capitalize", children: [t.type.replace(/-/g, " "), " \u2022 ", t.severity, " severity"] })] }), n && jsxs("button", { type: "button", onClick: s, className: "text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1", children: [jsx("svg", { "aria-hidden": "true", className: `w-4 h-4 transition-transform ${a ? "rotate-180" : ""}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) }), "Evidence"] })] }) }), a && n && jsxs("div", { className: "border-t border-gray-200 bg-white/50 p-4", children: [jsxs("h5", { className: "text-xs font-medium text-gray-500 uppercase mb-3", children: ["Observation Evidence (", (_a = t.evidence) == null ? void 0 : _a.length, ")"] }), jsx("div", { className: "space-y-3", children: (_b = t.evidence) == null ? void 0 : _b.map((c) => jsx(Pe, { evidence: c }, `${c.queryName}-${c.queryType}-${c.source}-${c.status}`)) })] })] });
}
function Pe({ evidence: t }) {
  const [a, s] = useState(false), n = { success: "bg-green-100 text-green-700", error: "bg-red-100 text-red-700", timeout: "bg-yellow-100 text-yellow-700", nodata: "bg-gray-100 text-gray-600" };
  return jsxs("div", { className: "p-3 bg-white rounded border border-gray-200", children: [jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { className: "flex-1 min-w-0", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx("code", { className: "text-sm font-mono text-gray-900", children: t.queryName }), jsx("span", { className: "px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium", children: t.queryType }), jsx("span", { className: `px-1.5 py-0.5 text-xs rounded font-medium ${n[t.status] || "bg-gray-100 text-gray-600"}`, children: t.status })] }), jsxs("p", { className: "text-xs text-gray-500 mt-1", children: ["Source: ", jsx("span", { className: "font-medium", children: t.source })] })] }), t.data && jsx("button", { type: "button", onClick: () => s(!a), className: "text-xs text-blue-600 hover:text-blue-700 ml-2", children: a ? "Hide" : "Raw" })] }), a && t.data && jsx("div", { className: "mt-2 p-2 bg-gray-900 rounded text-xs overflow-x-auto", children: jsx("pre", { className: "text-gray-100 font-mono whitespace-pre-wrap", children: JSON.stringify(t.data, null, 2) }) })] });
}
function de({ label: t, status: a, color: s }) {
  return jsxs("div", { className: `px-3 py-1.5 rounded-lg text-sm ${{ green: "bg-green-100 text-green-800", red: "bg-red-100 text-red-800", gray: "bg-gray-100 text-gray-800" }[s]}`, children: [jsxs("span", { className: "font-medium", children: [t, ":"] }), " ", jsx("span", { className: "capitalize", children: a })] });
}
function Le({ snapshotId: t }) {
  const { data: a = [], isLoading: s, error: n } = useQuery({ queryKey: ["selectors", t], queryFn: async () => {
    var _a;
    return (_a = (await (await fetch(`/api/snapshot/${t}/selectors`)).json()).selectors) != null ? _a : [];
  }, enabled: !!t });
  return s ? jsx(u, { message: "Discovering DKIM selectors...", size: "sm" }) : n ? jsx(p, { message: n.message, size: "sm" }) : a.length === 0 ? jsxs("div", { className: "text-sm text-gray-500", children: [jsx("p", { children: "No DKIM selectors discovered yet." }), jsx("p", { className: "mt-1", children: "This may indicate:" }), jsxs("ul", { className: "list-disc ml-5 mt-1", children: [jsx("li", { children: "No DKIM configured for this domain" }), jsx("li", { children: "Selectors use non-standard names" }), jsx("li", { children: "Provider not in detection database" })] })] }) : jsxs("div", { className: "space-y-3", children: [a.map((i) => jsxs("div", { className: `p-3 rounded-lg border ${i.found ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`, children: [jsxs("div", { className: "flex items-center justify-between", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsxs("code", { className: "text-sm font-mono font-medium", children: [i.selector, "._domainkey"] }), i.found && jsx("span", { className: "text-green-600", children: jsx("svg", { className: "w-4 h-4", fill: "currentColor", viewBox: "0 0 20 20", "aria-hidden": "true", focusable: "false", children: jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z", clipRule: "evenodd" }) }) })] }), jsx(qe, { confidence: i.confidence })] }), jsxs("div", { className: "mt-2 text-xs text-gray-600", children: [jsx("span", { className: "font-medium", children: "Source:" }), " ", Oe(i.provenance), i.provider && jsxs("span", { className: "ml-2 text-blue-600", children: ["(", i.provider, ")"] })] })] }, i.selector)), jsx("p", { className: "text-xs text-gray-500 mt-3", children: "Selectors discovered using a 5-level precedence strategy (managed config \u2192 operator supplied \u2192 provider heuristic \u2192 common dictionary \u2192 not found)." })] });
}
function qe({ confidence: t }) {
  const a = { certain: "bg-green-100 text-green-800", high: "bg-blue-100 text-blue-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-orange-100 text-orange-800", heuristic: "bg-gray-100 text-gray-600" };
  return jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${a[t] || a.heuristic}`, children: t });
}
function Oe(t) {
  return { "managed-zone-config": "Managed zone configuration", "operator-supplied": "Operator supplied", "provider-heuristic": "Provider heuristic detection", "common-dictionary": "Common selector dictionary", "not-found": "Not found" }[t] || t;
}
const q = [{ id: "parsed", label: "Parsed", description: "Structured record view" }, { id: "raw", label: "Raw", description: "Complete response data" }, { id: "dig", label: "Dig", description: "CLI-style output" }];
function je({ observations: t }) {
  const [a, s] = useState("parsed"), n = useId(), i = (d) => `${n}-dns-view-tab-${d}`, l = (d) => `${n}-dns-view-panel-${d}`, c = (d) => {
    requestAnimationFrame(() => {
      var _a;
      (_a = document.getElementById(i(d))) == null ? void 0 : _a.focus();
    });
  };
  return jsxs("div", { children: [jsx(Be, { current: a, onChange: s, onKeyDown: (d, o) => {
    if (d.key === "ArrowRight") {
      d.preventDefault();
      const h = q[(o + 1) % q.length];
      s(h.id), c(h.id);
      return;
    }
    if (d.key === "ArrowLeft") {
      d.preventDefault();
      const h = (o - 1 + q.length) % q.length, S = q[h];
      s(S.id), c(S.id);
      return;
    }
    if (d.key === "Home") {
      d.preventDefault();
      const h = q[0];
      s(h.id), c(h.id);
      return;
    }
    if (d.key === "End") {
      d.preventDefault();
      const h = q[q.length - 1];
      s(h.id), c(h.id);
    }
  }, getTabId: i, getPanelId: l }), jsxs("div", { className: "mt-4", children: [jsx("div", { role: "tabpanel", id: l("parsed"), "aria-labelledby": i("parsed"), hidden: a !== "parsed", children: a === "parsed" && jsx(ze, { observations: t }) }), jsx("div", { role: "tabpanel", id: l("raw"), "aria-labelledby": i("raw"), hidden: a !== "raw", children: a === "raw" && jsx(Ke, { observations: t }) }), jsx("div", { role: "tabpanel", id: l("dig"), "aria-labelledby": i("dig"), hidden: a !== "dig", children: a === "dig" && jsx(Ue, { observations: t }) })] })] });
}
function Be({ current: t, onChange: a, onKeyDown: s, getTabId: n, getPanelId: i }) {
  return jsx("div", { className: "rounded-lg bg-gray-100 p-1", role: "tablist", "aria-label": "DNS view mode", children: jsx("div", { className: "flex space-x-1", children: q.map((l, c) => jsx("button", { type: "button", id: n(l.id), role: "tab", "aria-selected": t === l.id, "aria-controls": i(l.id), tabIndex: t === l.id ? 0 : -1, onClick: () => a(l.id), onKeyDown: (g) => s(g, c), className: `focus-ring flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${t === l.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`, title: l.description, children: l.label }, l.id)) }) });
}
function ze({ observations: t }) {
  const a = De(t), s = Re(a);
  return a.length === 0 ? jsx("div", { className: "text-center py-8 text-gray-500", children: "No successful observations to display" }) : jsx("div", { className: "space-y-6", children: Array.from(s.entries()).map(([n, i]) => jsxs("section", { className: "border rounded-lg overflow-hidden", children: [jsx("div", { className: "bg-gray-50 px-4 py-2 border-b", children: jsxs("h4", { className: "font-semibold text-gray-900", children: [n, " Records", jsxs("span", { className: "ml-2 text-sm font-normal text-gray-500", children: ["(", i.length, ") \xB7 ", Ae(n)] })] }) }), jsx("div", { className: "overflow-x-auto", children: jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [jsx("thead", { className: "bg-gray-50", children: jsxs("tr", { children: [jsx("th", { scope: "col", className: "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase", children: "Name" }), jsx("th", { scope: "col", className: "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase", children: "TTL" }), jsx("th", { scope: "col", className: "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase", children: "Value" }), jsx("th", { scope: "col", className: "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase", children: "Sources" }), jsx("th", { scope: "col", className: "px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase", children: "Status" })] }) }), jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: i.map((l) => jsxs("tr", { children: [jsx("td", { className: "px-4 py-2 text-sm font-mono text-gray-900", children: l.name }), jsx("td", { className: "px-4 py-2 text-sm text-gray-600 tabular-nums", children: l.ttl !== null && l.ttl !== void 0 ? `${l.ttl}s` : "\u2014" }), jsx("td", { className: "px-4 py-2 text-sm", children: jsx("div", { className: "space-y-1", children: l.values.map((c) => {
    const g = typeof c == "string" ? c : JSON.stringify(c);
    return jsx("div", { className: "font-mono text-gray-800", children: Te(l.type, c) }, `${l.name}-${l.type}-${g}`);
  }) }) }), jsx("td", { className: "px-4 py-2 text-sm text-gray-600", children: l.sourceVantages.join(", ") }), jsx("td", { className: "px-4 py-2", children: l.isConsistent ? jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800", children: "Consistent" }) : jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800", title: l.consolidationNotes, children: "Divergent" }) })] }, `${l.name}-${l.type}-${l.values.join(",")}`)) })] }) })] }, n)) });
}
function Ke({ observations: t }) {
  return jsx("div", { className: "space-y-4", children: t.map((a) => {
    var _a;
    return jsxs("details", { className: "border rounded-lg overflow-hidden", open: a.status !== "success", children: [jsx("summary", { className: "bg-gray-50 px-4 py-2 cursor-pointer hover:bg-gray-100", children: jsxs("div", { className: "flex items-center justify-between", children: [jsxs("span", { className: "font-medium", children: [a.queryName, " ", a.queryType, jsxs("span", { className: "ml-2 text-sm text-gray-500", children: ["from ", a.vantageIdentifier || a.vantageType] })] }), jsx(Ve, { status: a.status })] }) }), jsxs("div", { className: "px-4 py-3 space-y-3", children: [jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Response Code:" }), " ", jsx("span", { className: "font-mono", children: (_a = a.responseCode) != null ? _a : "N/A" })] }), jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Response Time:" }), " ", jsxs("span", { className: "tabular-nums", children: [a.responseTimeMs, "ms"] })] }), jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Queried At:" }), " ", jsx("span", { children: new Date(a.queriedAt).toLocaleString() })] })] }), !!a.flags && jsxs("div", { children: [jsx("span", { className: "text-gray-500 text-sm", children: "Flags:" }), jsx("pre", { className: "mt-1 text-xs bg-gray-50 p-2 rounded", children: JSON.stringify(a.flags, null, 2) })] }), jsx(te, { title: "Answer Section", data: a.answerSection }), jsx(te, { title: "Authority Section", data: a.authoritySection }), jsx(te, { title: "Additional Section", data: a.additionalSection }), a.errorMessage && jsxs("div", { className: "bg-red-50 border border-red-200 rounded p-3", children: [jsx("span", { className: "text-red-800 font-medium", children: "Error:" }), jsx("pre", { className: "mt-1 text-sm text-red-700", children: a.errorMessage })] }), a.rawResponse && jsxs("div", { children: [jsx("span", { className: "text-gray-500 text-sm", children: "Raw Response:" }), jsx("pre", { className: "mt-1 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto", children: a.rawResponse })] })] })] }, a.id);
  }) });
}
function te({ title: t, data: a }) {
  return !a || Array.isArray(a) && a.length === 0 ? null : jsxs("div", { children: [jsxs("span", { className: "text-gray-500 text-sm", children: [t, ":"] }), jsx("pre", { className: "mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto", children: JSON.stringify(a, null, 2) })] });
}
function Ve({ status: t }) {
  const a = { success: { color: "bg-green-100 text-green-800", label: "Success" }, timeout: { color: "bg-yellow-100 text-yellow-800", label: "Timeout" }, refused: { color: "bg-orange-100 text-orange-800", label: "Refused" }, nxdomain: { color: "bg-red-100 text-red-800", label: "NXDOMAIN" }, nodata: { color: "bg-yellow-100 text-yellow-800", label: "NODATA" }, error: { color: "bg-red-100 text-red-800", label: "Error" }, truncated: { color: "bg-yellow-100 text-yellow-800", label: "Truncated" } }, { color: s, label: n } = a[t] || { color: "bg-gray-100 text-gray-800", label: t };
  return jsx("span", { className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s}`, children: n });
}
function Ue({ observations: t }) {
  const [a, s] = useState(false), n = a ? t : t.slice(0, 5), i = t.length > 5;
  return jsxs("div", { children: [jsx("div", { className: "bg-gray-900 text-gray-100 rounded-lg overflow-hidden", children: jsx("div", { className: "p-4 font-mono text-sm whitespace-pre overflow-x-auto", children: String(Se(n)) }) }), i && !a && jsxs("button", { type: "button", onClick: () => s(true), className: "focus-ring mt-2 text-sm text-blue-600 hover:text-blue-800", children: ["Show all ", t.length, " observations..."] })] });
}
function We({ isOpen: t, title: a, message: s, confirmLabel: n = "Confirm", cancelLabel: i = "Cancel", variant: l = "danger", onConfirm: c, onCancel: g }) {
  const d = useId(), o = useId();
  return t ? jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", onKeyDown: (N) => {
    N.key === "Escape" && g();
  }, role: "dialog", "aria-modal": "true", "aria-labelledby": d, "aria-describedby": o, tabIndex: -1, children: [jsx("button", { type: "button", className: "absolute inset-0 w-full h-full bg-transparent", onClick: g, "aria-label": "Close dialog" }), jsxs("div", { className: "relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden", role: "document", children: [jsx("div", { className: "px-6 py-4 border-b border-gray-200", children: jsx("h3", { id: d, className: `text-lg font-semibold ${l === "danger" ? "text-red-700" : "text-amber-700"}`, children: a }) }), jsx("div", { className: "px-6 py-4", id: o, children: jsx("div", { className: "text-gray-700", children: s }) }), jsxs("div", { className: "px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-3", children: [jsx("button", { type: "button", onClick: g, className: "px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500", children: i }), jsx("button", { type: "button", onClick: c, className: `px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${l === "danger" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}`, children: n })] })] })] }) : null;
}
async function Qe(t) {
  const a = await fetch(`/api/snapshot/${t}/findings/mail`, { credentials: "include" });
  if (!a.ok) throw new Error("Failed to fetch mail findings");
  return await a.json();
}
function He({ snapshotId: t }) {
  const { data: a, isLoading: s, error: n } = useQuery({ queryKey: ["mail-findings", t], queryFn: () => Qe(t), enabled: !!t });
  if (!t) return jsx(x, { icon: "inbox", title: "No snapshot available", description: "Collect data to analyze mail configuration.", size: "sm" });
  if (s) return jsx(u, { message: "Analyzing mail configuration...", size: "sm" });
  if (n) return jsx(p, { message: n.message, size: "sm" });
  if (!a) return null;
  const { mailConfig: i, findings: l, suggestions: c } = a, g = Array.isArray(c) ? c : [], d = Xe(l);
  return jsxs("div", { className: "space-y-6", children: [jsx("div", { className: "bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100", children: jsxs("div", { className: "flex items-center justify-between", children: [jsxs("div", { children: [jsx("h4", { className: "font-semibold text-gray-900", children: "Mail Security Score" }), jsx("p", { className: "text-sm text-gray-600 mt-1", children: "Based on SPF, DMARC, DKIM, MTA-STS, and TLS-RPT configuration" })] }), jsx("div", { className: "flex items-center gap-2", children: jsx(_e, { score: i.securityScore }) })] }) }), jsxs("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3", children: [jsx(z, { name: "MX", present: i.hasMx }), jsx(z, { name: "SPF", present: i.hasSpf }), jsx(z, { name: "DMARC", present: i.hasDmarc }), jsx(z, { name: "DKIM", present: i.hasDkim }), jsx(z, { name: "MTA-STS", present: i.hasMtaSts, optional: true }), jsx(z, { name: "TLS-RPT", present: i.hasTlsRpt, optional: true })] }), (i.issues.length > 0 || i.recommendations.length > 0) && jsxs("div", { className: "space-y-3", children: [i.issues.length > 0 && jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-3", children: [jsx("h5", { className: "text-sm font-medium text-red-800 mb-2", children: "Issues" }), jsx("ul", { className: "space-y-1", children: i.issues.map((o) => jsxs("li", { className: "text-sm text-red-700 flex items-start gap-2", children: [jsx("span", { className: "text-red-500 mt-0.5", children: "\xD7" }), o] }, o)) })] }), i.recommendations.length > 0 && jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3", children: [jsx("h5", { className: "text-sm font-medium text-amber-800 mb-2", children: "Recommendations" }), jsx("ul", { className: "space-y-1", children: i.recommendations.map((o) => jsxs("li", { className: "text-sm text-amber-700 flex items-start gap-2", children: [jsx("span", { className: "text-amber-500 mt-0.5", children: "\u2192" }), o] }, o)) })] })] }), jsxs("div", { className: "border-t pt-4", children: [jsxs("div", { className: "flex items-center justify-between mb-4", children: [jsx("h4", { className: "font-semibold text-gray-900", children: "Mail Findings" }), l.length > 0 && jsxs("span", { className: "text-sm text-gray-500", children: [l.length, " finding", l.length !== 1 ? "s" : ""] })] }), l.length === 0 && jsx("div", { className: "bg-green-50 border border-green-200 rounded-lg p-4", children: jsx("p", { className: "text-green-800 text-sm", children: "\u2713 No mail configuration issues detected." }) }), ["critical", "high", "medium", "low", "info"].map((o) => {
    const h = d[o];
    return !h || h.length === 0 ? null : jsxs("div", { className: "space-y-2 mb-4", children: [jsxs("h5", { className: "text-sm font-medium text-gray-700 capitalize", children: [o, " (", h.length, ")"] }), h.map((S) => jsx(Je, { finding: S, domain: a.domain, suggestions: g.filter((N) => N.findingId === S.id) }, S.id))] }, o);
  })] }), jsxs("div", { className: "text-xs text-gray-400 pt-2 border-t", children: ["Ruleset v", a.rulesetVersion, " \xB7 ", a.persisted ? "Persisted" : "Live", " evaluation"] })] });
}
function _e({ score: t }) {
  return jsx("div", { className: `w-16 h-16 rounded-full border-4 flex items-center justify-center ${t >= 80 ? "text-green-600 border-green-500" : t >= 60 ? "text-yellow-600 border-yellow-500" : t >= 40 ? "text-orange-600 border-orange-500" : "text-red-600 border-red-500"}`, children: jsx("span", { className: "text-xl font-bold", children: t }) });
}
function z({ name: t, present: a, optional: s = false }) {
  return jsxs("div", { className: `flex items-center gap-2 p-3 rounded-lg border ${a ? "bg-green-50 border-green-200" : s ? "bg-gray-50 border-gray-200" : "bg-red-50 border-red-200"}`, children: [jsx("span", { className: `w-5 h-5 rounded-full flex items-center justify-center text-xs ${a ? "bg-green-500 text-white" : s ? "bg-gray-300 text-gray-600" : "bg-red-500 text-white"}`, children: a ? "\u2713" : s ? "\u2212" : "\xD7" }), jsx("span", { className: `text-sm font-medium ${a ? "text-green-800" : "text-gray-700"}`, children: t })] });
}
function Je({ finding: t, domain: a, suggestions: s }) {
  const [n, i] = useState(false), l = { critical: "bg-red-600", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-blue-500", info: "bg-gray-400" };
  return jsxs("div", { className: `border rounded-lg overflow-hidden ${t.reviewOnly ? "border-amber-300 bg-amber-50" : "border-gray-200"}`, children: [jsx("button", { type: "button", onClick: () => i(!n), "aria-expanded": n, className: "focus-ring w-full px-4 py-3 text-left hover:bg-black/5 transition-colors duration-150", children: jsxs("div", { className: "flex items-start gap-3", children: [jsx("span", { className: `flex-shrink-0 w-2 h-2 rounded-full mt-2 ${l[t.severity] || "bg-gray-400"}`, "aria-hidden": "true" }), jsxs("div", { className: "flex-1 min-w-0", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx("h5", { className: "font-medium text-gray-900", children: t.title }), t.reviewOnly && jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800", children: "Review Required" })] }), jsx("p", { className: "text-sm text-gray-600 mt-1 line-clamp-2", children: t.description }), jsxs("div", { className: "flex items-center gap-3 mt-2 text-xs text-gray-500", children: [jsxs("span", { className: "capitalize", children: [t.confidence, " confidence"] }), s.length > 0 && jsxs("span", { children: [s.length, " suggestion(s)"] })] })] }), jsx("svg", { className: `w-5 h-5 text-gray-400 transition-transform duration-150 ${n ? "rotate-180" : ""}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", "aria-hidden": "true", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }) }), n && jsxs("div", { className: "px-4 pb-4 border-t border-gray-200/50 bg-white", children: [t.evidence && t.evidence.length > 0 && jsxs("div", { className: "mt-3", children: [jsx("h6", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2", children: "Evidence" }), jsx("ul", { className: "space-y-1", children: t.evidence.map((c) => jsxs("li", { className: "text-sm text-gray-600", children: ["\u2022 ", c.description] }, c.description)) })] }), s.length > 0 && jsxs("div", { className: "mt-4 space-y-3", children: [jsx("h6", { className: "text-xs font-semibold text-gray-500 uppercase tracking-wider", children: "Suggestions" }), s.map((c) => jsx(Ye, { suggestion: c, domain: a }, c.id))] }), jsxs("div", { className: "mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400", children: ["Rule: ", t.ruleId, " \xB7 Version: ", t.ruleVersion] })] })] });
}
function Xe(t) {
  return t.reduce((a, s) => {
    const n = s.severity;
    return a[n] || (a[n] = []), a[n].push(s), a;
  }, {});
}
function Ye({ suggestion: t, domain: a }) {
  const s = useQueryClient(), [n, i] = useState(false), l = !t.appliedAt && !t.dismissedAt, c = useMutation({ mutationFn: async () => {
    const h = await fetch(`/api/suggestions/${t.id}/apply`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmApply: t.reviewOnly ? true : void 0 }) });
    if (!h.ok) {
      const S = await h.json();
      throw new Error(S.error || "Failed to apply suggestion");
    }
  }, onSuccess: () => {
    s.invalidateQueries({ queryKey: ["mail-findings"] });
  } }), g = useMutation({ mutationFn: async () => {
    if (!(await fetch(`/api/suggestions/${t.id}/dismiss`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Dismissed by user" }) })).ok) throw new Error("Failed to dismiss suggestion");
  }, onSuccess: () => {
    s.invalidateQueries({ queryKey: ["mail-findings"] });
  } }), d = () => {
    if (t.reviewOnly && !n) {
      i(true);
      return;
    }
    c.mutate();
  }, o = () => {
    g.mutate();
  };
  return jsxs(Fragment, { children: [jsxs("div", { className: `p-3 rounded-lg ${t.reviewOnly ? "bg-amber-100/50 border border-amber-200" : "bg-blue-50 border border-blue-200"}`, children: [jsx("div", { className: "flex items-start justify-between gap-3", children: jsxs("div", { className: "flex-1", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx("h6", { className: "font-medium text-gray-900", children: t.title }), t.reviewOnly && jsx("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800", children: "\u26A0\uFE0F Review Required" })] }), jsx("p", { className: "text-sm text-gray-600 mt-1", children: t.description }), jsx("div", { className: "mt-2 p-2 bg-white/50 rounded text-sm font-mono text-gray-700 whitespace-pre-wrap", children: t.action })] }) }), l && jsxs("div", { className: "mt-3 flex items-center gap-2 pt-2 border-t border-gray-200/50", children: [jsx("button", { type: "button", onClick: d, disabled: c.isPending || g.isPending, className: "inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500", children: c.isPending ? "Applying..." : "Apply" }), jsx("button", { type: "button", onClick: o, disabled: c.isPending || g.isPending, className: "inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500", children: g.isPending ? "Dismissing..." : "Dismiss" })] }), t.appliedAt && jsxs("div", { className: "mt-2 pt-2 border-t border-gray-200/50 text-xs text-green-600", children: ["\u2713 Applied ", t.appliedBy ? `by ${t.appliedBy}` : ""] }), t.dismissedAt && jsxs("div", { className: "mt-2 pt-2 border-t border-gray-200/50 text-xs text-gray-500", children: ["Dismissed ", t.dismissedBy ? `by ${t.dismissedBy}` : ""] })] }), jsx(We, { isOpen: n, title: "Apply Review-Only Suggestion?", message: jsxs("div", { className: "space-y-3", children: [jsxs("p", { children: ["This suggestion is marked as ", jsx("strong", { children: "review-required" }), " because it may have significant impact:"] }), jsxs("ul", { className: "list-disc list-inside text-sm text-gray-600", children: [jsxs("li", { children: ["Risk posture: ", t.riskPosture] }), jsxs("li", { children: ["Blast radius: ", t.blastRadius.replace(/-/g, " ")] })] }), jsxs("p", { className: "text-amber-700 font-medium", children: ["This change may affect mail delivery for ", a, ". Proceed with caution."] })] }), confirmLabel: "Apply Anyway", cancelLabel: "Cancel", variant: "warning", onConfirm: d, onCancel: () => i(false) })] });
}
function Ze({ result: t }) {
  return jsxs("div", { className: "space-y-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Mail Check Results" }), jsx(re, { label: "DMARC", present: t.dmarc.present, valid: t.dmarc.valid, errors: t.dmarc.errors, description: "Domain-based Message Authentication, Reporting, and Conformance" }), jsx(re, { label: "DKIM", present: t.dkim.present, valid: t.dkim.valid, errors: t.dkim.errors, description: "DomainKeys Identified Mail", extra: t.dkim.present ? jsxs("span", { className: "text-xs text-gray-500", children: ["Selector: ", jsx("code", { className: "bg-gray-100 px-1 rounded", children: t.dkim.selector }), t.dkim.selectorProvenance && jsxs("span", { className: "ml-2 text-gray-400", children: ["(via ", t.dkim.selectorProvenance, ")"] })] }) : null }), jsx(re, { label: "SPF", present: t.spf.present, valid: t.spf.valid, errors: t.spf.errors, description: "Sender Policy Framework" })] });
}
function re({ label: t, present: a, valid: s, errors: n, description: i, extra: l }) {
  const d = { success: { icon: Ge, bg: "bg-green-50", border: "border-green-200", text: "text-green-800", label: "Present & Valid" }, warning: { icon: et, bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", label: "Present but Invalid" }, error: { icon: tt, bg: "bg-red-50", border: "border-red-200", text: "text-red-800", label: "Not Found" } }[a ? s ? "success" : "warning" : "error"], o = d.icon;
  return jsxs("div", { className: `p-4 rounded-lg border ${d.bg} ${d.border}`, children: [jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { className: "flex items-center gap-3", children: [jsx(o, { className: `w-5 h-5 ${d.text}` }), jsxs("div", { children: [jsx("h4", { className: `font-medium ${d.text}`, children: t }), jsx("p", { className: "text-sm text-gray-600", children: i }), l] })] }), jsx("span", { className: `text-sm font-medium ${d.text}`, children: d.label })] }), n && n.length > 0 && jsx("div", { className: "mt-3 text-sm text-red-700", children: n.map((h) => jsxs("p", { children: ["\u2022 ", h] }, h)) })] });
}
function Ge({ className: t }) {
  return jsx("svg", { className: t, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", "aria-hidden": "true", focusable: "false", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) });
}
function et({ className: t }) {
  return jsx("svg", { className: t, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", "aria-hidden": "true", focusable: "false", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }) });
}
function tt({ className: t }) {
  return jsx("svg", { className: t, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", "aria-hidden": "true", focusable: "false", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) });
}
const rt = { "dmarc-missing": "DMARC record not found", "dmarc-invalid": "DMARC record is invalid", "dkim-missing": "DKIM record not found", "dkim-invalid": "DKIM record is invalid", "spf-missing": "SPF record not found", "spf-invalid": "SPF record is invalid" };
function at({ domain: t, snapshotId: a, issues: s, onClose: n, onSuccess: i }) {
  const [l, c] = useState(false), [g, d] = useState({}), o = useId(), h = `${o}-contact-email`, S = `${o}-contact-name`, N = `${o}-contact-phone`, x = `${o}-priority`, D = `${o}-notes`, [f, y] = useState({ contactEmail: "", contactName: "", contactPhone: "", priority: "medium", notes: "", selectedIssues: s }), C = (p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p), u = (p) => p ? /^\+?[\d\s-]{8,20}$/.test(p) : true, b = () => {
    const p = {};
    return (!f.contactEmail || !C(f.contactEmail)) && (p.contactEmail = "Valid email address required"), (!f.contactName || f.contactName.length < 2) && (p.contactName = "Name must be at least 2 characters"), f.contactPhone && !u(f.contactPhone) && (p.contactPhone = "Valid phone number required (8-20 digits, optional + prefix)"), f.selectedIssues.length === 0 && (p.issues = "Select at least one issue to fix"), d(p), Object.keys(p).length === 0;
  }, $ = async (p) => {
    if (p.preventDefault(), !!b()) {
      c(true), d({});
      try {
        const m = await fetch("/api/remediation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: t, snapshotId: a, contactEmail: f.contactEmail, contactName: f.contactName, contactPhone: f.contactPhone || void 0, priority: f.priority, issues: f.selectedIssues, notes: f.notes || void 0 }) });
        if (!m.ok) {
          const E = await m.json();
          throw new Error(E.error || "Failed to submit request");
        }
        i == null ? void 0 : i(), n();
      } catch (m) {
        d({ general: m instanceof Error ? m.message : "Failed to submit request" });
      } finally {
        c(false);
      }
    }
  }, R = (p) => {
    y((m) => ({ ...m, selectedIssues: m.selectedIssues.includes(p) ? m.selectedIssues.filter((E) => E !== p) : [...m.selectedIssues, p] }));
  };
  return jsxs("form", { onSubmit: $, className: "bg-white p-6 rounded-lg border space-y-4", children: [jsx("h4", { className: "font-semibold text-lg", children: "Request Remediation" }), jsxs("p", { className: "text-sm text-gray-600", children: ["Submit a request to fix mail configuration issues for ", jsx("strong", { children: t })] }), g.general && jsx("div", { className: "p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm", role: "alert", children: g.general }), jsxs("div", { children: [jsx("label", { htmlFor: h, className: "block text-sm font-medium text-gray-700", children: "Contact Email *" }), jsx("input", { id: h, type: "email", value: f.contactEmail, onChange: (p) => y((m) => ({ ...m, contactEmail: p.target.value })), className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm", placeholder: "admin@example.com", autoComplete: "email" }), g.contactEmail && jsx("p", { className: "mt-1 text-sm text-red-600", children: g.contactEmail })] }), jsxs("div", { children: [jsx("label", { htmlFor: S, className: "block text-sm font-medium text-gray-700", children: "Contact Name *" }), jsx("input", { id: S, type: "text", value: f.contactName, onChange: (p) => y((m) => ({ ...m, contactName: p.target.value })), className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm", placeholder: "John Doe", autoComplete: "name" }), g.contactName && jsx("p", { className: "mt-1 text-sm text-red-600", children: g.contactName })] }), jsxs("div", { children: [jsx("label", { htmlFor: N, className: "block text-sm font-medium text-gray-700", children: "Phone (optional)" }), jsx("input", { id: N, type: "tel", value: f.contactPhone, onChange: (p) => y((m) => ({ ...m, contactPhone: p.target.value })), className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm", placeholder: "+1 555-123-4567", autoComplete: "tel" }), g.contactPhone && jsx("p", { className: "mt-1 text-sm text-red-600", children: g.contactPhone })] }), jsxs("div", { children: [jsx("label", { htmlFor: x, className: "block text-sm font-medium text-gray-700", children: "Priority" }), jsxs("select", { id: x, value: f.priority, onChange: (p) => y((m) => ({ ...m, priority: p.target.value })), className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm", children: [jsx("option", { value: "low", children: "Low" }), jsx("option", { value: "medium", children: "Medium" }), jsx("option", { value: "high", children: "High" }), jsx("option", { value: "critical", children: "Critical" })] })] }), jsxs("fieldset", { children: [jsx("legend", { className: "block text-sm font-medium text-gray-700", children: "Issues to Fix *" }), jsx("div", { className: "mt-2 space-y-2", children: s.map((p) => {
    const m = `${o}-issue-${p}`;
    return jsxs("label", { htmlFor: m, className: "flex items-center", children: [jsx("input", { id: m, type: "checkbox", checked: f.selectedIssues.includes(p), onChange: () => R(p), className: "focus-ring rounded border-gray-300 text-blue-600" }), jsx("span", { className: "ml-2 text-sm text-gray-700", children: rt[p] || p })] }, p);
  }) }), g.issues && jsx("p", { className: "mt-1 text-sm text-red-600", children: g.issues })] }), jsxs("div", { children: [jsx("label", { htmlFor: D, className: "block text-sm font-medium text-gray-700", children: "Additional Notes" }), jsx("textarea", { id: D, value: f.notes, onChange: (p) => y((m) => ({ ...m, notes: p.target.value })), rows: 3, className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm", placeholder: "Any additional context..." })] }), jsxs("div", { className: "flex flex-wrap gap-3 pt-4", children: [jsx("button", { type: "submit", disabled: l, className: "focus-ring min-h-10 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400", children: l ? "Submitting..." : "Submit Request" }), jsx("button", { type: "button", onClick: n, className: "focus-ring min-h-10 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300", children: "Cancel" })] })] });
}
function nt({ domain: t, snapshotId: a }) {
  const [s, n] = useState(false), [i, l] = useState(null), [c, g] = useState(null), [d, o] = useState(false), [h, S] = useState(false), N = async () => {
    n(true), g(null);
    try {
      const y = await fetch("/api/collect/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: t, snapshotId: a }) });
      if (!y.ok) {
        const u = await y.json();
        throw y.status === 401 || y.status === 403 ? new Error("Operator sign-in is required to run mail diagnostics.") : new Error(u.error || "Mail check failed");
      }
      const C = await y.json();
      l(C.results || null), S(false);
    } catch (y) {
      g(y instanceof Error ? y.message : "Unknown error");
    } finally {
      n(false);
    }
  }, D = i ? ((y) => {
    const C = [];
    return y.dmarc.present ? y.dmarc.valid || C.push("dmarc-invalid") : C.push("dmarc-missing"), y.dkim.present ? y.dkim.valid || C.push("dkim-invalid") : C.push("dkim-missing"), y.spf.present ? y.spf.valid || C.push("spf-invalid") : C.push("spf-missing"), C;
  })(i) : [], f = D.length > 0;
  return i ? jsxs("div", { className: "space-y-6", children: [jsx(Ze, { result: i }), f && jsxs("div", { className: "bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3", children: [jsxs("div", { children: [jsx("h4", { className: "font-semibold text-yellow-900 mb-2", children: "Issues Detected" }), jsxs("p", { className: "text-yellow-800 text-sm", children: ["Submit a tenant-scoped remediation request for the issues detected on", " ", jsx("strong", { children: t }), "."] })] }), h ? jsx("div", { className: "rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800", children: "Remediation request submitted." }) : null, d ? jsx(at, { domain: t, snapshotId: a, issues: D, onClose: () => o(false), onSuccess: () => {
    S(true), o(false);
  } }) : jsx("button", { type: "button", onClick: () => o(true), className: "focus-ring min-h-10 px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700", children: "Request Remediation" })] }), jsx("div", { className: "flex gap-3", children: jsx("button", { type: "button", onClick: N, disabled: s, "aria-busy": s, className: "focus-ring min-h-10 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400", children: s ? "Checking..." : "Re-check" }) })] }) : jsxs("div", { className: "text-center py-12", children: [jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Mail Configuration Check" }), jsxs("p", { className: "text-gray-500 mb-4", children: ["Check DMARC, DKIM, and SPF records for ", jsx("strong", { children: t })] }), c && jsx("div", { className: "mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800", role: "alert", children: c }), jsx("button", { type: "button", onClick: N, disabled: s, "aria-busy": s, className: "focus-ring min-h-10 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400", children: s ? "Checking..." : "Run Mail Check" })] });
}
async function st(t) {
  var _a, _b;
  const a = await fetch(`/api/portfolio/domains/by-name/${encodeURIComponent(t)}`, { credentials: "include" });
  if (a.status === 401) {
    const n = new Error("Unauthorized");
    throw n.status = 401, n;
  }
  if (a.status === 403) {
    const n = new Error("Forbidden");
    throw n.status = 403, n;
  }
  if (a.status === 404) {
    const n = new Error("Not found");
    throw n.status = 404, n;
  }
  if (!a.ok) throw new Error("Failed to resolve domain");
  return (_b = (_a = (await a.json()).domain) == null ? void 0 : _a.id) != null ? _b : null;
}
async function it(t) {
  const a = await fetch(`/api/portfolio/domains/${t}/notes`, { credentials: "include" });
  if (a.status === 401) {
    const n = new Error("Unauthorized");
    throw n.status = 401, n;
  }
  if (a.status === 403) {
    const n = new Error("Forbidden");
    throw n.status = 403, n;
  }
  if (!a.ok) throw new Error("Failed to fetch notes");
  return ((await a.json()).notes || []).map((n) => ({ ...n, author: n.author || n.createdBy || null }));
}
function ce({ domainId: t, isDomainName: a = false }) {
  var _a;
  const s = useQueryClient(), [n, i] = useState(null), [l, c] = useState(""), [g, d] = useState(""), [o, h] = useState(false), [S, N] = useState(null), { data: x, isLoading: D, error: f } = useQuery({ queryKey: ["domain-resolve", t, a], queryFn: () => a ? st(t) : Promise.resolve(t), enabled: !!t, staleTime: 1 / 0 }), y = f ? f.status : void 0, { data: C = [], isLoading: u, error: b } = useQuery({ queryKey: ["notes", x], queryFn: () => it(x), enabled: !!x }), $ = b ? b.status : void 0, R = y === 401 || $ === 401, p = y === 403 || $ === 403, m = y === 404, E = (_a = S != null ? S : f && y !== 401 && y !== 403 && y !== 404 ? f.message : null) != null ? _a : b && $ !== 401 && $ !== 403 ? b.message : null, F = useMutation({ mutationFn: async (w) => {
    const M = await fetch(`/api/portfolio/domains/${x}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: w }), credentials: "include" });
    if (M.status === 401) {
      const I = new Error("Unauthorized");
      throw I.status = 401, I;
    }
    if (M.status === 403) {
      const I = new Error("Forbidden");
      throw I.status = 403, I;
    }
    if (!M.ok) throw new Error("Failed to create note");
    return M.json();
  }, onSuccess: () => {
    d(""), h(false), s.invalidateQueries({ queryKey: ["notes", x] });
  }, onError: (w) => {
    N(w instanceof Error ? w.message : "Failed to create note");
  } }), J = useMutation({ mutationFn: async ({ noteId: w, content: M }) => {
    const I = await fetch(`/api/portfolio/notes/${w}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: M }), credentials: "include" });
    if (I.status === 401) {
      const V = new Error("Unauthorized");
      throw V.status = 401, V;
    }
    if (I.status === 403) {
      const V = new Error("Forbidden");
      throw V.status = 403, V;
    }
    if (!I.ok) throw new Error("Failed to update note");
    return I.json();
  }, onSuccess: () => {
    i(null), c(""), s.invalidateQueries({ queryKey: ["notes", x] });
  }, onError: (w) => {
    N(w instanceof Error ? w.message : "Failed to update note");
  } }), Z = useMutation({ mutationFn: async (w) => {
    const M = await fetch(`/api/portfolio/notes/${w}`, { method: "DELETE", credentials: "include" });
    if (M.status === 401) {
      const I = new Error("Unauthorized");
      throw I.status = 401, I;
    }
    if (M.status === 403) {
      const I = new Error("Forbidden");
      throw I.status = 403, I;
    }
    if (!M.ok) throw new Error("Failed to delete note");
  }, onSuccess: () => {
    s.invalidateQueries({ queryKey: ["notes", x] });
  }, onError: (w) => {
    N(w instanceof Error ? w.message : "Failed to delete note");
  } }), X = () => {
    !g.trim() || !x || F.mutate(g.trim());
  }, G = (w) => {
    l.trim() && J.mutate({ noteId: w, content: l.trim() });
  }, B = (w) => {
    confirm("Are you sure you want to delete this note?") && Z.mutate(w);
  }, v = (w) => {
    i(w.id), c(w.content);
  }, T = () => {
    i(null), c("");
  }, A = D || u, j = F.isPending || J.isPending;
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-white shadow-sm", children: [jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 px-4 py-3", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Notes" }), !o && jsx("button", { type: "button", onClick: () => h(true), disabled: R || p, className: "text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400", children: "+ Add Note" })] }), jsxs("div", { className: "p-4", children: [R && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view or edit tenant notes." }), p && jsx("div", { className: "mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900", children: "You can view tenant notes here, but your current role cannot create, edit, or delete them." }), E && jsxs("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800", children: [E, jsx("button", { type: "button", onClick: () => N(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), o && jsxs("div", { className: "mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3", children: [jsx("textarea", { value: g, onChange: (w) => d(w.target.value), placeholder: "Write your note...", rows: 3, disabled: R || p, className: "w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" }), jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [jsx("button", { type: "button", onClick: () => {
    h(false), d("");
  }, className: "px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800", disabled: j || R || p, children: "Cancel" }), jsx("button", { type: "button", onClick: X, disabled: !g.trim() || j || R || p, className: "rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: j ? "Saving..." : "Save Note" })] })] }), A ? jsx("div", { className: "py-4 text-center text-gray-500", children: "Loading notes..." }) : R ? jsx("div", { className: "py-4 text-center text-gray-500", children: "Sign in to view and manage tenant notes." }) : m ? jsx("div", { className: "py-4 text-center text-gray-500", children: "This domain must exist in the tenant portfolio before notes can be attached." }) : x ? C.length === 0 ? jsxs("div", { className: "py-4 text-center text-gray-500", children: ["No notes yet.", " ", !o && jsx("button", { type: "button", onClick: () => h(true), className: "text-blue-600 hover:text-blue-700 disabled:text-gray-400", disabled: R || p, children: "Add one" })] }) : jsx("div", { className: "space-y-4", children: C.map((w) => jsx("div", { className: "rounded-lg border border-gray-200 bg-gray-50 p-3", children: n === w.id ? jsxs("div", { children: [jsx("textarea", { value: l, onChange: (M) => c(M.target.value), rows: 3, disabled: R || p, className: "w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" }), jsxs("div", { className: "mt-2 flex justify-end gap-2", children: [jsx("button", { type: "button", onClick: T, className: "px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800", disabled: j || R, children: "Cancel" }), jsx("button", { type: "button", onClick: () => G(w.id), disabled: !l.trim() || j || R || p, className: "rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: j ? "Saving..." : "Save" })] })] }) : jsxs("div", { children: [jsx("p", { className: "whitespace-pre-wrap text-gray-800", children: w.content }), jsxs("div", { className: "mt-2 flex items-center justify-between text-sm", children: [jsxs("div", { className: "text-gray-500", children: [w.author && jsx("span", { className: "mr-2", children: w.author }), jsx("span", { children: ot(w.updatedAt || w.createdAt) })] }), jsxs("div", { className: "flex gap-2", children: [jsx("button", { type: "button", onClick: () => v(w), className: "text-gray-500 hover:text-blue-600 disabled:text-gray-400", disabled: R || p, children: "Edit" }), jsx("button", { type: "button", onClick: () => B(w.id), className: "text-gray-500 hover:text-red-600 disabled:text-gray-400", disabled: R || p, children: "Delete" })] })] })] }) }, w.id)) }) : jsx("div", { className: "py-4 text-center text-gray-500", children: "Notes are unavailable until domain context can be resolved." })] })] });
}
function ot(t) {
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const me = { low: "#16a34a", medium: "#d97706", high: "#dc2626" }, lt = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#2563eb", info: "#6b7280" }, dt = { add: "Add", modify: "Modify", remove: "Remove" };
async function ct(t) {
  const a = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: t }), credentials: "include" });
  if (!a.ok) {
    let s = `Simulation failed (${a.status})`;
    try {
      const n = await a.json();
      n.error && (s = n.error);
    } catch {
    }
    throw new Error(s);
  }
  return await a.json();
}
function mt({ snapshotId: t }) {
  const a = useQueryClient(), [s, n] = useState(false), { data: i, isLoading: l, error: c, refetch: g } = useQuery({ queryKey: ["simulation", t], queryFn: () => ct(t), enabled: !!t && s, staleTime: 300 * 1e3 }), d = () => {
    n(true), g();
  };
  return t ? l ? jsx(u, { message: "Running simulation..." }) : c ? jsx(p, { message: c.message, onRetry: d }) : i ? jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [jsxs("div", { style: { display: "flex", gap: "1rem", flexWrap: "wrap", padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }, children: [jsx(U, { label: "Changes", value: i.summary.changesProposed }), jsx(U, { label: "Findings before", value: i.summary.findingsBefore }), jsx(U, { label: "After", value: i.summary.findingsAfter, color: i.summary.findingsAfter < i.summary.findingsBefore ? "#16a34a" : void 0 }), jsx(U, { label: "Resolved", value: i.summary.findingsResolved, color: "#16a34a" }), i.summary.findingsNew > 0 && jsx(U, { label: "New", value: i.summary.findingsNew, color: "#d97706" }), i.detectedProvider !== "unknown" && jsxs("span", { style: { padding: "0.25rem 0.75rem", backgroundColor: "#eff6ff", borderRadius: "9999px", fontSize: "0.75rem", color: "#2563eb" }, children: ["Provider: ", i.detectedProvider] })] }), i.proposedChanges.length > 0 && jsxs("section", { children: [jsx("h4", { style: { fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem" }, children: "Proposed DNS Changes" }), jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: i.proposedChanges.map((o) => jsx(ut, { change: o }, `${o.action}-${o.name}-${o.type}`)) })] }), i.resolvedFindings.length > 0 && jsxs("section", { children: [jsxs("h4", { style: { fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#16a34a" }, children: ["\u2705 Findings Resolved (", i.resolvedFindings.length, ")"] }), jsx(ae, { findings: i.resolvedFindings })] }), i.newFindings.length > 0 && jsxs("section", { children: [jsxs("h4", { style: { fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#d97706" }, children: ["\u26A0\uFE0F New Findings Introduced (", i.newFindings.length, ")"] }), jsx(ae, { findings: i.newFindings })] }), i.remainingFindings.length > 0 && jsxs("section", { children: [jsxs("h4", { style: { fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "#6b7280" }, children: ["Remaining (", i.remainingFindings.length, ")"] }), jsx(ae, { findings: i.remainingFindings })] }), jsx("div", { style: { textAlign: "center" }, children: jsx("button", { type: "button", onClick: () => {
    a.invalidateQueries({ queryKey: ["simulation", t] }), g();
  }, style: { padding: "0.375rem 1rem", backgroundColor: "transparent", color: "#2563eb", border: "1px solid #2563eb", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem" }, children: "Re-run Simulation" }) })] }) : jsxs("div", { style: { textAlign: "center", padding: "2rem" }, children: [jsx("p", { style: { color: "#6b7280", marginBottom: "1rem" }, children: "Simulate DNS changes to see which findings would be resolved." }), jsx("button", { type: "button", onClick: d, style: { padding: "0.5rem 1.5rem", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 500 }, children: "Run Simulation" })] }) : jsx(x, { icon: "shield", title: "No snapshot available", description: "Collect data first, then simulate fixes.", size: "sm" });
}
function U({ label: t, value: a, color: s }) {
  return jsxs("span", { style: { padding: "0.25rem 0.75rem", backgroundColor: "#f1f5f9", borderRadius: "9999px", fontSize: "0.75rem" }, children: [t, ": ", jsx("strong", { style: { color: s || "inherit" }, children: a })] });
}
function ut({ change: t }) {
  return jsxs("div", { style: { padding: "0.75rem 1rem", border: "1px solid #e2e8f0", borderRadius: "8px", borderLeft: `4px solid ${me[t.risk] || "#6b7280"}`, backgroundColor: "white" }, children: [jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }, children: [jsx("span", { style: { padding: "0.125rem 0.375rem", borderRadius: "4px", fontSize: "0.625rem", fontWeight: 700, textTransform: "uppercase", color: "white", backgroundColor: t.action === "add" ? "#16a34a" : t.action === "remove" ? "#dc2626" : "#d97706" }, children: dt[t.action] }), jsxs("code", { style: { fontSize: "0.8125rem", fontWeight: 600 }, children: [t.name, " ", t.type] }), jsxs("span", { style: { fontSize: "0.625rem", color: me[t.risk], fontWeight: 600 }, children: [t.risk, " risk"] })] }), t.currentValues.length > 0 && jsxs("div", { style: { fontSize: "0.75rem", fontFamily: "monospace", color: "#dc2626", backgroundColor: "#fef2f2", padding: "0.25rem 0.5rem", borderRadius: "4px", marginBottom: "0.25rem" }, children: ["\u2212 ", t.currentValues.join(", ")] }), t.proposedValues.length > 0 && jsxs("div", { style: { fontSize: "0.75rem", fontFamily: "monospace", color: "#16a34a", backgroundColor: "#f0fdf4", padding: "0.25rem 0.5rem", borderRadius: "4px", marginBottom: "0.25rem" }, children: ["+ ", t.proposedValues.join(", ")] }), jsx("p", { style: { fontSize: "0.75rem", color: "#6b7280", margin: "0.25rem 0 0" }, children: t.rationale })] });
}
function ae({ findings: t }) {
  return jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.25rem" }, children: t.map((a) => jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0.75rem", backgroundColor: "#f8f8f8", borderRadius: "6px", fontSize: "0.8125rem" }, children: [jsx("span", { style: { width: "8px", height: "8px", borderRadius: "50%", backgroundColor: lt[a.severity] || "#6b7280", flexShrink: 0 } }), jsx("span", { style: { color: "#374151" }, children: a.title }), jsx("span", { style: { fontSize: "0.625rem", color: "#9ca3af", marginLeft: "auto" }, children: a.severity })] }, `${a.type}-${a.severity}`)) });
}
async function ht(t) {
  var _a;
  const a = await fetch(`/api/snapshots/${encodeURIComponent(t)}?limit=50`, { credentials: "include" });
  if (!a.ok) {
    if (a.status === 404) return [];
    throw new Error(`Failed to load snapshots: ${a.status} ${a.statusText}`);
  }
  return (_a = (await a.json()).snapshots) != null ? _a : [];
}
function gt({ domain: t }) {
  const [a, s] = useState(null), [n, i] = useState(null), [l, c] = useState(null), [g, d] = useState(null), { data: o = [], isLoading: h, error: S, refetch: N } = useQuery({ queryKey: ["snapshots", t], queryFn: () => ht(t), enabled: !!t }), x$1 = useMutation({ mutationFn: async ({ snapshotA: u, snapshotB: b }) => {
    var _a;
    const $ = u ? `/api/snapshots/${encodeURIComponent(t)}/diff` : `/api/snapshots/${encodeURIComponent(t)}/compare-latest`, R = u ? JSON.stringify({ snapshotA: u, snapshotB: b }) : void 0, p = await fetch($, { method: "POST", headers: { "Content-Type": "application/json" }, body: R });
    if (!p.ok) {
      const m = await p.json().catch(() => ({}));
      throw new Error((_a = m.error) != null ? _a : `${u ? "Diff" : "Compare latest"} failed: ${p.status}`);
    }
    return await p.json();
  }, onSuccess: (u) => {
    c(u), d(null);
  }, onError: (u) => {
    d(u instanceof Error ? u.message : "Unknown error");
  } }), D = () => {
    !a || !n || x$1.mutate({ snapshotA: a, snapshotB: n });
  }, f = () => {
    x$1.mutate({});
  }, y = () => {
    c(null), d(null);
  };
  if (h) return jsx("div", { "data-testid": "snapshot-history-loading", children: jsx(u, { message: "Loading snapshot history\u2026" }) });
  if (S) return jsx("div", { "data-testid": "snapshot-history-error", children: jsx(p, { message: S.message, onRetry: N }) });
  if (o.length === 0) return jsx("div", { "data-testid": "snapshot-history-empty", children: jsx(x, { icon: "document", title: "No snapshots yet", description: "Collect DNS evidence to start building snapshot history.", size: "sm" }) });
  const C = x$1.isPending;
  return jsxs("div", { className: "space-y-6", "data-testid": "snapshot-history-panel", children: [jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [jsxs("div", { children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Snapshot History" }), jsxs("p", { className: "text-sm text-gray-500", children: [o.length, " snapshot", o.length !== 1 ? "s" : "", " collected"] })] }), jsxs("div", { className: "flex gap-2", children: [o.length >= 2 && jsx("button", { type: "button", onClick: f, disabled: C, className: "focus-ring px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400", "data-testid": "compare-latest-btn", children: C && !a ? "Comparing\u2026" : "Compare Latest" }), jsx("button", { type: "button", onClick: D, disabled: C || !a || !n || a === n, className: "focus-ring px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed", "data-testid": "compare-selected-btn", children: "Compare Selected" })] })] }), jsx("div", { className: "overflow-x-auto border border-gray-200 rounded-lg", children: jsxs("table", { className: "min-w-full text-sm", "data-testid": "snapshot-list-table", children: [jsx("thead", { className: "bg-gray-50 text-gray-600", children: jsxs("tr", { children: [jsx("th", { className: "px-3 py-2 text-left font-medium", children: "A" }), jsx("th", { className: "px-3 py-2 text-left font-medium", children: "B" }), jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Created" }), jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Ruleset" }), jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Findings" }), jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Scope" })] }) }), jsx("tbody", { className: "divide-y divide-gray-100", children: o.map((u) => jsxs("tr", { className: `hover:bg-gray-50 ${a === u.id || n === u.id ? "bg-blue-50" : ""}`, children: [jsx("td", { className: "px-3 py-2", children: jsx("input", { type: "radio", name: "snapshotA", checked: a === u.id, onChange: () => s(u.id), "aria-label": `Select snapshot ${u.id.slice(0, 8)} as A (older)`, className: "accent-blue-600" }) }), jsx("td", { className: "px-3 py-2", children: jsx("input", { type: "radio", name: "snapshotB", checked: n === u.id, onChange: () => i(u.id), "aria-label": `Select snapshot ${u.id.slice(0, 8)} as B (newer)`, className: "accent-blue-600" }) }), jsx("td", { className: "px-3 py-2 tabular-nums whitespace-nowrap", children: new Date(u.createdAt).toLocaleString() }), jsx("td", { className: "px-3 py-2 font-mono text-xs", children: u.rulesetVersionId ? u.rulesetVersionId.slice(0, 8) : "\u2014" }), jsx("td", { className: "px-3 py-2", children: u.findingsEvaluated ? jsx("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800", children: "Evaluated" }) : jsx("span", { className: "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600", children: "Pending" }) }), jsxs("td", { className: "px-3 py-2 text-xs text-gray-500", children: [u.queryScope.names.length, " names, ", u.queryScope.types.length, " types"] })] }, u.id)) })] }) }), g && jsx("div", { className: "p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700", role: "alert", "data-testid": "diff-error", children: g }), C && jsx("div", { "data-testid": "diff-loading", children: jsx(u, { message: "Computing snapshot diff\u2026", size: "sm" }) }), l && jsx(pt, { result: l, onClose: y })] });
}
function pt({ result: t, onClose: a }) {
  const { diff: s, warnings: n } = t, { findingsSummary: i, comparison: l } = s, c = Array.isArray(l == null ? void 0 : l.recordChanges) ? l.recordChanges : [], g = c.filter((o) => o.type !== "unchanged"), d = { added: c.filter((o) => o.type === "added").length, removed: c.filter((o) => o.type === "removed").length, modified: c.filter((o) => o.type === "modified").length, unchanged: c.filter((o) => o.type === "unchanged").length };
  return jsxs("div", { className: "space-y-4", "data-testid": "diff-result", children: [jsxs("div", { className: "flex items-center justify-between", children: [jsx("h4", { className: "font-semibold text-gray-900", children: "Comparison Result" }), jsx("button", { type: "button", onClick: a, className: "text-sm text-gray-500 hover:text-gray-700", "data-testid": "close-diff-btn", children: "\u2715 Close" })] }), jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm", children: [jsxs("div", { className: "rounded-lg bg-gray-50 p-3", children: [jsx("p", { className: "font-medium text-gray-700", children: "Snapshot A (older)" }), jsx("p", { className: "text-xs text-gray-500 tabular-nums", children: new Date(s.snapshotA.createdAt).toLocaleString() }), jsxs("p", { className: "text-xs text-gray-500 font-mono", children: ["Ruleset: ", s.snapshotA.rulesetVersion.slice(0, 8)] })] }), jsxs("div", { className: "rounded-lg bg-gray-50 p-3", children: [jsx("p", { className: "font-medium text-gray-700", children: "Snapshot B (newer)" }), jsx("p", { className: "text-xs text-gray-500 tabular-nums", children: new Date(s.snapshotB.createdAt).toLocaleString() }), jsxs("p", { className: "text-xs text-gray-500 font-mono", children: ["Ruleset: ", s.snapshotB.rulesetVersion.slice(0, 8)] })] })] }), n && n.length > 0 && jsxs("div", { className: "p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-800", "data-testid": "diff-warnings", children: [jsx("p", { className: "font-medium mb-1", children: "\u26A0 Warnings" }), jsx("ul", { className: "list-disc list-inside space-y-1", children: n.map((o) => jsx("li", { children: o }, o)) })] }), jsxs("div", { children: [jsx("h5", { className: "text-xs font-medium uppercase tracking-wide text-gray-500 mb-2", children: "DNS Records" }), jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", "data-testid": "diff-summary", children: [jsx(Y, { label: "Added", value: d.added, color: "green" }), jsx(Y, { label: "Removed", value: d.removed, color: "red" }), jsx(Y, { label: "Modified", value: d.modified, color: "yellow" }), jsx(Y, { label: "Unchanged", value: d.unchanged, color: "gray" })] })] }), l.scopeChanges && jsxs("div", { className: "p-3 rounded-lg border border-orange-200 bg-orange-50 text-sm", "data-testid": "scope-changes", children: [jsx("p", { className: "font-medium text-orange-800 mb-1", children: "Scope Changed" }), jsx("p", { className: "text-orange-700", children: l.scopeChanges.message })] }), l.rulesetChange && jsxs("div", { className: "p-3 rounded-lg border border-purple-200 bg-purple-50 text-sm", "data-testid": "ruleset-changes", children: [jsx("p", { className: "font-medium text-purple-800 mb-1", children: "Ruleset Changed" }), jsx("p", { className: "text-purple-700", children: l.rulesetChange.message })] }), g.length > 0 && jsx(ne, { title: "Record Changes", testId: "record-changes", children: jsx("div", { className: "overflow-x-auto", children: jsxs("table", { className: "min-w-full text-sm", children: [jsx("thead", { className: "bg-gray-50 text-gray-600", children: jsxs("tr", { children: [jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Change" }), jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Name" }), jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Type" }), jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Values" })] }) }), jsx("tbody", { className: "divide-y divide-gray-100", children: g.map((o) => {
    var _a, _b, _c, _d, _e2, _f;
    return jsxs("tr", { children: [jsx("td", { className: "px-3 py-1.5", children: jsx(ue, { type: o.type }) }), jsx("td", { className: "px-3 py-1.5 font-mono text-xs", children: o.name }), jsx("td", { className: "px-3 py-1.5 font-mono text-xs", children: o.recordType }), jsxs("td", { className: "px-3 py-1.5 text-xs", children: [o.type === "added" && ((_a = o.valuesB) == null ? void 0 : _a.join(", ")), o.type === "removed" && jsx("span", { className: "line-through text-gray-400", children: (_b = o.valuesA) == null ? void 0 : _b.join(", ") }), o.type === "modified" && jsxs("span", { children: [jsx("span", { className: "line-through text-red-400 mr-1", children: (_d = (_c = o.diff) == null ? void 0 : _c.removed) == null ? void 0 : _d.join(", ") }), jsx("span", { className: "text-green-700", children: (_f = (_e2 = o.diff) == null ? void 0 : _e2.added) == null ? void 0 : _f.join(", ") })] })] })] }, `${o.name}-${o.recordType}-${o.type}`);
  }) })] }) }) }), l.ttlChanges.length > 0 && jsx(ne, { title: "TTL Changes", testId: "ttl-changes", children: jsx("div", { className: "overflow-x-auto", children: jsxs("table", { className: "min-w-full text-sm", children: [jsx("thead", { className: "bg-gray-50 text-gray-600", children: jsxs("tr", { children: [jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Name" }), jsx("th", { className: "px-3 py-1.5 text-left font-medium", children: "Type" }), jsx("th", { className: "px-3 py-1.5 text-right font-medium", children: "Before" }), jsx("th", { className: "px-3 py-1.5 text-right font-medium", children: "After" }), jsx("th", { className: "px-3 py-1.5 text-right font-medium", children: "\u0394" })] }) }), jsx("tbody", { className: "divide-y divide-gray-100", children: l.ttlChanges.map((o) => jsxs("tr", { children: [jsx("td", { className: "px-3 py-1.5 font-mono text-xs", children: o.name }), jsx("td", { className: "px-3 py-1.5 font-mono text-xs", children: o.recordType }), jsxs("td", { className: "px-3 py-1.5 text-right tabular-nums", children: [o.ttlA, "s"] }), jsxs("td", { className: "px-3 py-1.5 text-right tabular-nums", children: [o.ttlB, "s"] }), jsxs("td", { className: `px-3 py-1.5 text-right tabular-nums ${o.change > 0 ? "text-green-700" : "text-red-700"}`, children: [o.change > 0 ? "+" : "", o.change, "s"] })] }, `${o.name}-${o.recordType}`)) })] }) }) }), i.totalChanges > 0 && jsx(ne, { title: "Finding Changes", testId: "finding-changes", children: jsxs("div", { className: "space-y-2", children: [jsxs("div", { className: "flex gap-3 text-xs text-gray-500 mb-2", children: [jsxs("span", { children: ["+", i.added, " added"] }), jsxs("span", { children: ["\u2212", i.removed, " removed"] }), jsxs("span", { children: ["~", i.modified, " modified"] })] }), l.findingChanges.filter((o) => o.type !== "unchanged").map((o) => jsxs("div", { className: "flex items-start gap-2 p-2 rounded border border-gray-100", children: [jsx(ue, { type: o.type }), jsxs("div", { children: [jsx("p", { className: "text-sm font-medium text-gray-900", children: o.title }), jsxs("p", { className: "text-xs text-gray-500", children: [o.findingType, o.severityA && o.severityB && o.severityA !== o.severityB ? ` \xB7 severity ${o.severityA} \u2192 ${o.severityB}` : o.severityB ? ` \xB7 ${o.severityB}` : ""] }), o.description && jsx("p", { className: "text-xs text-gray-400 mt-0.5", children: o.description })] })] }, `${o.findingType}-${o.type}`))] }) }), g.length === 0 && l.ttlChanges.length === 0 && i.totalChanges === 0 && jsx("div", { className: "text-center py-6 text-gray-500 text-sm", "data-testid": "no-changes", children: "No record or finding changes detected between these snapshots." })] });
}
function Y({ label: t, value: a, color: s }) {
  return jsxs("div", { className: `${{ green: "bg-green-50", red: "bg-red-50", yellow: "bg-yellow-50", gray: "bg-gray-50" }[s]} rounded-lg p-3 text-center`, children: [jsx("div", { className: "text-xl font-bold text-gray-900 tabular-nums", children: a }), jsx("div", { className: "text-xs text-gray-600", children: t })] });
}
function ue({ type: t }) {
  var _a, _b;
  const a = { added: "bg-green-100 text-green-800", removed: "bg-red-100 text-red-800", modified: "bg-yellow-100 text-yellow-800", unchanged: "bg-gray-100 text-gray-600" }, s = { added: "+", removed: "\u2212", modified: "~", unchanged: "=" };
  return jsx("span", { className: `inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold ${(_a = a[t]) != null ? _a : a.unchanged}`, children: (_b = s[t]) != null ? _b : "?" });
}
function ne({ title: t, testId: a, children: s }) {
  return jsxs("div", { "data-testid": a, children: [jsx("h5", { className: "font-medium text-gray-900 mb-2", children: t }), s] });
}
function ge({ children: t, color: a }) {
  return jsx("span", { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${{ gray: "bg-gray-100 text-gray-800", green: "bg-green-100 text-green-800", yellow: "bg-yellow-100 text-yellow-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800", purple: "bg-purple-100 text-purple-800", orange: "bg-orange-100 text-orange-800" }[a]}`, children: t });
}
function yt({ type: t }) {
  const a = { managed: { color: "green", label: "Managed Zone" }, unmanaged: { color: "yellow", label: "Unmanaged (Targeted)" }, unknown: { color: "gray", label: "Unknown" } }, { color: s, label: n } = a[t];
  return jsx(ge, { color: s, children: n });
}
function ft({ state: t }) {
  const a = { complete: { color: "green", label: "Complete" }, partial: { color: "yellow", label: "Partial" }, failed: { color: "red", label: "Failed" } }, { color: s, label: n } = a[t];
  return jsx(ge, { color: s, children: n });
}
async function bt(t) {
  var _a, _b;
  const a = await fetch(`/api/portfolio/domains/by-name/${encodeURIComponent(t)}`, { credentials: "include" });
  if (a.status === 401) {
    const n = new Error("Unauthorized");
    throw n.status = 401, n;
  }
  if (a.status === 403) {
    const n = new Error("Forbidden");
    throw n.status = 403, n;
  }
  if (a.status === 404) {
    const n = new Error("Not found");
    throw n.status = 404, n;
  }
  if (!a.ok) throw new Error("Failed to resolve domain");
  return (_b = (_a = (await a.json()).domain) == null ? void 0 : _a.id) != null ? _b : null;
}
async function xt(t) {
  const a = await fetch(`/api/portfolio/domains/${t}/tags`, { credentials: "include" });
  if (a.status === 401) {
    const n = new Error("Unauthorized");
    throw n.status = 401, n;
  }
  if (a.status === 403) {
    const n = new Error("Forbidden");
    throw n.status = 403, n;
  }
  if (!a.ok) throw new Error("Failed to fetch tags");
  return ((await a.json()).tags || []).map((n) => typeof n == "string" ? n : n.tag);
}
async function Nt() {
  const t = await fetch("/api/portfolio/tags", { credentials: "include" });
  return t.ok ? (await t.json()).tags || [] : [];
}
function he({ domainId: t, isDomainName: a = false, onTagsChange: s }) {
  var _a;
  const n = useQueryClient(), [i, l] = useState(""), [c, g] = useState(false), [d, o] = useState(null), { data: h, isLoading: S, error: N } = useQuery({ queryKey: ["domain-resolve", t, a], queryFn: () => a ? bt(t) : Promise.resolve(t), enabled: !!t, staleTime: 1 / 0 }), x = N ? N.status : void 0, { data: D = [], isLoading: f, error: y } = useQuery({ queryKey: ["tags", h], queryFn: () => xt(h), enabled: !!h }), { data: C = [] } = useQuery({ queryKey: ["portfolio-tags"], queryFn: Nt, staleTime: 1 / 0 }), u = y ? y.status : void 0, b = x === 401 || u === 401, $ = x === 403 || u === 403, R = x === 404, p = (_a = d != null ? d : N && x !== 401 && x !== 403 && x !== 404 ? N.message : null) != null ? _a : y && u !== 401 && u !== 403 ? y.message : null, m = useMutation({ mutationFn: async (v) => {
    const T = await fetch(`/api/portfolio/domains/${h}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag: v }), credentials: "include" });
    if (T.status === 401) {
      const A = new Error("Unauthorized");
      throw A.status = 401, A;
    }
    if (T.status === 403) {
      const A = new Error("Forbidden");
      throw A.status = 403, A;
    }
    if (!T.ok) throw new Error("Failed to add tag");
  }, onSuccess: (v, T) => {
    var _a2;
    l(""), g(false), n.invalidateQueries({ queryKey: ["tags", h] });
    const A = (_a2 = n.getQueryData(["tags", h])) != null ? _a2 : [];
    s == null ? void 0 : s([...A, T]);
  }, onError: (v) => {
    o(v instanceof Error ? v.message : "Failed to add tag");
  } }), E = useMutation({ mutationFn: async (v) => {
    const T = await fetch(`/api/portfolio/domains/${h}/tags/${encodeURIComponent(v)}`, { method: "DELETE", credentials: "include" });
    if (T.status === 401) {
      const A = new Error("Unauthorized");
      throw A.status = 401, A;
    }
    if (T.status === 403) {
      const A = new Error("Forbidden");
      throw A.status = 403, A;
    }
    if (!T.ok) throw new Error("Failed to remove tag");
  }, onSuccess: (v, T) => {
    var _a2;
    n.invalidateQueries({ queryKey: ["tags", h] });
    const A = (_a2 = n.getQueryData(["tags", h])) != null ? _a2 : [];
    s == null ? void 0 : s(A.filter((j) => j !== T));
  }, onError: (v) => {
    o(v instanceof Error ? v.message : "Failed to remove tag");
  } }), F = (v = i) => {
    const T = v.trim().toLowerCase();
    !T || !h || D.includes(T) || m.mutate(T);
  }, J = (v) => {
    h && E.mutate(v);
  }, Z = (v) => {
    v.key === "Enter" ? (v.preventDefault(), F()) : v.key === "Escape" && (g(false), l(""));
  }, X = C.filter((v) => !D.includes(v)), G = S || f, B = m.isPending || E.isPending;
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200 flex items-center justify-between", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Tags" }), !c && jsx("button", { type: "button", onClick: () => g(true), disabled: b || $, className: "text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400", children: "+ Add Tag" })] }), jsxs("div", { className: "p-4", children: [b && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view or edit tenant tags." }), $ && jsx("div", { className: "mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900", children: "You can view tenant tags here, but your current role cannot add or remove them." }), p && jsxs("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm", children: [p, jsx("button", { type: "button", onClick: () => o(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), c && jsxs("div", { className: "mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200", children: [jsxs("div", { className: "flex gap-2", children: [jsx("input", { type: "text", value: i, onChange: (v) => l(v.target.value), onKeyDown: Z, placeholder: "Enter tag name...", className: "flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100", disabled: b || $ }), jsx("button", { type: "button", onClick: () => F(), disabled: !i.trim() || B || b || $, className: "px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50", children: B ? "Adding..." : "Add" }), jsx("button", { type: "button", onClick: () => {
    g(false), l("");
  }, className: "px-4 py-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400", disabled: B || b || $, children: "Cancel" })] }), X.length > 0 && jsxs("div", { className: "mt-3", children: [jsx("span", { className: "text-sm text-gray-500", children: "Suggestions:" }), jsx("div", { className: "flex flex-wrap gap-2 mt-2", children: X.slice(0, 10).map((v) => jsx("button", { type: "button", onClick: () => F(v), disabled: B || b || $, className: "px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50", children: v }, v)) })] })] }), G ? jsx("div", { className: "text-center text-gray-500 py-4", children: "Loading tags..." }) : b ? jsx("div", { className: "text-center text-gray-500 py-4", children: "Sign in to view and manage tenant tags." }) : R ? jsx("div", { className: "text-center text-gray-500 py-4", children: "This domain must exist in the tenant portfolio before tags can be attached." }) : h ? D.length === 0 ? jsxs("div", { className: "text-center text-gray-500 py-4", children: ["No tags yet.", " ", !c && jsx("button", { type: "button", onClick: () => g(true), className: "text-blue-600 hover:text-blue-700 disabled:text-gray-400", disabled: b || $, children: "Add one" })] }) : jsx("div", { className: "flex flex-wrap gap-2", children: D.map((v) => jsxs("span", { className: "inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm", children: [v, jsx("button", { type: "button", onClick: () => J(v), className: "hover:bg-blue-200 rounded-full p-0.5 disabled:text-gray-400 disabled:hover:bg-transparent", disabled: b || $, "aria-label": `Remove ${v} tag`, children: jsx("svg", { "aria-hidden": "true", className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) }) })] }, v)) }) : jsx("div", { className: "text-center text-gray-500 py-4", children: "Tags are unavailable until domain context can be resolved." })] })] });
}
const pe = xe(), vt = Mt(), P = [{ id: "overview", label: "Overview" }, { id: "dns", label: "DNS" }, { id: "mail", label: "Mail" }, { id: "history", label: "History" }, ...pe ? [{ id: "delegation", label: "Delegation" }] : []];
async function wt(t) {
  const a = await fetch(`/api/domain/${t}/latest`, { credentials: "include" });
  if (!a.ok) {
    if (a.status === 404) return { snapshot: null, observations: [] };
    throw new Error(`Failed to load domain data: ${a.status} ${a.statusText}`);
  }
  const s = await a.json();
  let n = [];
  try {
    const i = await fetch(`/api/snapshot/${s.id}/observations`, { credentials: "include" });
    i.ok && (n = await i.json());
  } catch {
  }
  return { snapshot: s, observations: n };
}
function St({ domain: t, snapshot: a, observations: s }) {
  if (!a) return jsxs("div", { className: "space-y-6", children: [jsx("div", { className: "text-center py-12", children: jsxs("p", { className: "text-gray-500", children: ["No DNS evidence available yet for ", t, "."] }) }), jsxs("div", { className: "space-y-4", children: [jsxs("div", { children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Operator Context" }), jsx("p", { className: "text-sm text-gray-500", children: "Keep tenant-scoped notes and tags attached to the domain even before the next evidence refresh." })] }), jsxs("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-2", children: [jsx(ce, { domainId: t, isDomainName: true }), jsx(he, { domainId: t, isDomainName: true })] })] })] });
  const n = s.filter((l) => l.status === "success").length, i = s.length - n;
  return jsxs("div", { className: "space-y-6", children: [jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [jsx(se, { label: "Total Queries", value: s.length }), jsx(se, { label: "Successful", value: n, color: "green" }), jsx(se, { label: "Errors/Timeouts", value: i, color: i > 0 ? "red" : "gray" })] }), vt && jsxs("div", { children: [jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Fix Simulation" }), jsx("p", { className: "text-sm text-gray-500 mb-3", children: "Simulate DNS changes to see which findings would be resolved." }), jsx(mt, { snapshotId: a.id })] }), jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4", children: [jsx("h3", { className: "font-semibold text-blue-900 mb-3", children: "Query Scope" }), jsxs("div", { className: "space-y-3", children: [jsx(ie, { label: "Names", values: a.queriedNames || [] }), jsx(ie, { label: "Types", values: a.queriedTypes || [] }), jsx(ie, { label: "Vantages", values: a.vantages || [] })] }), a.zoneManagement === "unmanaged" ? jsx("p", { className: "mt-3 text-xs text-blue-700", children: "Targeted inspection mode: this is a DNS evidence snapshot, not a full zone enumeration." }) : null] }), jsxs("div", { children: [jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: "Snapshot Metadata" }), jsxs("dl", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm", children: [jsxs("div", { children: [jsx("dt", { className: "text-gray-500", children: "Created" }), jsx("dd", { className: "text-gray-900 tabular-nums", children: new Date(a.createdAt).toLocaleString() })] }), jsxs("div", { children: [jsx("dt", { className: "text-gray-500", children: "Duration" }), jsx("dd", { className: "text-gray-900 tabular-nums", children: a.collectionDurationMs ? `${a.collectionDurationMs}ms` : "N/A" })] }), jsxs("div", { children: [jsx("dt", { className: "text-gray-500", children: "Triggered By" }), jsx("dd", { className: "text-gray-900", children: a.triggeredBy || "Unknown" })] }), jsxs("div", { children: [jsx("dt", { className: "text-gray-500", children: "Ruleset" }), jsx("dd", { className: "text-gray-900", children: a.rulesetVersionId || "Pending evaluation" })] })] })] }), jsxs("div", { className: "space-y-4", children: [jsxs("div", { children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Operator Context" }), jsx("p", { className: "text-sm text-gray-500", children: "Keep tenant-scoped notes and tags attached to the domain alongside the latest DNS evidence." })] }), jsxs("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-2", children: [jsx(ce, { domainId: t, isDomainName: true }), jsx(he, { domainId: t, isDomainName: true })] })] })] });
}
function Ct({ observations: t }) {
  return t.length === 0 ? jsx("div", { className: "text-center py-12", children: jsx("p", { className: "text-gray-500", children: "No DNS observations available yet. Refresh to collect DNS data." }) }) : jsxs("div", { children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "DNS Records" }), jsx("p", { className: "text-sm text-gray-500", children: "View DNS evidence in Parsed, Raw, or Dig-style formats." })] }), jsx(je, { observations: t })] });
}
function kt({ domain: t, snapshotId: a }) {
  return a ? jsxs("div", { className: "space-y-6", children: [jsxs("section", { children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Mail Security Analysis" }), jsx("p", { className: "text-sm text-gray-500", children: "Persisted mail configuration findings based on collected evidence." })] }), jsx(He, { snapshotId: a })] }), jsxs("section", { children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "DKIM Selectors" }), jsx("p", { className: "text-sm text-gray-500", children: "Discovered DKIM selectors with provenance and confidence levels." })] }), jsx(Le, { snapshotId: a })] }), jsxs("section", { className: "border-t pt-4", children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Live Diagnostics" }), jsx("p", { className: "text-sm text-gray-500", children: "Run additional mail diagnostics to refresh and analyze current mail configuration." })] }), jsx(nt, { domain: t, snapshotId: a })] })] }) : jsx("div", { className: "text-center py-12", "data-testid": "mail-no-snapshot-state", children: jsxs("p", { className: "text-gray-500", children: ["No DNS evidence available yet for ", t, ". Refresh to collect mail data."] }) });
}
function $t({ domain: t }) {
  return jsxs("div", { children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Snapshot History" }), jsxs("p", { className: "text-sm text-gray-500", children: ["View and compare past DNS snapshots to track changes over time for ", t, "."] })] }), jsx(gt, { domain: t })] });
}
function Et({ domain: t, snapshotId: a }) {
  return jsxs("div", { children: [jsxs("div", { className: "mb-4", children: [jsx("h3", { className: "font-semibold text-gray-900", children: "Delegation Analysis" }), jsxs("p", { className: "text-sm text-gray-500", children: ["View delegation status, name server configuration, and glue records for ", t, "."] })] }), jsx(Fe, { snapshotId: a != null ? a : null })] });
}
function se({ label: t, value: a, color: s = "gray" }) {
  return jsxs("div", { className: `${{ gray: "bg-gray-50", green: "bg-green-50", red: "bg-red-50" }[s]} rounded-lg p-4 text-center`, children: [jsx("div", { className: "text-2xl font-bold text-gray-900 tabular-nums", children: a }), jsx("div", { className: "text-sm text-gray-600", children: t })] });
}
function ie({ label: t, values: a }) {
  return jsxs("div", { children: [jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-blue-700", children: t }), a.length > 0 ? jsx("div", { className: "mt-1 flex flex-wrap gap-1.5", children: a.map((s) => jsx("span", { className: "rounded-full bg-white/80 border border-blue-200 px-2 py-0.5 text-xs text-blue-900", children: s }, `${t}-${s}`)) }) : jsx("p", { className: "mt-1 text-sm text-blue-800", children: "N/A" })] });
}
const Vt = function() {
  var _a;
  const a = useQueryClient(), s = ve$1.useLoaderData(), { domain: n } = s, { tab: i } = ve$1.useSearch(), [l, c] = useState(i != null ? i : "overview"), [g, d] = useState(null), o = useId(), { data: h, isLoading: S, error: N } = useQuery({ queryKey: ["domain-data", n], queryFn: () => wt(n), enabled: !!n }), x = (_a = h == null ? void 0 : h.snapshot) != null ? _a : null, D = Array.isArray(h == null ? void 0 : h.observations) ? h.observations : [], f = N ? { type: N instanceof Error && N.message.startsWith("Failed to load") ? "fetch_error" : "api_unreachable", message: N instanceof Error ? N.message : "Unable to reach the API server" } : void 0, y = useMutation({ mutationFn: async () => {
    const m = await fetch("/api/collect/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: n, zoneManagement: "unmanaged" }), credentials: "include" });
    if (!m.ok) {
      const E = await m.json().catch(() => ({ error: "Refresh failed" }));
      throw m.status === 401 || m.status === 403 ? new Error("Authentication failed. Please sign in again.") : m.status === 503 ? new Error("DNS collector is temporarily unavailable. The service may be restarting \u2014 try again in 30 seconds.") : m.status === 429 ? new Error(E.message || "Collection rate limit reached. Wait 60 seconds before retrying.") : new Error(E.message || E.error || `Collection failed (${m.status})`);
    }
  }, onSuccess: () => {
    a.invalidateQueries({ queryKey: ["domain-data", n] });
  }, onError: (m) => {
    d(m instanceof Error ? m.message : "Refresh failed");
  } }), C = useCallback((m) => {
    if (c(m), "undefined" < "u") ;
  }, []), u = (m) => `${o}-domain-tab-${m}`, b = (m) => `${o}-domain-panel-${m}`, $ = (m) => {
    requestAnimationFrame(() => {
      var _a2;
      (_a2 = document.getElementById(u(m))) == null ? void 0 : _a2.focus();
    });
  }, R = (m, E) => {
    if (m.key === "ArrowRight") {
      m.preventDefault();
      const F = P[(E + 1) % P.length];
      C(F.id), $(F.id);
      return;
    }
    if (m.key === "ArrowLeft") {
      m.preventDefault();
      const F = P[(E - 1 + P.length) % P.length];
      C(F.id), $(F.id);
      return;
    }
    if (m.key === "Home") {
      m.preventDefault(), C(P[0].id), $(P[0].id);
      return;
    }
    m.key === "End" && (m.preventDefault(), C(P[P.length - 1].id), $(P[P.length - 1].id));
  };
  useEffect(() => {
    !S && !x && !N && !y.isPending && !y.isSuccess && (d(null), y.mutate());
  }, [S, x, N, y.isPending, y.isSuccess, y]);
  const p = useCallback(() => {
    d(null), y.mutate();
  }, [y]);
  return jsxs("div", { "data-loaded": !S || void 0, children: [jsxs("div", { className: "mb-6", children: [jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [jsx("h1", { className: "text-3xl font-bold text-gray-900 break-all", children: n }), jsx("button", { type: "button", onClick: p, disabled: y.isPending, "aria-busy": y.isPending, className: "focus-ring min-h-10 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400", children: y.isPending ? "Refreshing..." : "Refresh" })] }), x ? jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [jsx(yt, { type: x.zoneManagement }), jsx(ft, { state: x.resultState }), jsxs("span", { className: "text-sm text-gray-500 tabular-nums", children: ["Last updated: ", new Date(x.createdAt).toLocaleString()] })] }) : f ? jsx("div", { className: `mt-4 p-4 rounded-lg border ${f.type === "api_unreachable" ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200"}`, "data-testid": "loader-error-banner", children: jsx("p", { className: f.type === "api_unreachable" ? "text-red-800" : "text-orange-800", children: f.message }) }) : y.isPending ? jsx("div", { className: "mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg", "data-testid": "domain-collecting-banner", children: jsxs("div", { className: "flex items-center gap-3", children: [jsx("div", { className: "animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" }), jsxs("p", { className: "text-blue-800", children: ["Collecting DNS data for ", jsx("strong", { children: n }), "... This takes about 5 seconds."] })] }) }) : jsx("div", { className: "mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg", "data-testid": "domain-no-data-banner", children: jsxs("p", { className: "text-yellow-800", children: ["No DNS data for ", n, " yet. Click ", jsx("strong", { children: "Refresh" }), " to collect now."] }) }), g ? jsx("div", { className: "mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700", "data-testid": "domain-refresh-error-banner", role: "alert", children: g }) : null] }), jsx("div", { className: "border-b border-gray-200 mb-6 overflow-x-auto", children: jsx("div", { role: "tablist", "aria-label": "Domain DNS views", className: "-mb-px flex w-max min-w-full space-x-4 sm:space-x-8", children: P.map((m, E) => jsx("button", { type: "button", id: u(m.id), role: "tab", "aria-selected": l === m.id, "aria-controls": b(m.id), tabIndex: l === m.id ? 0 : -1, onClick: () => C(m.id), onKeyDown: (F) => R(F, E), className: `focus-ring min-h-10 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${l === m.id ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`, children: m.label }, m.id)) }) }), jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6", children: [jsx("div", { role: "tabpanel", id: b("overview"), "aria-labelledby": u("overview"), hidden: l !== "overview", "data-testid": "domain-tabpanel-overview", children: l === "overview" && jsx(St, { domain: n, snapshot: x, observations: D }) }), jsx("div", { role: "tabpanel", id: b("dns"), "aria-labelledby": u("dns"), hidden: l !== "dns", "data-testid": "domain-tabpanel-dns", children: l === "dns" && jsx(Ct, { observations: D }) }), jsx("div", { role: "tabpanel", id: b("mail"), "aria-labelledby": u("mail"), hidden: l !== "mail", "data-testid": "domain-tabpanel-mail", children: l === "mail" && jsx(kt, { domain: n, snapshotId: x == null ? void 0 : x.id }) }), jsx("div", { role: "tabpanel", id: b("history"), "aria-labelledby": u("history"), hidden: l !== "history", "data-testid": "domain-tabpanel-history", children: l === "history" && jsx($t, { domain: n }) }), pe && jsx("div", { role: "tabpanel", id: b("delegation"), "aria-labelledby": u("delegation"), hidden: l !== "delegation", "data-testid": "domain-tabpanel-delegation", children: l === "delegation" && jsx(Et, { domain: n, snapshotId: x == null ? void 0 : x.id }) })] })] });
};

export { Vt as component };
//# sourceMappingURL=_domain-DJPc2vNI.mjs.map
