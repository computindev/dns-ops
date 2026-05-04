import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { Link } from '@tanstack/react-router';
import { useState, useId, useMemo, useCallback } from 'react';
import { useQueryClient, useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { p, u, x } from './StateDisplay-DMFHryPA.mjs';

const ce = [{ value: "all", label: "All statuses" }, { value: "pending", label: "Pending" }, { value: "sent", label: "Sent" }, { value: "suppressed", label: "Suppressed" }, { value: "acknowledged", label: "Acknowledged" }, { value: "resolved", label: "Resolved" }], me = [{ value: "all", label: "All severities" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "info", label: "Info" }], ue = { critical: "bg-red-100 text-red-800", high: "bg-orange-100 text-orange-800", medium: "bg-yellow-100 text-yellow-800", low: "bg-blue-100 text-blue-800", info: "bg-gray-100 text-gray-700" }, he = { pending: "bg-red-50 text-red-700", sent: "bg-blue-50 text-blue-700", suppressed: "bg-gray-100 text-gray-700", acknowledged: "bg-amber-100 text-amber-800", resolved: "bg-green-100 text-green-800" };
function ge(t) {
  return ["pending", "sent", "suppressed"].includes(t);
}
function pe(t) {
  return ["pending", "sent", "acknowledged"].includes(t);
}
function be(t) {
  return ["pending", "sent", "acknowledged", "suppressed"].includes(t);
}
function H(t) {
  return t ? new Date(t).toLocaleString() : "\u2014";
}
const ye = 25;
async function xe(t, a, s) {
  var _a, _b, _c, _d;
  const m = new URLSearchParams({ limit: String(ye), offset: String(s) });
  t !== "all" && m.set("status", t), a !== "all" && m.set("severity", a);
  const u = await fetch(`/api/alerts?${m.toString()}`, { credentials: "include" });
  if (u.status === 401) {
    const d = new Error("Unauthorized");
    throw d.status = 401, d;
  }
  if (u.status === 403) {
    const d = new Error("Forbidden");
    throw d.status = 403, d;
  }
  if (!u.ok) {
    const d = await u.json().catch(() => ({}));
    throw new Error(d.error || "Failed to load alerts");
  }
  const b = await u.json();
  let y = {};
  try {
    const d = await fetch("/api/monitoring/domains", { credentials: "include" });
    if (d.ok) {
      const w = await d.json();
      y = Object.fromEntries((w.monitoredDomains || []).map((k) => [k.id, k.domainName]));
    }
  } catch {
  }
  const h = (b.alerts || []).map((d) => {
    var _a2;
    return { ...d, domainName: (_a2 = y[d.monitoredDomainId]) != null ? _a2 : null };
  });
  return { alerts: h, nextOffset: s + h.length, hasMore: (_b = (_a = b.pagination) == null ? void 0 : _a.hasMore) != null ? _b : false, total: (_d = (_c = b.pagination) == null ? void 0 : _c.total) != null ? _d : h.length };
}
function fe() {
  var _a, _b;
  const t = useQueryClient(), [a, s] = useState("all"), [m, u$1] = useState("all"), [b, y] = useState(null), [h, d] = useState({}), [w, k] = useState({}), [S, i] = useState(null), { data: c, isLoading: C, isFetchingNextPage: p$1, fetchNextPage: v, hasNextPage: g, error: D } = useInfiniteQuery({ queryKey: ["alerts", a, m], queryFn: ({ pageParam: o = 0 }) => xe(a, m, o), getNextPageParam: (o) => o.hasMore ? o.nextOffset : void 0, initialPageParam: 0 }), n = useMemo(() => {
    var _a2;
    return (_a2 = c == null ? void 0 : c.pages.flatMap((o) => o.alerts)) != null ? _a2 : [];
  }, [c]), N = (_b = (_a = c == null ? void 0 : c.pages[0]) == null ? void 0 : _a.total) != null ? _b : 0, M = D ? D.status : void 0, x$1 = M === 401, A = D && M !== 401 && M !== 403 ? D.message : null, P = (o) => {
    i(null), k({}), y(null), s(o);
  }, T = (o) => {
    i(null), k({}), y(null), u$1(o);
  }, l = useMutation({ mutationFn: async ({ alertId: o, action: L, resolutionNote: I }) => {
    const j = await fetch(`/api/alerts/${o}/${L}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: L === "resolve" ? JSON.stringify({ resolutionNote: I }) : void 0 });
    if (j.status === 401) {
      const E = new Error("Unauthorized");
      throw E.status = 401, E;
    }
    if (j.status === 403) {
      const E = new Error("Forbidden");
      throw E.status = 403, E;
    }
    if (!j.ok) {
      const E = await j.json().catch(() => ({}));
      throw new Error(E.error || `Failed to ${L} alert`);
    }
  }, onSuccess: () => {
    i(null), k({}), t.invalidateQueries({ queryKey: ["alerts"] });
  }, onError: (o) => {
    y(o instanceof Error ? o.message : "Action failed");
  }, onSettled: (o, L, I) => {
    d((j) => ({ ...j, [I.alertId]: null }));
  } }), F = (o, L, I) => {
    d((j) => ({ ...j, [o]: L })), y(null), l.mutate({ alertId: o, action: L, resolutionNote: I });
  };
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [jsxs("div", { children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Alerts" }), jsx("p", { className: "text-sm text-gray-500", children: "Review alert state, triage, and resolve operator-visible issues" })] }), jsxs("div", { className: "flex flex-col gap-2 sm:flex-row", children: [jsxs("label", { className: "text-sm text-gray-600", children: [jsx("span", { className: "sr-only", children: "Filter by status" }), jsx("select", { value: a, onChange: (o) => P(o.target.value), disabled: x$1, className: "rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500", children: ce.map((o) => jsx("option", { value: o.value, children: o.label }, o.value)) })] }), jsxs("label", { className: "text-sm text-gray-600", children: [jsx("span", { className: "sr-only", children: "Filter by severity" }), jsx("select", { value: m, onChange: (o) => T(o.target.value), disabled: x$1, className: "rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500", children: me.map((o) => jsx("option", { value: o.value, children: o.label }, o.value)) })] })] })] }), jsxs("div", { className: "p-4 space-y-4", children: [x$1 ? jsx("div", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to review or mutate tenant alerts." }) : null, A ? jsx(p, { title: "Alerts unavailable", message: A, onRetry: () => t.invalidateQueries({ queryKey: ["alerts"] }), size: "sm" }) : null, b ? jsx("div", { className: "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700", children: b }) : null, C ? jsx(u, { message: "Loading alerts...", size: "md" }) : x$1 ? jsx(x, { icon: "shield", title: "Sign in required", description: "Sign in to review and manage tenant alerts." }) : n.length === 0 ? jsx(x, { icon: "inbox", title: a === "all" && m === "all" ? "No alerts yet" : "No alerts match these filters", description: a === "all" && m === "all" ? "Once monitored domains produce alerts, they will appear here." : "Try broadening the current status or severity filters." }) : jsxs("div", { className: "space-y-3", children: [jsxs("div", { className: "text-sm text-gray-500", children: ["Showing ", n.length, " of ", N, " alerts"] }), n.map((o) => {
    const L = h[o.id], I = w[o.id] || "", j = S === o.id;
    return jsxs("div", { className: "rounded-lg border border-gray-200 p-4 space-y-3", children: [jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", children: [jsxs("div", { className: "min-w-0", children: [jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [o.domainName ? jsx(Link, { to: "/domain/$domain", params: { domain: o.domainName.toLowerCase() }, className: "font-medium text-blue-600 hover:text-blue-700", children: o.domainName }) : jsx("h4", { className: "font-medium text-gray-900", children: "Unknown domain" }), jsx("span", { className: `rounded-full px-2 py-0.5 text-xs font-medium ${ue[o.severity]}`, children: o.severity }), jsx("span", { className: `rounded-full px-2 py-0.5 text-xs font-medium ${he[o.status]}`, children: o.status })] }), jsx("p", { className: "mt-1 text-sm font-medium text-gray-800", children: o.title }), jsx("p", { className: "mt-1 text-sm text-gray-600", children: o.description })] }), jsxs("div", { className: "text-xs text-gray-500 text-left sm:text-right", children: [jsxs("div", { children: ["Created ", H(o.createdAt)] }), o.acknowledgedAt ? jsxs("div", { children: ["Acknowledged ", H(o.acknowledgedAt)] }) : null, o.resolvedAt ? jsxs("div", { children: ["Resolved ", H(o.resolvedAt)] }) : null] })] }), o.resolutionNote ? jsxs("div", { className: "rounded bg-gray-50 px-3 py-2 text-sm text-gray-600", children: ["Resolution note: ", o.resolutionNote] }) : null, jsxs("div", { className: "flex flex-wrap gap-2", children: [ge(o.status) ? jsx("button", { type: "button", disabled: !!L || x$1, onClick: () => F(o.id, "acknowledge"), className: "focus-ring rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400", children: L === "acknowledge" ? "Acknowledging..." : "Acknowledge" }) : null, pe(o.status) ? jsx("button", { type: "button", disabled: !!L || x$1, onClick: () => F(o.id, "suppress"), className: "focus-ring rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400", children: L === "suppress" ? "Suppressing..." : "Suppress" }) : null, be(o.status) ? jsx("button", { type: "button", disabled: !!L || x$1, onClick: () => {
      i(j ? null : o.id), k((E) => {
        var _a2, _b2;
        return { ...E, [o.id]: (_b2 = (_a2 = E[o.id]) != null ? _a2 : o.resolutionNote) != null ? _b2 : "" };
      });
    }, className: "focus-ring rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400", children: "Resolve" }) : null] }), j ? jsxs("div", { className: "rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2", children: [jsxs("label", { className: "block text-sm font-medium text-gray-700", children: ["Resolution note", jsx("textarea", { value: I, onChange: (E) => k(($) => ({ ...$, [o.id]: E.target.value })), rows: 3, disabled: !!L || x$1, className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100", placeholder: "Describe how this alert was resolved" })] }), jsxs("div", { className: "flex flex-wrap gap-2", children: [jsx("button", { type: "button", disabled: !!L || x$1, onClick: () => F(o.id, "resolve", I.trim() || void 0), className: "focus-ring rounded-lg bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:bg-gray-400", children: L === "resolve" ? "Resolving..." : "Confirm Resolve" }), jsx("button", { type: "button", disabled: !!L, onClick: () => i(null), className: "focus-ring rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" })] })] }) : null] }, o.id);
  }), g ? jsx("button", { type: "button", disabled: p$1 || x$1, onClick: () => v(), className: "focus-ring rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400", children: p$1 ? "Loading more..." : "Load more alerts" }) : null] })] })] });
}
const ve = { domain_note_created: "Created note", domain_note_updated: "Updated note", domain_note_deleted: "Deleted note", domain_tag_added: "Added tag", domain_tag_removed: "Removed tag", filter_created: "Created filter", filter_updated: "Updated filter", filter_deleted: "Deleted filter", template_override_created: "Created override", template_override_updated: "Updated override", template_override_deleted: "Deleted override", remediation_request_created: "Created remediation request", remediation_request_updated: "Updated remediation request", shared_report_created: "Created shared report", shared_report_expired: "Expired shared report", monitored_domain_created: "Created monitored domain", monitored_domain_updated: "Updated monitored domain", monitored_domain_deleted: "Deleted monitored domain", monitored_domain_toggled: "Toggled monitored domain", alert_acknowledged: "Acknowledged alert", alert_resolved: "Resolved alert", alert_suppressed: "Suppressed alert" }, Z = { note: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", tag: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z", filter: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z", override: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", remediation: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", shared: "M17 20h5V4H2v16h5m10 0v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6m10 0H7", monitored: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }, Ne = { created: "text-green-600 bg-green-50", updated: "text-blue-600 bg-blue-50", deleted: "text-red-600 bg-red-50", added: "text-green-600 bg-green-50", removed: "text-red-600 bg-red-50" };
async function we(t) {
  const a = await fetch(`/api/portfolio/audit?limit=${t}`, { credentials: "include" });
  if (a.status === 401) {
    const m = new Error("Unauthorized");
    throw m.status = 401, m;
  }
  if (a.status === 403) {
    const m = new Error("Forbidden");
    throw m.status = 403, m;
  }
  if (!a.ok) throw new Error("Failed to fetch audit log");
  return (await a.json()).events || [];
}
function ke() {
  const [t, a] = useState(20), [s, m] = useState(null), { data: u = [], isLoading: b, error: y, refetch: h } = useQuery({ queryKey: ["audit-log", t], queryFn: () => we(t) }), d = y ? y.status : void 0, w = d === 401, k = y && d !== 401 && d !== 403 ? y.message : null, S = (c) => c.includes("note") ? "note" : c.includes("tag") ? "tag" : c.includes("filter") ? "filter" : c.includes("override") ? "override" : c.includes("remediation") ? "remediation" : c.includes("shared_report") ? "shared" : c.includes("monitored_domain") ? "monitored" : c.includes("alert_") ? "alert" : "note", i = (c) => c.includes("created") ? "created" : c.includes("updated") ? "updated" : c.includes("deleted") ? "deleted" : c.includes("added") ? "added" : c.includes("removed") || c.includes("suppressed") ? "removed" : c.includes("acknowledged") ? "updated" : c.includes("resolved") ? "created" : (c.includes("toggled"), "updated");
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200 flex items-center justify-between", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Audit Log" }), jsx("button", { type: "button", onClick: () => h(), disabled: b || w, className: "text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50", children: "Refresh" })] }), jsxs("div", { className: "p-4", children: [w && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view the tenant audit log." }), k && jsx("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm", children: k }), b ? jsx("div", { className: "text-center text-gray-500 py-8", children: "Loading audit log..." }) : w ? jsx("div", { className: "text-center text-gray-500 py-8", children: "Sign in to view the tenant audit log." }) : u.length === 0 ? jsx("div", { className: "text-center text-gray-500 py-8", children: "No audit events found" }) : jsxs("div", { className: "space-y-3", children: [u.map((c) => jsx(Ce, { event: c, isExpanded: s === c.id, onToggle: () => m(s === c.id ? null : c.id), category: S(c.action), colorKey: i(c.action) }, c.id)), u.length >= t && jsx("div", { className: "text-center pt-2", children: jsx("button", { type: "button", onClick: () => a(t + 20), className: "text-sm text-blue-600 hover:text-blue-700", children: "Load more events" }) })] })] })] });
}
function Ce({ event: t, isExpanded: a, onToggle: s, category: m, colorKey: u }) {
  const b = Z[m] || Z.note, y = Ne[u] || "text-gray-600 bg-gray-50", h = (d) => {
    const w = new Date(d), S = (/* @__PURE__ */ new Date()).getTime() - w.getTime(), i = Math.floor(S / 6e4), c = Math.floor(S / 36e5), C = Math.floor(S / 864e5);
    return i < 1 ? "just now" : i < 60 ? `${i}m ago` : c < 24 ? `${c}h ago` : C < 7 ? `${C}d ago` : w.toLocaleDateString();
  };
  return jsxs("div", { className: "flex gap-3", children: [jsx("div", { className: `flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${y}`, children: jsx("svg", { "aria-hidden": "true", className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: b }) }) }), jsxs("div", { className: "flex-1 min-w-0", children: [jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { children: [jsx("span", { className: "font-medium text-gray-900", children: ve[t.action] || t.action }), jsxs("span", { className: "text-gray-500 text-sm ml-2", children: ["by ", t.actorEmail || t.actorId] })] }), jsx("span", { className: "text-xs text-gray-400 flex-shrink-0", children: h(t.createdAt) })] }), jsxs("p", { className: "text-sm text-gray-600 mt-0.5", children: [t.entityType, " ", jsxs("span", { className: "font-mono text-xs", children: [t.entityId.slice(0, 8), "..."] })] }), (t.previousValue || t.newValue) && jsx("button", { type: "button", onClick: s, className: "mt-1 text-xs text-gray-500 hover:text-gray-700", children: a ? "Hide details" : "Show details" }), a && jsxs("div", { className: "mt-2 space-y-2", children: [t.previousValue && jsxs("div", { children: [jsx("p", { className: "text-xs font-medium text-gray-500", children: "Before:" }), jsx("pre", { className: "mt-1 bg-red-50 p-2 rounded text-xs text-red-800 overflow-x-auto", children: JSON.stringify(t.previousValue, null, 2) })] }), t.newValue && jsxs("div", { children: [jsx("p", { className: "text-xs font-medium text-gray-500", children: "After:" }), jsx("pre", { className: "mt-1 bg-green-50 p-2 rounded text-xs text-green-800 overflow-x-auto", children: JSON.stringify(t.newValue, null, 2) })] })] })] })] });
}
const Se = [{ id: "mail-security-baseline", name: "Mail Security Baseline", description: "Check SPF, DMARC, DKIM across inventory", checks: ["spf", "dmarc", "dkim", "mx"] }, { id: "infrastructure-audit", name: "Infrastructure Audit", description: "Identify stale IPs and infrastructure issues", checks: ["infrastructure", "delegation"] }, { id: "full-check", name: "Full Check", description: "Complete check of all aspects", checks: ["spf", "dmarc", "dkim", "mx", "infrastructure", "delegation"] }];
function Ee() {
  var _a, _b;
  const t = useId(), a = Se, [s, m] = useState(null), [u, b] = useState(""), [y, h] = useState(false), [d, w] = useState(null), [k, S] = useState(false), [i, c] = useState(null), [C, p] = useState(false), v = (n) => n.split(/[\n,]/).map((N) => N.trim().toLowerCase()).filter((N) => N == null ? void 0 : N.includes(".")), g = useCallback(async (n) => {
    try {
      const N = await n.text(), M = await fetch("/api/fleet-report/import-csv", { method: "POST", body: N });
      if (!M.ok) {
        if (M.status === 401) throw S(true), new Error("Operator sign-in is required to import fleet report inventories.");
        if (M.status === 403) throw new Error("You do not have permission to import fleet report inventories.");
        const A = await M.json().catch(() => ({}));
        throw new Error(A.error || "Failed to parse CSV");
      }
      S(false);
      const x = await M.json();
      b(x.inventory.join(`
`));
    } catch (N) {
      w(N instanceof Error ? N.message : "Failed to import CSV");
    }
  }, []), D = async () => {
    const n = v(u);
    if (n.length === 0) {
      w("Please enter at least one domain");
      return;
    }
    if (!s) {
      w("Please select a report template");
      return;
    }
    h(true), w(null), c(null);
    try {
      const N = await fetch("/api/fleet-report/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventory: n, checks: s.checks, format: "detailed" }) });
      if (!N.ok) {
        if (N.status === 401) throw S(true), new Error("Operator sign-in is required to run fleet reports.");
        if (N.status === 403) throw new Error("You do not have permission to run fleet reports.");
        const x = await N.json().catch(() => ({}));
        throw new Error(x.error || "Failed to run report");
      }
      S(false);
      const M = await N.json();
      c(M);
    } catch (N) {
      w(N instanceof Error ? N.message : "Failed to run report");
    } finally {
      h(false);
    }
  };
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Fleet Reports" }), jsx("p", { className: "text-sm text-gray-500", children: "Run bulk checks across your domain inventory" })] }), jsxs("div", { className: "p-4 space-y-4", children: [k && jsx("div", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to import inventory or run tenant fleet reports." }), d && jsxs("div", { className: "p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm", children: [d, jsx("button", { type: "button", onClick: () => w(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), jsxs("div", { children: [jsx("p", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Report Template" }), jsx("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3", children: a.map((n) => jsxs("button", { type: "button", onClick: () => m(n), className: `p-3 text-left rounded-lg border-2 transition-colors ${(s == null ? void 0 : s.id) === n.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`, children: [jsx("div", { className: "font-medium text-gray-900", children: n.name }), jsx("p", { className: "text-xs text-gray-500 mt-1", children: n.description }), jsx("div", { className: "mt-2 flex flex-wrap gap-1", children: n.checks.map((N) => jsx("span", { className: "px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600 uppercase", children: N }, N)) })] }, n.id)) })] }), jsxs("div", { children: [jsx("label", { htmlFor: t, className: "block text-sm font-medium text-gray-700 mb-1", children: "Domain Inventory" }), jsx("textarea", { id: t, value: u, onChange: (n) => b(n.target.value), rows: 6, placeholder: `Enter domain names, one per line or comma-separated:
example.com
example.org, example.net`, className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm" }), jsxs("div", { className: "mt-2 flex items-center gap-4", children: [jsxs("span", { className: "text-xs text-gray-500", children: [v(u).length, " domains"] }), jsxs("label", { className: "text-xs text-blue-600 hover:text-blue-700 cursor-pointer", children: [jsx("input", { type: "file", accept: ".csv", className: "hidden", disabled: k, onChange: (n) => {
    var _a2;
    const N = (_a2 = n.target.files) == null ? void 0 : _a2[0];
    N && g(N);
  } }), "Import from CSV"] })] })] }), jsx("div", { className: "flex justify-end", children: jsx("button", { type: "button", onClick: D, disabled: k || y || !s || v(u).length === 0, className: "px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed", children: y ? "Running Report..." : "Run Report" }) }), i && jsxs("div", { className: "border-t pt-4 mt-4 space-y-4", children: [jsxs("div", { className: "flex items-center justify-between", children: [jsx("h4", { className: "font-medium text-gray-900", children: "Report Results" }), jsxs("span", { className: "text-sm text-gray-500", children: ["Generated ", new Date(i.reportGeneratedAt).toLocaleString()] })] }), jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3", children: [jsx(B, { label: "Domains Checked", value: i.domainsChecked, color: "blue" }), jsx(B, { label: "With Issues", value: i.summary.domainsWithIssues, color: i.summary.domainsWithIssues > 0 ? "yellow" : "green" }), jsx(B, { label: "High Priority", value: ((_a = i.highPriorityIssues) == null ? void 0 : _a.length) || 0, color: ((_b = i.highPriorityIssues) == null ? void 0 : _b.length) ? "red" : "green" }), jsx(B, { label: "Errors", value: i.domainsWithErrors, color: i.domainsWithErrors > 0 ? "orange" : "green" })] }), i.highPriorityIssues && i.highPriorityIssues.length > 0 && jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4", children: [jsx("h5", { className: "font-medium text-red-900 mb-2", children: "High Priority Issues" }), jsxs("div", { className: "space-y-2", children: [i.highPriorityIssues.slice(0, 10).map((n) => jsxs("div", { className: "text-sm", children: [jsx("span", { className: `inline-block w-16 px-1.5 py-0.5 rounded text-xs text-center font-medium ${n.severity === "critical" ? "bg-red-600 text-white" : "bg-orange-500 text-white"}`, children: n.severity }), jsx("span", { className: "ml-2 text-gray-700", children: n.message })] }, `${n.severity}-${n.message}`)), i.highPriorityIssues.length > 10 && jsxs("p", { className: "text-xs text-red-700", children: ["...and ", i.highPriorityIssues.length - 10, " more"] })] })] }), i.results && i.results.length > 0 && jsxs("div", { children: [jsx("button", { type: "button", onClick: () => p(!C), className: "text-sm text-blue-600 hover:text-blue-700 font-medium", children: C ? "Hide Details" : "Show Domain Details" }), C && jsx("div", { className: "mt-3 space-y-2 max-h-96 overflow-y-auto", children: i.results.map((n) => jsx(De, { result: n }, n.domain)) })] }), i.errors && i.errors.length > 0 && jsxs("div", { className: "bg-orange-50 border border-orange-200 rounded-lg p-4", children: [jsx("h5", { className: "font-medium text-orange-900 mb-2", children: "Errors" }), jsxs("div", { className: "space-y-1 text-sm text-orange-800", children: [i.errors.slice(0, 10).map((n) => jsxs("div", { children: [jsx("span", { className: "font-mono", children: n.domain }), ": ", n.error] }, `${n.domain}-${n.error}`)), i.errors.length > 10 && jsxs("p", { className: "text-xs", children: ["...and ", i.errors.length - 10, " more"] })] })] })] })] })] });
}
function B({ label: t, value: a, color: s }) {
  return jsxs("div", { className: `p-3 rounded-lg ${{ blue: "bg-blue-50 text-blue-900", green: "bg-green-50 text-green-900", yellow: "bg-yellow-50 text-yellow-900", red: "bg-red-50 text-red-900", orange: "bg-orange-50 text-orange-900" }[s]}`, children: [jsx("div", { className: "text-2xl font-bold tabular-nums", children: a }), jsx("div", { className: "text-sm", children: t })] });
}
function De({ result: t }) {
  const [a, s] = useState(false), m = t.issues.length > 0;
  return jsxs("div", { className: `p-3 rounded-lg border ${m ? "border-yellow-200 bg-yellow-50" : "border-gray-200 bg-gray-50"}`, children: [jsxs("div", { className: "flex items-center justify-between", children: [jsxs("div", { children: [jsx("span", { className: "font-medium text-gray-900", children: t.domain }), jsxs("span", { className: "ml-2 text-xs text-gray-500", children: [t.findingsCount, " findings"] })] }), jsxs("button", { type: "button", onClick: () => s(!a), className: "text-sm text-gray-500 hover:text-gray-700", children: [a ? "Hide" : "Show", " checks"] })] }), a && jsx("div", { className: "mt-2 space-y-1", children: t.checks.map((u) => jsxs("div", { className: "flex items-center gap-2 text-sm", children: [jsx(Fe, { status: u.status }), jsx("span", { className: "uppercase text-xs font-medium text-gray-600 w-20", children: u.check }), jsx("span", { className: "text-gray-700", children: u.message })] }, `${u.check}-${u.status}-${u.message}`)) })] });
}
function Fe({ status: t }) {
  const a = { pass: "bg-green-100 text-green-700", fail: "bg-red-100 text-red-700", warning: "bg-yellow-100 text-yellow-700", missing: "bg-gray-100 text-gray-600" }, s = { pass: "\u2713", fail: "\u2717", warning: "!", missing: "?" };
  return jsx("span", { className: `w-5 h-5 flex items-center justify-center rounded text-xs font-bold ${a[t]}`, children: s[t] });
}
const Me = [{ value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }];
async function Ae() {
  const t = await fetch("/api/monitoring/domains", { credentials: "include" });
  if (t.status === 401) {
    const a = new Error("Unauthorized");
    throw a.status = 401, a;
  }
  if (t.status === 403) {
    const a = new Error("Forbidden");
    throw a.status = 403, a;
  }
  if (!t.ok) throw new Error("Failed to fetch monitored domains");
  return await t.json();
}
function Le() {
  var _a;
  const t = useQueryClient(), [a, s] = useState(false), [m, u] = useState(null), [b, y] = useState(null), { data: h, isLoading: d, error: w } = useQuery({ queryKey: ["monitoring-domains"], queryFn: Ae }), k = (_a = h == null ? void 0 : h.monitoredDomains) != null ? _a : [], i = (w ? w.status : void 0) === 401, c = useMutation({ mutationFn: async (g) => {
    const D = await fetch(`/api/monitoring/domains/${g}`, { method: "DELETE" });
    if (D.status === 401) {
      const n = new Error("Unauthorized");
      throw n.status = 401, n;
    }
    if (D.status === 403) {
      const n = new Error("Forbidden");
      throw n.status = 403, n;
    }
    if (!D.ok) throw new Error("Failed to delete");
  }, onSuccess: () => {
    t.invalidateQueries({ queryKey: ["monitoring-domains"] });
  }, onError: (g) => {
    y(g instanceof Error ? g.message : "Failed to delete");
  } }), C = useMutation({ mutationFn: async (g) => {
    const D = await fetch(`/api/monitoring/domains/${g}/toggle`, { method: "POST" });
    if (D.status === 401) {
      const n = new Error("Unauthorized");
      throw n.status = 401, n;
    }
    if (D.status === 403) {
      const n = new Error("Forbidden");
      throw n.status = 403, n;
    }
    if (!D.ok) throw new Error("Failed to toggle");
  }, onSuccess: () => {
    t.invalidateQueries({ queryKey: ["monitoring-domains"] });
  }, onError: (g) => {
    y(g instanceof Error ? g.message : "Failed to toggle");
  } }), p = (g) => {
    confirm("Are you sure you want to remove this domain from monitoring?") && c.mutate(g);
  }, v = (g) => {
    C.mutate(g);
  };
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200 flex items-center justify-between", children: [jsxs("div", { children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Monitored Domains" }), jsx("p", { className: "text-sm text-gray-500", children: "Configure automatic monitoring and alerts" })] }), jsx("button", { type: "button", onClick: () => s(true), disabled: i, className: "px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400", children: "+ Add Domain" })] }), jsxs("div", { className: "p-4", children: [i && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view or change monitored domains." }), b && jsxs("div", { className: "mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm", children: [b, jsx("button", { type: "button", onClick: () => y(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), (a || m) && jsx(Te, { editingDomain: m, authRequired: i, onAuthRequired: () => {
    y("Operator sign-in is required to save monitoring configuration.");
  }, onClose: () => {
    s(false), u(null);
  }, onSave: () => {
    t.invalidateQueries({ queryKey: ["monitoring-domains"] }), s(false), u(null);
  } }), d ? jsx("div", { className: "text-center text-gray-500 py-8", children: "Loading monitored domains..." }) : i ? jsx("div", { className: "text-center py-8 text-gray-500", children: "Sign in to view and manage tenant monitoring configuration." }) : k.length === 0 ? jsxs("div", { className: "text-center py-8", children: [jsx("div", { className: "text-gray-400 mb-2", children: jsx("svg", { className: "w-12 h-12 mx-auto", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", "aria-hidden": "true", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 1.5, d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" }) }) }), jsx("p", { className: "text-gray-500", children: "No domains are being monitored yet." }), jsx("button", { type: "button", onClick: () => s(true), disabled: i, className: "mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:text-gray-400", children: "Add your first domain" })] }) : jsx("div", { className: "space-y-3", children: k.map((g) => jsx(Pe, { domain: g, onEdit: () => u(g), onDelete: () => p(g.id), onToggle: () => v(g.id), disabled: i }, g.id)) })] })] });
}
function Pe({ domain: t, onEdit: a, onDelete: s, onToggle: m, disabled: u = false }) {
  const b = (h) => {
    if (!h) return "Never";
    const d = new Date(h), k = (/* @__PURE__ */ new Date()).getTime() - d.getTime(), S = Math.floor(k / 6e4), i = Math.floor(k / 36e5), c = Math.floor(k / 864e5);
    return S < 1 ? "just now" : S < 60 ? `${S}m ago` : i < 24 ? `${i}h ago` : c < 7 ? `${c}d ago` : d.toLocaleDateString();
  }, y = () => {
    var _a;
    const h = [];
    return ((_a = t.alertChannels.email) == null ? void 0 : _a.length) && h.push(`${t.alertChannels.email.length} email(s)`), t.alertChannels.webhook && h.push("webhook"), t.alertChannels.slack && h.push("slack"), h.length > 0 ? h.join(", ") : "None configured";
  };
  return jsx("div", { className: `p-4 rounded-lg border ${t.isActive ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50 opacity-75"}`, children: jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { className: "flex-1 min-w-0", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx(Link, { to: "/domain/$domain", params: { domain: t.domainName.toLowerCase() }, className: "font-medium text-blue-600 hover:text-blue-700", children: t.domainName }), jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${t.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`, children: t.isActive ? "Active" : "Paused" }), jsx("span", { className: "px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium capitalize", children: t.schedule })] }), jsxs("div", { className: "mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm", children: [jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Last check:" }), " ", jsx("span", { className: "text-gray-700", children: b(t.lastCheckAt) })] }), jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Last alert:" }), " ", jsx("span", { className: "text-gray-700", children: b(t.lastAlertAt) })] }), jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Max alerts/day:" }), " ", jsx("span", { className: "text-gray-700", children: t.maxAlertsPerDay })] }), jsxs("div", { children: [jsx("span", { className: "text-gray-500", children: "Channels:" }), " ", jsx("span", { className: "text-gray-700", children: y() })] })] })] }), jsxs("div", { className: "flex items-center gap-1 ml-4", children: [jsx("button", { type: "button", onClick: m, className: "p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:text-gray-300 disabled:hover:bg-transparent", title: t.isActive ? "Pause monitoring" : "Resume monitoring", disabled: u, children: t.isActive ? jsx("svg", { "aria-hidden": "true", className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" }) }) : jsxs("svg", { "aria-hidden": "true", className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" }), jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })] }) }), jsx("button", { type: "button", onClick: a, className: "p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:text-gray-300 disabled:hover:bg-transparent", title: "Edit", disabled: u, children: jsx("svg", { "aria-hidden": "true", className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }) }) }), jsx("button", { type: "button", onClick: s, className: "p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:text-gray-300 disabled:hover:bg-transparent", title: "Remove from monitoring", disabled: u, children: jsx("svg", { "aria-hidden": "true", className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) }) })] })] }) });
}
function Te({ editingDomain: t, authRequired: a, onAuthRequired: s, onClose: m, onSave: u }) {
  var _a, _b, _c;
  const b = useId(), y = `${b}-domain-name`, h = `${b}-schedule`, d = `${b}-emails`, w = `${b}-webhook`, k = `${b}-slack`, S = `${b}-max-alerts`, i = `${b}-suppression`, [c, C] = useState((t == null ? void 0 : t.domainName) || ""), [p, v] = useState((t == null ? void 0 : t.schedule) || "daily"), [g, D] = useState(((_a = t == null ? void 0 : t.alertChannels.email) == null ? void 0 : _a.join(", ")) || ""), [n, N] = useState((t == null ? void 0 : t.alertChannels.webhook) || ""), [M, x] = useState((t == null ? void 0 : t.alertChannels.slack) || ""), [A, P] = useState(((_b = t == null ? void 0 : t.maxAlertsPerDay) == null ? void 0 : _b.toString()) || "5"), [T, l] = useState(((_c = t == null ? void 0 : t.suppressionWindowMinutes) == null ? void 0 : _c.toString()) || "60"), [F, o] = useState(false), [L, I] = useState(null);
  return jsx("div", { className: "mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200", children: jsxs("form", { onSubmit: async (E) => {
    if (E.preventDefault(), !t && !c.trim()) {
      I("Domain name is required");
      return;
    }
    o(true), I(null);
    try {
      const $ = g.split(",").map((W) => W.trim()).filter(Boolean), ae = { ...t ? {} : { domainName: c.trim() }, schedule: p, alertChannels: { ...$.length > 0 && { email: $ }, ...n.trim() && { webhook: n.trim() }, ...M.trim() && { slack: M.trim() } }, maxAlertsPerDay: parseInt(A, 10) || 5, suppressionWindowMinutes: parseInt(T, 10) || 60 }, se = t ? `/api/monitoring/domains/${t.id}` : "/api/monitoring/domains", U = await fetch(se, { method: t ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ae) });
      if (!U.ok) {
        if (U.status === 401) throw s(), new Error("Operator sign-in is required to save monitoring configuration.");
        if (U.status === 403) throw new Error("You do not have permission to save monitoring configuration.");
        const W = await U.json().catch(() => ({}));
        throw new Error(W.error || "Failed to save");
      }
      u();
    } catch ($) {
      I($ instanceof Error ? $.message : "Failed to save");
    } finally {
      o(false);
    }
  }, children: [jsx("h4", { className: "font-medium text-gray-900 mb-3", children: t ? `Edit ${t.domainName}` : "Add Domain to Monitoring" }), L && jsx("div", { className: "mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-sm", children: L }), jsxs("div", { className: "space-y-3", children: [!t && jsxs("div", { children: [jsxs("label", { htmlFor: y, className: "block text-sm font-medium text-gray-700 mb-1", children: ["Domain Name ", jsx("span", { className: "text-red-500", children: "*" })] }), jsx("input", { type: "text", id: y, value: c, onChange: (E) => C(E.target.value), placeholder: "example.com", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100", disabled: a })] }), jsxs("div", { children: [jsx("label", { htmlFor: h, className: "block text-sm font-medium text-gray-700 mb-1", children: "Check Schedule" }), jsx("select", { id: h, value: p, onChange: (E) => v(E.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100", disabled: a, children: Me.map((E) => jsx("option", { value: E.value, children: E.label }, E.value)) })] }), jsxs("div", { className: "border-t pt-3", children: [jsx("h5", { className: "text-sm font-medium text-gray-700 mb-2", children: "Alert Channels" }), jsxs("div", { className: "space-y-2", children: [jsxs("div", { children: [jsx("label", { htmlFor: d, className: "block text-xs text-gray-500 mb-1", children: "Email addresses (comma-separated)" }), jsx("input", { type: "text", id: d, value: g, onChange: (E) => D(E.target.value), placeholder: "admin@example.com, ops@example.com", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100", disabled: a })] }), jsxs("div", { children: [jsx("label", { htmlFor: w, className: "block text-xs text-gray-500 mb-1", children: "Webhook URL" }), jsx("input", { type: "url", id: w, value: n, onChange: (E) => N(E.target.value), placeholder: "https://...", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100", disabled: a })] }), jsxs("div", { children: [jsx("label", { htmlFor: k, className: "block text-xs text-gray-500 mb-1", children: "Slack Channel" }), jsx("input", { type: "text", id: k, value: M, onChange: (E) => x(E.target.value), placeholder: "#dns-alerts", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100", disabled: a })] })] })] }), jsxs("div", { className: "border-t pt-3", children: [jsx("h5", { className: "text-sm font-medium text-gray-700 mb-2", children: "Noise Budget" }), jsxs("div", { className: "grid grid-cols-2 gap-3", children: [jsxs("div", { children: [jsx("label", { htmlFor: S, className: "block text-xs text-gray-500 mb-1", children: "Max alerts per day" }), jsx("input", { type: "number", id: S, value: A, onChange: (E) => P(E.target.value), min: "1", max: "100", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100", disabled: a })] }), jsxs("div", { children: [jsx("label", { htmlFor: i, className: "block text-xs text-gray-500 mb-1", children: "Suppression window (minutes)" }), jsx("input", { type: "number", id: i, value: T, onChange: (E) => l(E.target.value), min: "1", max: "1440", className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100", disabled: a })] })] })] })] }), jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [jsx("button", { type: "button", onClick: m, className: "px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800", disabled: F || a, children: "Cancel" }), jsx("button", { type: "submit", disabled: F || a || !t && !c.trim(), className: "px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50", children: F ? "Saving..." : t ? "Update" : "Add Domain" })] })] }) });
}
const ee = { query: "", tags: [], severities: [], zoneManagement: [] };
function q(t) {
  return { query: t.query.trim(), tags: V(t.tags.map((a) => a.trim().toLowerCase()).filter(Boolean)), severities: V(t.severities), zoneManagement: V(t.zoneManagement) };
}
function Ie(t) {
  const a = q(t);
  return a.query.length > 0 || a.tags.length > 0 || a.severities.length > 0 || a.zoneManagement.length > 0;
}
function X(t) {
  const a = q(t), s = {};
  return a.query && (s.domainPatterns = [a.query]), a.tags.length > 0 && (s.tags = a.tags), a.severities.length > 0 && (s.findings = { severities: a.severities }), a.zoneManagement.length > 0 && (s.zoneManagement = a.zoneManagement), s;
}
function je(t) {
  const a = q(t);
  return { ...a.query ? { query: a.query } : {}, ...a.tags.length > 0 ? { tags: a.tags } : {}, ...a.severities.length > 0 ? { severities: a.severities } : {}, ...a.zoneManagement.length > 0 ? { zoneManagement: a.zoneManagement } : {}, limit: 20, offset: 0 };
}
function Y(t) {
  var _a, _b;
  const a = [];
  return t.domainPatterns && t.domainPatterns.length > 1 && a.push("multiple domain patterns"), ((_a = t.findings) == null ? void 0 : _a.types) && t.findings.types.length > 0 && a.push("finding types"), ((_b = t.findings) == null ? void 0 : _b.minConfidence) && a.push("minimum confidence"), t.lastSnapshotWithin && a.push("snapshot recency"), { supported: a.length === 0, reasons: a };
}
function te(t) {
  var _a, _b;
  return q({ query: ((_a = t.domainPatterns) == null ? void 0 : _a.length) === 1 ? t.domainPatterns[0] : "", tags: t.tags || [], severities: ((_b = t.findings) == null ? void 0 : _b.severities) || [], zoneManagement: t.zoneManagement || [] });
}
function V(t) {
  return [...new Set(t)];
}
const re = ["critical", "high", "medium", "low", "info"], Oe = ["managed", "unmanaged", "unknown"];
function qe({ currentFilters: t, onFiltersChange: a }) {
  var _a, _b;
  const s = useQueryClient(), m = useId(), u = `${m}-portfolio-search-query`, b = `${m}-portfolio-search-tags`, [y, h] = useState(""), d = useMemo(() => q(t), [t]), { data: w } = useQuery({ queryKey: ["portfolio-tags"], queryFn: async () => {
    const l = await fetch("/api/portfolio/tags", { credentials: "include" });
    return l.ok ? await l.json() : { tags: [] };
  }, staleTime: 1 / 0 }), k = (_a = w == null ? void 0 : w.tags) != null ? _a : [], { data: S, isLoading: i, error: c, isError: C } = useQuery({ queryKey: ["portfolio-search", d], queryFn: async ({ signal: l }) => {
    const F = await fetch("/api/portfolio/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(je(d)), signal: l, credentials: "include" });
    if (!F.ok) {
      if (F.status === 401 || F.status === 403) {
        const L = new Error("auth");
        throw L.status = F.status, L;
      }
      const o = await F.json().catch(() => ({}));
      throw new Error(o.error || "Failed to search portfolio");
    }
    return await F.json();
  } }), p = (_b = S == null ? void 0 : S.domains) != null ? _b : [], v = C && (c == null ? void 0 : c.status) === 401, g = C && !v ? c.message : null, D = true, n = k.filter((l) => !d.tags.includes(l)), N = (l) => {
    a(q({ ...d, ...l }));
  }, M = (l) => {
    N({ severities: d.severities.includes(l) ? d.severities.filter((F) => F !== l) : [...d.severities, l] });
  }, x = (l) => {
    N({ zoneManagement: d.zoneManagement.includes(l) ? d.zoneManagement.filter((F) => F !== l) : [...d.zoneManagement, l] });
  }, A = (l) => {
    const F = l.trim().toLowerCase();
    !F || d.tags.includes(F) || (N({ tags: [...d.tags, F] }), h(""));
  }, P = (l) => {
    N({ tags: d.tags.filter((F) => F !== l) });
  }, T = () => {
    h(""), a(ee);
  };
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-white shadow-sm", children: [jsxs("div", { className: "border-b border-gray-200 px-4 py-3", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Portfolio Search" }), jsx("p", { className: "text-sm text-gray-500", children: "Search tenant domains by name, tag, severity, and zone-management state." })] }), jsxs("div", { className: "space-y-4 p-4", children: [v && jsx("div", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to search tenant domains and load saved filters." }), g && jsxs("div", { className: "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800", children: [g, jsx("button", { type: "button", onClick: () => s.invalidateQueries({ queryKey: ["portfolio-search"] }), className: "ml-2 text-red-600 hover:text-red-800", children: "Retry" })] }), jsxs("div", { children: [jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", htmlFor: u, children: "Query" }), jsx("input", { id: u, type: "text", value: d.query, onChange: (l) => N({ query: l.target.value }), disabled: v, placeholder: "example.com", className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" })] }), jsxs("div", { children: [jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", htmlFor: b, children: "Tags" }), jsxs("div", { className: "flex gap-2", children: [jsx("input", { id: b, type: "text", value: y, onChange: (l) => h(l.target.value), onKeyDown: (l) => {
    (l.key === "Enter" || l.key === ",") && (l.preventDefault(), A(y));
  }, disabled: v, placeholder: "Add a tag", className: "flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" }), jsx("button", { type: "button", onClick: () => A(y), disabled: v || y.trim().length === 0, className: "rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50", children: "Add" })] }), d.tags.length > 0 && jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: d.tags.map((l) => jsxs("button", { type: "button", onClick: () => P(l), disabled: v, className: "rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800 disabled:opacity-60", children: [l, " \xD7"] }, l)) }), n.length > 0 && jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: n.slice(0, 8).map((l) => jsx("button", { type: "button", onClick: () => A(l), disabled: v, className: "rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 disabled:opacity-60", children: l }, l)) })] }), jsxs("fieldset", { children: [jsx("legend", { className: "mb-1 text-sm font-medium text-gray-700", children: "Severity" }), jsx("div", { className: "flex flex-wrap gap-3", children: re.map((l) => jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [jsx("input", { type: "checkbox", checked: d.severities.includes(l), onChange: () => M(l), disabled: v }), l] }, l)) })] }), jsxs("fieldset", { children: [jsx("legend", { className: "mb-1 text-sm font-medium text-gray-700", children: "Zone Management" }), jsx("div", { className: "flex flex-wrap gap-3", children: Oe.map((l) => jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [jsx("input", { type: "checkbox", checked: d.zoneManagement.includes(l), onChange: () => x(l), disabled: v }), l] }, l)) })] }), jsx("div", { className: "flex justify-end", children: jsx("button", { type: "button", onClick: T, disabled: v, className: "text-sm text-gray-600 hover:text-gray-800 disabled:text-gray-400", children: "Clear filters" }) }), jsxs("div", { className: "border-t border-gray-200 pt-4", children: [jsxs("div", { className: "mb-3 flex items-center justify-between", children: [jsx("h4", { className: "font-medium text-gray-900", children: "Results" }), !i && D && !v && jsx("span", { className: "text-sm text-gray-500", children: p.length === 20 ? "Showing first 20 matching domains. Refine filters to narrow results." : `Showing ${p.length} matching domain${p.length === 1 ? "" : "s"}` })] }), i ? jsx("div", { className: "py-8 text-center text-gray-500", children: "Searching portfolio..." }) : v ? jsx("div", { className: "py-8 text-center text-gray-500", children: "Sign in to search tenant domains." }) : g ? jsx("div", { className: "py-8 text-center text-gray-500", children: "Search is unavailable right now." }) : p.length === 0 ? jsx("div", { className: "py-8 text-center text-gray-500", children: "No tenant domains matched the current filters." }) : jsx("div", { className: "space-y-3", children: p.map((l) => jsx($e, { result: l }, l.id)) })] })] })] });
}
function $e({ result: t }) {
  const a = t.findings.reduce((s, m) => (s[m.severity] += 1, s), { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-gray-50 p-4", children: [jsx("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", children: jsxs("div", { children: [jsx(Link, { to: "/domain/$domain", params: { domain: t.normalizedName }, className: "text-base font-medium text-blue-600 hover:text-blue-700", children: t.name }), jsxs("div", { className: "mt-1 flex flex-wrap gap-2 text-xs text-gray-500", children: [jsx("span", { className: "rounded bg-white px-2 py-0.5 text-gray-700", children: t.zoneManagement }), t.latestSnapshot ? jsxs("span", { children: [t.latestSnapshot.resultState, " \xB7", " ", new Date(t.latestSnapshot.createdAt).toLocaleString()] }) : jsx("span", { children: "No snapshot available yet" })] })] }) }), jsx("div", { className: "mt-3 text-sm text-gray-600", children: t.findingsEvaluated ? t.findings.length === 0 ? jsx("span", { children: "No matching findings for the current filters." }) : jsx("div", { className: "flex flex-wrap gap-2", children: re.filter((s) => a[s] > 0).map((s) => jsxs("span", { className: "rounded bg-white px-2 py-0.5 text-xs text-gray-700", children: [s, ": ", a[s]] }, s)) }) : jsx("span", { children: "Rules not evaluated yet." }) })] });
}
async function ze() {
  const t = await fetch("/api/portfolio/filters", { credentials: "include" });
  if (t.status === 401) {
    const a = new Error("Unauthorized");
    throw a.status = 401, a;
  }
  if (t.status === 403) {
    const a = new Error("Forbidden");
    throw a.status = 403, a;
  }
  if (!t.ok) throw new Error("Failed to fetch filters");
  return await t.json();
}
function Re({ currentFilters: t, onLoadFilter: a, onSaveComplete: s }) {
  var _a;
  const m = useQueryClient(), [u, b] = useState(false), [y, h] = useState(null), [d, w] = useState(null), { data: k, isLoading: S, error: i } = useQuery({ queryKey: ["saved-filters"], queryFn: ze }), c = (_a = k == null ? void 0 : k.filters) != null ? _a : [], p = (i ? i.status : void 0) === 401, v = useMutation({ mutationFn: async (x) => {
    const A = await fetch(`/api/portfolio/filters/${x}`, { method: "DELETE" });
    if (A.status === 401) {
      const P = new Error("Unauthorized");
      throw P.status = 401, P;
    }
    if (A.status === 403) {
      const P = new Error("Forbidden");
      throw P.status = 403, P;
    }
    if (!A.ok) throw new Error("Failed to delete filter");
  }, onSuccess: () => {
    m.invalidateQueries({ queryKey: ["saved-filters"] });
  }, onError: (x) => {
    w(x instanceof Error ? x.message : "Failed to delete filter");
  } }), g = useMutation({ mutationFn: async ({ filterId: x, isShared: A }) => {
    const P = await fetch(`/api/portfolio/filters/${x}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isShared: A }) });
    if (P.status === 401) {
      const T = new Error("Unauthorized");
      throw T.status = 401, T;
    }
    if (P.status === 403) {
      const T = new Error("Forbidden");
      throw T.status = 403, T;
    }
    if (!P.ok) throw new Error("Failed to update filter");
  }, onSuccess: () => {
    m.invalidateQueries({ queryKey: ["saved-filters"] });
  }, onError: (x) => {
    w(x instanceof Error ? x.message : "Failed to update filter");
  } }), D = p, n = Ie(t), N = q(t), M = (x) => {
    const A = Y(x.criteria);
    if (!A.supported) {
      w(`This saved filter uses unsupported criteria for the current UI: ${A.reasons.join(", ")}.`);
      return;
    }
    a(te(x.criteria));
  };
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-white shadow-sm", children: [jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 px-4 py-3", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Saved Filters" }), n && jsx("button", { type: "button", onClick: () => b(true), disabled: D, className: "text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400", children: "+ Save Current" })] }), jsxs("div", { className: "p-4", children: [p && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view or manage saved filters." }), d && jsxs("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800", children: [d, jsx("button", { type: "button", onClick: () => w(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), (u || y) && jsx(Ue, { currentFilters: t, editingFilter: y, authRequired: p, onAuthRequired: () => {
    w("Operator sign-in is required to save filters."), b(false), h(null);
  }, onClose: () => {
    b(false), h(null);
  }, onSave: () => {
    m.invalidateQueries({ queryKey: ["saved-filters"] }), b(false), h(null), s == null ? void 0 : s();
  } }), S ? jsx("div", { className: "py-4 text-center text-gray-500", children: "Loading saved filters..." }) : p ? jsx("div", { className: "py-4 text-center text-gray-500", children: "Sign in to view tenant saved filters." }) : c.length === 0 ? jsxs("div", { className: "py-4 text-center text-gray-500", children: ["No saved filters yet.", n && jsxs(Fragment, { children: [" ", jsx("button", { type: "button", onClick: () => b(true), className: "text-blue-600 hover:text-blue-700 disabled:text-gray-400", disabled: D, children: "Save current filters" })] })] }) : jsx("div", { className: "space-y-3", children: c.map((x) => jsx(_e, { filter: x, isActive: Ke(N, x), onLoad: () => M(x), onEdit: () => h(x), onDelete: () => v.mutate(x.id), onToggleShare: () => g.mutate({ filterId: x.id, isShared: !x.isShared }) }, x.id)) })] })] });
}
function _e({ filter: t, isActive: a, onLoad: s, onEdit: m, onDelete: u, onToggleShare: b }) {
  const y = We(t.criteria), h = Y(t.criteria);
  return jsx("div", { className: `rounded-lg border p-3 ${a ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50"}`, children: jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { className: "min-w-0 flex-1", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx("span", { className: "truncate font-medium text-gray-900", children: t.name }), t.isShared && jsx("span", { className: "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700", children: "Shared" }), a && jsx("span", { className: "rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700", children: "Active" }), !h.supported && jsx("span", { className: "rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800", children: "Partial" })] }), t.description && jsx("p", { className: "mt-1 truncate text-sm text-gray-600", children: t.description }), jsxs("div", { className: "mt-1 text-xs text-gray-500", children: [y, " filter", y !== 1 ? "s" : "", " \xB7 owner ", t.createdBy] }), !h.supported && jsxs("p", { className: "mt-1 text-xs text-yellow-700", children: ["Unsupported criteria: ", h.reasons.join(", ")] })] }), jsxs("div", { className: "ml-2 flex items-center gap-1", children: [jsx("button", { type: "button", onClick: s, disabled: !h.supported, className: "rounded p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 disabled:text-gray-300 disabled:hover:bg-transparent", title: h.supported ? "Load filter" : "Filter uses unsupported criteria", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" }) }) }), jsx("button", { type: "button", onClick: m, disabled: !t.canManage, className: "rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:text-gray-300 disabled:hover:bg-transparent", title: t.canManage ? "Edit filter" : "Only the creator can edit this filter", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }) }) }), jsx("button", { type: "button", onClick: b, disabled: !t.canManage, className: `rounded p-1.5 disabled:text-gray-300 disabled:hover:bg-transparent ${t.isShared ? "text-green-600 hover:bg-green-50 hover:text-green-700" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`, title: t.canManage ? t.isShared ? "Unshare filter" : "Share filter" : "Only the creator can share this filter", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" }) }) }), jsx("button", { type: "button", onClick: u, disabled: !t.canManage, className: "rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:text-gray-300 disabled:hover:bg-transparent", title: t.canManage ? "Delete filter" : "Only the creator can delete this filter", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) }) })] })] }) });
}
function Ue({ currentFilters: t, editingFilter: a, authRequired: s, onAuthRequired: m, onClose: u, onSave: b }) {
  const y = useId(), h = `${y}-filter-name`, d = `${y}-filter-description`, w = `${y}-filter-shared`, [k, S] = useState((a == null ? void 0 : a.name) || ""), [i, c] = useState((a == null ? void 0 : a.description) || ""), [C, p] = useState((a == null ? void 0 : a.isShared) || false), [v, g] = useState(false), [D, n] = useState(null), N = async (x) => {
    if (x.preventDefault(), !k.trim()) {
      n("Name is required");
      return;
    }
    g(true), n(null);
    try {
      const A = a ? { name: k.trim(), description: i.trim() || null, isShared: C } : { name: k.trim(), description: i.trim() || null, criteria: X(t), isShared: C }, P = a ? `/api/portfolio/filters/${a.id}` : "/api/portfolio/filters", T = await fetch(P, { method: a ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(A) });
      if (!T.ok) {
        const l = await T.json().catch(() => ({}));
        throw T.status === 401 ? (m(), new Error("Operator sign-in is required to save filters.")) : T.status === 403 ? new Error("You do not have permission to manage this filter.") : new Error(l.error || "Failed to save filter");
      }
      b();
    } catch (A) {
      n(A instanceof Error ? A.message : "Failed to save filter");
    } finally {
      g(false);
    }
  }, M = (a == null ? void 0 : a.criteria) || X(t);
  return jsx("div", { className: "mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4", children: jsxs("form", { onSubmit: N, children: [jsx("h4", { className: "mb-3 font-medium text-gray-900", children: a ? "Edit Filter Metadata" : "Save Filter" }), a && jsx("p", { className: "mb-3 text-sm text-gray-600", children: "Editing updates name, description, and sharing only. Stored filter criteria stay unchanged." }), D && jsx("div", { className: "mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800", children: D }), jsxs("div", { className: "space-y-3", children: [jsxs("div", { children: [jsxs("label", { htmlFor: h, className: "mb-1 block text-sm font-medium text-gray-700", children: ["Name ", jsx("span", { className: "text-red-500", children: "*" })] }), jsx("input", { type: "text", id: h, value: k, onChange: (x) => S(x.target.value), placeholder: "e.g., Critical Issues", disabled: s, className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" })] }), jsxs("div", { children: [jsx("label", { htmlFor: d, className: "mb-1 block text-sm font-medium text-gray-700", children: "Description" }), jsx("input", { type: "text", id: d, value: i, onChange: (x) => c(x.target.value), placeholder: "Optional description...", disabled: s, className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" })] }), jsxs("div", { className: "flex items-center gap-2", children: [jsx("input", { type: "checkbox", id: w, checked: C, onChange: (x) => p(x.target.checked), disabled: s, className: "h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" }), jsx("label", { htmlFor: w, className: "text-sm text-gray-700", children: "Share with team" })] }), jsxs("div", { className: "rounded border border-gray-200 bg-white p-2", children: [jsx("p", { className: "mb-1 text-xs font-medium text-gray-500", children: "Filter criteria:" }), jsx(Be, { criteria: M })] })] }), jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [jsx("button", { type: "button", onClick: u, className: "px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800", disabled: v || s, children: "Cancel" }), jsx("button", { type: "submit", disabled: v || s || !k.trim(), className: "rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: v ? "Saving..." : a ? "Update" : "Save" })] })] }) });
}
function Be({ criteria: t }) {
  var _a, _b, _c, _d, _e2, _f, _g, _h;
  const a = [];
  return ((_a = t.domainPatterns) == null ? void 0 : _a.length) && a.push(...t.domainPatterns.map((s) => `Query: ${s}`)), ((_b = t.tags) == null ? void 0 : _b.length) && a.push(...t.tags), ((_d = (_c = t.findings) == null ? void 0 : _c.severities) == null ? void 0 : _d.length) && a.push(...t.findings.severities), ((_e2 = t.zoneManagement) == null ? void 0 : _e2.length) && a.push(...t.zoneManagement), ((_g = (_f = t.findings) == null ? void 0 : _f.types) == null ? void 0 : _g.length) && a.push(...t.findings.types.map((s) => `Type: ${s}`)), ((_h = t.findings) == null ? void 0 : _h.minConfidence) && a.push(`Confidence: ${t.findings.minConfidence}`), t.lastSnapshotWithin && a.push(`Snapshot <= ${t.lastSnapshotWithin}d`), a.length === 0 ? jsx("span", { className: "text-xs text-gray-400", children: "No filters selected" }) : jsx("div", { className: "flex flex-wrap gap-1", children: a.map((s) => jsx("span", { className: "rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700", children: s }, s)) });
}
function Ke(t, a) {
  return Y(a.criteria).supported ? JSON.stringify(q(t)) === JSON.stringify(te(a.criteria)) : false;
}
function We(t) {
  var _a, _b, _c, _d, _e2, _f, _g;
  let a = 0;
  return ((_a = t.domainPatterns) == null ? void 0 : _a.length) && (a += t.domainPatterns.length), ((_b = t.zoneManagement) == null ? void 0 : _b.length) && (a += t.zoneManagement.length), ((_c = t.tags) == null ? void 0 : _c.length) && (a += t.tags.length), ((_e2 = (_d = t.findings) == null ? void 0 : _d.severities) == null ? void 0 : _e2.length) && (a += t.findings.severities.length), ((_g = (_f = t.findings) == null ? void 0 : _f.types) == null ? void 0 : _g.length) && (a += t.findings.types.length), t.lastSnapshotWithin && (a += 1), a;
}
async function He() {
  const t = await fetch("/api/alerts/reports", { credentials: "include" });
  if (t.status === 401) {
    const a = new Error("Unauthorized");
    throw a.status = 401, a;
  }
  if (t.status === 403) {
    const a = new Error("Forbidden");
    throw a.status = 403, a;
  }
  if (!t.ok) {
    const a = await t.json().catch(() => ({}));
    throw new Error(a.error || "Failed to load shared reports");
  }
  return await t.json();
}
function Ve() {
  var _a;
  const t = useQueryClient(), [a, s] = useState(""), [m, u] = useState(null), b = useId(), y = useMemo(() => "" , []), { data: h, isLoading: d, error: w } = useQuery({ queryKey: ["shared-reports"], queryFn: He }), k = (_a = h == null ? void 0 : h.reports) != null ? _a : [], i = (w ? w.status : void 0) === 401, c = useMutation({ mutationFn: async (p) => {
    const v = await fetch("/api/alerts/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: p.trim() || void 0, visibility: "shared", expiresInDays: 7 }), credentials: "include" });
    if (v.status === 401) {
      const g = new Error("Unauthorized");
      throw g.status = 401, g;
    }
    if (v.status === 403) {
      const g = new Error("Forbidden");
      throw g.status = 403, g;
    }
    if (!v.ok) {
      const g = await v.json().catch(() => ({}));
      throw new Error(g.error || "Failed to create shared report");
    }
  }, onSuccess: () => {
    s(""), t.invalidateQueries({ queryKey: ["shared-reports"] });
  }, onError: (p) => {
    u(p instanceof Error ? p.message : "Failed to create shared report");
  } }), C = useMutation({ mutationFn: async (p) => {
    const v = await fetch(`/api/alerts/reports/${p}/expire`, { method: "POST", credentials: "include" });
    if (v.status === 401) {
      const g = new Error("Unauthorized");
      throw g.status = 401, g;
    }
    if (v.status === 403) {
      const g = new Error("Forbidden");
      throw g.status = 403, g;
    }
    if (!v.ok) {
      const g = await v.json().catch(() => ({}));
      throw new Error(g.error || "Failed to expire shared report");
    }
  }, onSuccess: () => {
    t.invalidateQueries({ queryKey: ["shared-reports"] });
  }, onError: (p) => {
    u(p instanceof Error ? p.message : "Failed to expire shared report");
  } });
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200", children: [jsxs("div", { className: "px-4 py-3 border-b border-gray-200", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Shared Reports" }), jsx("p", { className: "text-sm text-gray-500", children: "Create persisted, redacted reports for external stakeholders" })] }), jsxs("div", { className: "p-4 space-y-4", children: [m && jsx("div", { className: "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700", children: m }), i && jsx("div", { className: "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to list or create tenant shared reports. Public share links continue to work without sign-in." }), jsxs("div", { className: "rounded-lg border border-gray-200 p-4 space-y-3", children: [jsxs("div", { children: [jsx("label", { htmlFor: b, className: "block text-sm font-medium text-gray-700", children: "Report title" }), jsx("input", { id: b, type: "text", value: a, onChange: (p) => s(p.target.value), placeholder: "Weekly stakeholder report", disabled: i, className: "focus-ring mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100 disabled:text-gray-500" })] }), jsx("button", { type: "button", onClick: () => c.mutate(a), disabled: c.isPending || i, className: "focus-ring min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400", children: c.isPending ? "Creating..." : "Create Shared Report" })] }), d ? jsx("p", { className: "text-sm text-gray-500", children: "Loading reports..." }) : i ? jsx("div", { className: "rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600", children: "Sign in to list and create tenant shared reports." }) : k.length === 0 ? jsx("div", { className: "rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600", children: "No shared reports yet." }) : jsx("div", { className: "space-y-3", children: k.map((p) => {
    const v = p.shareToken ? `${y}/api/alerts/reports/shared/${p.shareToken}` : null;
    return jsxs("div", { className: "rounded-lg border border-gray-200 p-4 space-y-2", children: [jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [jsxs("div", { children: [jsx("h4", { className: "font-medium text-gray-900", children: p.title }), jsxs("p", { className: "text-xs text-gray-500", children: [p.status, " \xB7 ", new Date(p.createdAt).toLocaleString()] })] }), jsxs("div", { className: "flex items-center gap-2", children: [jsx("span", { className: "rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700", children: p.visibility }), p.status !== "expired" && !i && jsx("button", { type: "button", onClick: () => C.mutate(p.id), disabled: C.isPending && C.variables === p.id, className: "rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:text-gray-400", children: C.isPending && C.variables === p.id ? "Expiring..." : "Expire" })] })] }), jsxs("p", { className: "text-sm text-gray-700", children: [p.summary.activeAlerts, " active alerts across", " ", p.summary.totalMonitored, " monitored domains."] }), v && jsxs("div", { children: [jsx("p", { className: "text-xs font-medium uppercase tracking-wide text-gray-500", children: "Share link" }), jsx("a", { className: "text-sm text-blue-600 break-all hover:text-blue-700", href: v, children: v })] })] }, p.id);
  }) })] })] });
}
const J = { google: "Google Workspace", microsoft: "Microsoft 365", zoho: "Zoho Mail", other: "Other Provider", gmail: "Gmail / Google Workspace", outlook: "Outlook / Microsoft 365", yahoo: "Yahoo Mail", protonmail: "ProtonMail", fastmail: "Fastmail", custom: "Custom Provider" };
async function Je(t) {
  const a = await fetch(`/api/portfolio/templates/overrides?provider=${encodeURIComponent(t)}`, { credentials: "include" });
  if (a.status === 401) {
    const m = new Error("Unauthorized");
    throw m.status = 401, m;
  }
  if (a.status === 403) {
    const m = new Error("Forbidden");
    throw m.status = 403, m;
  }
  if (!a.ok) throw new Error("Failed to fetch overrides");
  return (await a.json()).overrides || [];
}
function Qe() {
  const t = useQueryClient(), a = useId(), [s, m] = useState(""), [u, b] = useState(null), [y, h] = useState(false), [d, w] = useState(null), { data: k = [], isLoading: S, error: i } = useQuery({ queryKey: ["template-overrides", s], queryFn: () => Je(s), enabled: !!s }), c = i ? i.status : void 0, C = c === 401, p = c === 403, v = useMutation({ mutationFn: async (n) => {
    const N = await fetch(`/api/portfolio/templates/overrides/${n}`, { method: "DELETE" });
    if (N.status === 401) {
      const M = new Error("Unauthorized");
      throw M.status = 401, M;
    }
    if (N.status === 403) {
      const M = new Error("Forbidden");
      throw M.status = 403, M;
    }
    if (!N.ok) throw new Error("Failed to delete override");
  }, onSuccess: () => {
    t.invalidateQueries({ queryKey: ["template-overrides"] });
  }, onError: (n) => {
    w(n instanceof Error ? n.message : "Failed to delete override");
  } }), g = C, D = C || p;
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-white shadow-sm", children: [jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 px-4 py-3", children: [jsx("h3", { className: "text-lg font-medium text-gray-900", children: "Template Overrides" }), jsx("button", { type: "button", onClick: () => h(true), disabled: D, className: "text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400", children: "+ New Override" })] }), jsxs("div", { className: "p-4", children: [C && jsx("div", { className: "mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900", children: "Operator sign-in is required to view or edit tenant template overrides." }), p && jsx("div", { className: "mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900", children: "You can view tenant overrides here, but your current role cannot create, edit, or delete them." }), jsxs("div", { className: "mb-4", children: [jsx("label", { htmlFor: a, className: "mb-1 block text-sm font-medium text-gray-700", children: "Select Provider" }), jsxs("select", { id: a, value: s, onChange: (n) => m(n.target.value), disabled: g, className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100", children: [jsx("option", { value: "", children: "Choose a provider..." }), Object.entries(J).map(([n, N]) => jsx("option", { value: n, children: N }, n))] })] }), d && jsxs("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800", children: [d, jsx("button", { type: "button", onClick: () => w(null), className: "ml-2 text-red-600 hover:text-red-800", children: "Dismiss" })] }), (y || u) && jsx(Ge, { editingOverride: u, defaultProvider: s, authRequired: C, writeBlocked: p, onWriteBlocked: () => w("You do not have permission to save tenant overrides."), onClose: () => {
    h(false), b(null);
  }, onSave: () => {
    t.invalidateQueries({ queryKey: ["template-overrides"] }), h(false), b(null);
  } }), C ? jsx("div", { className: "py-8 text-center text-gray-500", children: "Sign in to view and manage tenant template overrides." }) : s ? S ? jsx("div", { className: "py-8 text-center text-gray-500", children: "Loading overrides..." }) : k.length === 0 ? jsxs("div", { className: "py-8 text-center text-gray-500", children: ["No overrides for ", J[s] || s, ".", " ", jsx("button", { type: "button", onClick: () => h(true), className: "text-blue-600 hover:text-blue-700 disabled:text-gray-400", disabled: D, children: "Create one" })] }) : jsx("div", { className: "space-y-3", children: k.map((n) => jsx(Ye, { override: n, disabled: D, onEdit: () => b(n), onDelete: () => v.mutate(n.id) }, n.id)) }) : jsx("div", { className: "py-8 text-center text-gray-500", children: "Select a provider to view and manage template overrides" })] })] });
}
function Ye({ override: t, disabled: a, onEdit: s, onDelete: m }) {
  const [u, b] = useState(false);
  return jsxs("div", { className: "rounded-lg border border-gray-200 bg-gray-50 p-3", children: [jsxs("div", { className: "flex items-start justify-between", children: [jsxs("div", { className: "min-w-0 flex-1", children: [jsxs("div", { className: "flex items-center gap-2", children: [jsx("span", { className: "font-mono text-sm text-gray-900", children: t.templateKey }), t.appliesToDomains && t.appliesToDomains.length > 0 && jsxs("span", { className: "rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700", children: [t.appliesToDomains.length, " domain", t.appliesToDomains.length > 1 ? "s" : ""] })] }), jsxs("p", { className: "mt-1 text-xs text-gray-500", children: ["Created by ", t.createdBy, " on ", new Date(t.createdAt).toLocaleDateString()] })] }), jsxs("div", { className: "ml-2 flex items-center gap-1", children: [jsx("button", { type: "button", onClick: () => b(!u), className: "rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700", title: u ? "Collapse" : "Expand", children: jsx("svg", { "aria-hidden": "true", className: `h-4 w-4 transition-transform ${u ? "rotate-180" : ""}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) }) }), jsx("button", { type: "button", onClick: s, disabled: a, className: "rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:text-gray-400 disabled:hover:bg-transparent", title: "Edit", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }) }) }), jsx("button", { type: "button", onClick: m, disabled: a, className: "rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:text-gray-400 disabled:hover:bg-transparent", title: "Delete", children: jsx("svg", { "aria-hidden": "true", className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" }) }) })] })] }), u && jsxs("div", { className: "mt-3 border-t border-gray-200 pt-3", children: [jsx("p", { className: "mb-1 text-xs font-medium text-gray-500", children: "Override Data:" }), jsx("pre", { className: "overflow-x-auto rounded border border-gray-200 bg-white p-2 text-xs text-gray-700", children: JSON.stringify(t.overrideData, null, 2) }), t.appliesToDomains && t.appliesToDomains.length > 0 && jsxs("div", { className: "mt-2", children: [jsx("p", { className: "mb-1 text-xs font-medium text-gray-500", children: "Applies to:" }), jsx("div", { className: "flex flex-wrap gap-1", children: t.appliesToDomains.map((y) => jsx("span", { className: "rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600", children: y }, y)) })] })] })] });
}
function Ge({ editingOverride: t, defaultProvider: a, authRequired: s, writeBlocked: m, onWriteBlocked: u, onClose: b, onSave: y }) {
  var _a;
  const h = useId(), d = `${h}-override-provider`, w = `${h}-override-template`, k = `${h}-override-data`, S = `${h}-override-domains`, [i, c] = useState((t == null ? void 0 : t.providerKey) || a), [C, p] = useState((t == null ? void 0 : t.templateKey) || ""), [v, g] = useState(t ? JSON.stringify(t.overrideData, null, 2) : "{}"), [D, n] = useState(((_a = t == null ? void 0 : t.appliesToDomains) == null ? void 0 : _a.join(", ")) || ""), [N, M] = useState(false), [x, A] = useState(null), P = s || m;
  return jsx("div", { className: "mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4", children: jsxs("form", { onSubmit: async (l) => {
    if (l.preventDefault(), !i.trim() || !C.trim()) {
      A("Provider and template key are required");
      return;
    }
    let F;
    try {
      if (F = JSON.parse(v), typeof F != "object" || F === null) throw new Error("Must be an object");
    } catch {
      A("Override data must be valid JSON object");
      return;
    }
    M(true), A(null);
    try {
      const o = { providerKey: i.trim(), templateKey: C.trim(), overrideData: F, appliesToDomains: D.split(",").map((j) => j.trim()).filter(Boolean) }, L = t ? `/api/portfolio/templates/overrides/${t.id}` : "/api/portfolio/templates/overrides", I = await fetch(L, { method: t ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
      if (!I.ok) {
        const j = await I.json().catch(() => ({}));
        throw I.status === 401 ? new Error("Operator sign-in is required to save overrides.") : I.status === 403 ? (u(), new Error("You do not have permission to save tenant overrides.")) : new Error(j.error || "Failed to save override");
      }
      y();
    } catch (o) {
      A(o instanceof Error ? o.message : "Failed to save override");
    } finally {
      M(false);
    }
  }, children: [jsx("h4", { className: "mb-3 font-medium text-gray-900", children: t ? "Edit Override" : "New Override" }), x && jsx("div", { className: "mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800", children: x }), jsxs("div", { className: "space-y-3", children: [jsxs("div", { className: "grid grid-cols-2 gap-3", children: [jsxs("div", { children: [jsxs("label", { htmlFor: d, className: "mb-1 block text-sm font-medium text-gray-700", children: ["Provider Key ", jsx("span", { className: "text-red-500", children: "*" })] }), jsxs("select", { id: d, value: i, onChange: (l) => c(l.target.value), className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100", disabled: !!t || P, children: [jsx("option", { value: "", children: "Select..." }), Object.entries(J).map(([l, F]) => jsx("option", { value: l, children: F }, l))] })] }), jsxs("div", { children: [jsxs("label", { htmlFor: w, className: "mb-1 block text-sm font-medium text-gray-700", children: ["Template Key ", jsx("span", { className: "text-red-500", children: "*" })] }), jsx("input", { type: "text", id: w, value: C, onChange: (l) => p(l.target.value), placeholder: "e.g., dkim_record", className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100", disabled: !!t || P })] })] }), jsxs("div", { children: [jsxs("label", { htmlFor: k, className: "mb-1 block text-sm font-medium text-gray-700", children: ["Override Data (JSON) ", jsx("span", { className: "text-red-500", children: "*" })] }), jsx("textarea", { id: k, value: v, onChange: (l) => g(l.target.value), rows: 5, disabled: P, className: "w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100", placeholder: '{"key": "value"}' })] }), jsxs("div", { children: [jsx("label", { htmlFor: S, className: "mb-1 block text-sm font-medium text-gray-700", children: "Applies to Domains (comma-separated, leave empty for all)" }), jsx("input", { type: "text", id: S, value: D, onChange: (l) => n(l.target.value), placeholder: "example.com, test.com", className: "w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100", disabled: P })] })] }), jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [jsx("button", { type: "button", onClick: b, className: "px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800", disabled: N || s, children: "Cancel" }), jsx("button", { type: "submit", disabled: N || P || !i.trim() || !C.trim(), className: "rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50", children: N ? "Saving..." : t ? "Update" : "Create" })] })] }) });
}
const at = function() {
  const [a, s] = useState(ee);
  return jsxs("div", { className: "mx-auto max-w-7xl space-y-6", children: [jsxs("div", { className: "rounded-2xl border border-blue-200 bg-blue-50 p-8 shadow-sm", children: [jsx("p", { className: "text-sm font-semibold uppercase tracking-wide text-blue-700", children: "Operator workspace" }), jsx("h1", { className: "mt-2 text-3xl font-bold text-gray-900", children: "Portfolio workflows" }), jsx("p", { className: "mt-4 text-gray-700", children: "This route now exposes the supported operator surface for monitoring, alert triage, fleet reporting, saved filters, shared reports, and tenant governance workflows." }), jsx("div", { className: "mt-6 flex flex-wrap gap-3", children: jsx(Link, { to: "/", className: "focus-ring inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700", children: "Return to Home" }) })] }), jsxs("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]", children: [jsx(qe, { currentFilters: a, onFiltersChange: s }), jsx(Re, { currentFilters: a, onLoadFilter: s })] }), jsx(Le, {}), jsx(fe, {}), jsx(Ve, {}), jsx(Ee, {}), jsx(Qe, {}), jsx(ke, {}), jsx("div", { className: "rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600", children: "Mail diagnostics and remediation requests are available from the Domain 360 mail tab. Domain notes and tags now live on the Domain 360 overview surface. Saved filters now drive the portfolio search workspace directly." })] });
};

export { at as component };
//# sourceMappingURL=portfolio-DibpN4rR.mjs.map
