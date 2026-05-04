import { jsxs, jsx } from 'react/jsx-runtime';
import { useNavigate, Link } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { TaggedError } from 'better-result';
import { aD as Et } from '../nitro/nitro.mjs';
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
import '@tanstack/react-query';
import 'react-dom';
import '@tanstack/history';
import 'node:stream';
import 'react-dom/server';
import 'node:stream/web';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
function L(i) {
  return TaggedError(i);
}
L("ValidationError")();
L("NotFoundError")();
L("TenantIsolationError")();
L("DatabaseError")();
L("ParseError")();
L("NetworkError")();
var S, j;
function X() {
  if (j) return S;
  j = 1;
  const i = 2147483647, c = 36, D = 1, m = 26, O = 38, y = 700, F = 72, v = 128, N = "-", e = /^xn--/, E = /[^\0-\x7F]/, A = /[\x2E\u3002\uFF0E\uFF61]/g, R = { overflow: "Overflow: input needs wider integers to process", "not-basic": "Illegal input >= 0x80 (not a basic code point)", "invalid-input": "Invalid input" }, C = c - D, d = Math.floor, M = String.fromCharCode;
  function I(t) {
    throw new RangeError(R[t]);
  }
  function P(t, o) {
    const r = [];
    let n = t.length;
    for (; n--; ) r[n] = o(t[n]);
    return r;
  }
  function _(t, o) {
    const r = t.split("@");
    let n = "";
    r.length > 1 && (n = r[0] + "@", t = r[1]), t = t.replace(A, ".");
    const s = t.split("."), a = P(s, o).join(".");
    return n + a;
  }
  function $(t) {
    const o = [];
    let r = 0;
    const n = t.length;
    for (; r < n; ) {
      const s = t.charCodeAt(r++);
      if (s >= 55296 && s <= 56319 && r < n) {
        const a = t.charCodeAt(r++);
        (a & 64512) == 56320 ? o.push(((s & 1023) << 10) + (a & 1023) + 65536) : (o.push(s), r--);
      } else o.push(s);
    }
    return o;
  }
  const H = (t) => String.fromCodePoint(...t), W = function(t) {
    return t >= 48 && t < 58 ? 26 + (t - 48) : t >= 65 && t < 91 ? t - 65 : t >= 97 && t < 123 ? t - 97 : c;
  }, V = function(t, o) {
    return t + 22 + 75 * (t < 26) - ((o != 0) << 5);
  }, z = function(t, o, r) {
    let n = 0;
    for (t = r ? d(t / y) : t >> 1, t += d(t / o); t > C * m >> 1; n += c) t = d(t / C);
    return d(n + (C + 1) * t / (t + O));
  }, k = function(t) {
    const o = [], r = t.length;
    let n = 0, s = v, a = F, p = t.lastIndexOf(N);
    p < 0 && (p = 0);
    for (let l = 0; l < p; ++l) t.charCodeAt(l) >= 128 && I("not-basic"), o.push(t.charCodeAt(l));
    for (let l = p > 0 ? p + 1 : 0; l < r; ) {
      const u = n;
      for (let f = 1, w = c; ; w += c) {
        l >= r && I("invalid-input");
        const x = W(t.charCodeAt(l++));
        x >= c && I("invalid-input"), x > d((i - n) / f) && I("overflow"), n += x * f;
        const b = w <= a ? D : w >= a + m ? m : w - a;
        if (x < b) break;
        const T = c - b;
        f > d(i / T) && I("overflow"), f *= T;
      }
      const g = o.length + 1;
      a = z(n - u, g, u == 0), d(n / g) > i - s && I("overflow"), s += d(n / g), n %= g, o.splice(n++, 0, s);
    }
    return String.fromCodePoint(...o);
  }, B = function(t) {
    const o = [];
    t = $(t);
    const r = t.length;
    let n = v, s = 0, a = F;
    for (const u of t) u < 128 && o.push(M(u));
    const p = o.length;
    let l = p;
    for (p && o.push(N); l < r; ) {
      let u = i;
      for (const f of t) f >= n && f < u && (u = f);
      const g = l + 1;
      u - n > d((i - s) / g) && I("overflow"), s += (u - n) * g, n = u;
      for (const f of t) if (f < n && ++s > i && I("overflow"), f === n) {
        let w = s;
        for (let x = c; ; x += c) {
          const b = x <= a ? D : x >= a + m ? m : x - a;
          if (w < b) break;
          const T = w - b, U = c - b;
          o.push(M(V(b + T % U, 0))), w = d(T / U);
        }
        o.push(M(V(w, 0))), a = z(s, g, l === p), s = 0, ++l;
      }
      ++s, ++n;
    }
    return o.join("");
  };
  return S = { version: "2.3.1", ucs2: { decode: $, encode: H }, decode: k, encode: B, toASCII: function(t) {
    return _(t, function(o) {
      return E.test(o) ? "xn--" + B(o) : o;
    });
  }, toUnicode: function(t) {
    return _(t, function(o) {
      return e.test(o) ? k(o.slice(4).toLowerCase()) : o;
    });
  } }, S;
}
var J = X();
const q = Et(J), { toASCII: K, toUnicode: Q } = q, Z = "xn--";
class h extends Error {
  constructor(c, D) {
    super(c);
    __publicField(this, "code");
    this.code = D, this.name = "DomainNormalizationError";
  }
}
function tt(i) {
  return i.startsWith(Z);
}
function it(i) {
  if (!i || typeof i != "string") throw new h("Domain name is required", "EMPTY_DOMAIN");
  const c = i.trim();
  if (c.length === 0) throw new h("Domain name cannot be empty", "EMPTY_DOMAIN");
  if (c.length > 253) throw new h("Domain name exceeds maximum length of 253 characters", "DOMAIN_TOO_LONG");
  const m = c.toLowerCase().replace(/\.$/, "");
  if (m.includes("..")) throw new h("Domain contains consecutive dots", "DOUBLE_DOT");
  const O = m.split("."), y = [], F = [];
  for (const e of O) {
    if (e.length === 0) throw new h("Domain contains empty label", "INVALID_FORMAT");
    if (e.length > 63) throw new h(`Label "${e.substring(0, 20)}..." exceeds maximum length of 63 characters`, "LABEL_TOO_LONG");
    if (e.startsWith("-")) throw new h(`Label "${e}" starts with hyphen`, "INVALID_FORMAT");
    if (e.endsWith("-")) throw new h(`Label "${e}" ends with hyphen`, "INVALID_FORMAT");
    if (e.includes(" ")) throw new h(`Label "${e}" contains spaces`, "INVALID_CHARACTERS");
    let E, A;
    if (tt(e)) {
      E = e;
      try {
        A = Q(e);
      } catch {
        A = e;
      }
    } else if (/^[\x00-\x7F]+$/.test(e)) {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(e)) throw new h(`Label "${e}" contains invalid characters`, "INVALID_CHARACTERS");
      E = e, A = e;
    } else try {
      E = K(e), A = e;
    } catch (C) {
      throw new h(`Failed to convert label "${e}" to punycode: ${C instanceof Error ? C.message : String(C)}`, "INVALID_CHARACTERS");
    }
    y.push(E), F.push(A);
  }
  const v = y.join("."), N = F.join(".");
  return { original: i, unicode: N, punycode: v, normalized: v };
}
const { toASCII: ct, toUnicode: at } = q;

function f({ onSubmit: o, initialValue: i = "" }) {
  const [r, l] = useState(i), [m, d] = useState(null), c = useMemo(() => {
    if (!r.trim()) return "";
    try {
      return it(r).normalized;
    } catch {
      return "";
    }
  }, [r]);
  return jsx("form", { action: "/", method: "get", onSubmit: (s) => {
    s.preventDefault(), d(null);
    try {
      const a = it(r);
      o(a.normalized);
    } catch (a) {
      a instanceof Error && a.message ? d(a.message) : d("Invalid domain name");
    }
  }, className: "w-full max-w-2xl", children: jsxs("div", { className: "flex flex-col gap-2", children: [jsxs("div", { className: "flex gap-2", children: [jsx("input", { type: "text", name: "domain", value: r, onChange: (s) => l(s.target.value), placeholder: "example.com", className: "focus-ring flex-1 px-4 py-3 text-lg border border-gray-300 rounded-lg", "aria-label": "Domain name" }), jsx("button", { type: "submit", className: "focus-ring px-6 py-3 text-lg font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700", children: "Analyze" })] }), c && c !== r.trim().toLowerCase() && jsxs("p", { className: "text-sm text-gray-600", children: ["Will query: ", jsx("code", { className: "px-1 py-0.5 bg-gray-100 rounded", children: c })] }), m && jsx("p", { className: "text-sm text-red-600", role: "alert", children: m })] }) });
}
const b = { globe: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" }), shield: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" }), chart: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" }), folder: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" }), document: jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" }) };
function n({ icon: o, title: i, description: r }) {
  return jsxs("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200 p-4", children: [jsx("div", { className: "w-8 h-8 text-blue-500 mb-3", children: jsx("svg", { "aria-hidden": "true", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: b[o] }) }), jsx("h3", { className: "font-semibold text-gray-900 mb-2", children: i }), jsx("p", { className: "text-sm text-gray-600", children: r })] });
}
const E = function() {
  const i = useNavigate();
  return jsxs("div", { className: "max-w-4xl mx-auto", children: [jsxs("div", { className: "text-center mb-8", children: [jsx("h1", { className: "text-4xl font-bold text-gray-900 mb-4", children: "DNS Ops Workbench" }), jsx("p", { className: "text-lg text-gray-600 max-w-2xl mx-auto", children: "Professional DNS analysis and mail security diagnostics. Identify misconfigurations, validate delegation chains, and ensure mail deliverability." })] }), jsx("div", { className: "bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8", children: jsx("div", { className: "flex items-start gap-4", children: jsxs("div", { className: "flex-1", children: [jsx("p", { className: "block text-sm font-medium text-gray-700 mb-2", children: "Analyze any domain" }), jsx(f, { onSubmit: (l) => {
    i({ to: "/domain/$domain", params: { domain: l } });
  } }), jsx("div", { className: "mt-3 text-sm text-gray-500", children: jsx("p", { children: "Examples: example.com, google.com, your-domain.com" }) })] }) }) }), jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8", children: [jsx(n, { icon: "globe", title: "DNS Analysis", description: "Query A, AAAA, MX, TXT, NS, SOA, CAA, and DNSKEY records from multiple vantage points worldwide." }), jsx(n, { icon: "shield", title: "Mail Security", description: "Validate SPF, DMARC, DKIM, MTA-STS, and TLS-RPT. Get actionable recommendations." }), jsx(n, { icon: "chart", title: "Rules-Based Findings", description: "Review snapshot metadata, DNS evidence, and mail diagnostics with deterministic checks." })] }), jsxs("div", { className: "bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100 mb-8", children: [jsx("h2", { className: "font-semibold text-gray-900 mb-3", children: "How It Works" }), jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [jsxs("div", { children: [jsxs("h3", { className: "font-medium text-blue-800 mb-2 flex items-center gap-2", children: [jsx("span", { className: "w-2 h-2 rounded-full bg-blue-500" }), "Targeted Inspection"] }), jsx("p", { className: "text-sm text-gray-600", children: "Analyze any domain instantly. Review DNS evidence immediately, then use operator access for refreshes and deeper diagnostics." }), jsxs("ul", { className: "mt-2 text-sm text-gray-500 space-y-1", children: [jsx("li", { children: "\u2022 Point-in-time snapshots" }), jsx("li", { children: "\u2022 Multi-resolver verification" }), jsx("li", { children: "\u2022 Mail configuration checks" })] })] }), jsxs("div", { children: [jsxs("h3", { className: "font-medium text-green-800 mb-2 flex items-center gap-2", children: [jsx("span", { className: "w-2 h-2 rounded-full bg-green-500" }), "Managed Zones", " ", jsx("span", { className: "text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded", children: "Portfolio" })] }), jsx("p", { className: "text-sm text-gray-600", children: "Add domains to your portfolio for monitoring, alert triage, shared reporting, and ongoing operator workflows. Ideal for domains you own or manage." }), jsxs("ul", { className: "mt-2 text-sm text-gray-500 space-y-1", children: [jsx("li", { children: "\u2022 Monitored domains and alert triage" }), jsx("li", { children: "\u2022 Shared reports for stakeholders" }), jsx("li", { children: "\u2022 Broader portfolio tooling phased in" })] }), jsx("div", { className: "mt-4", children: jsx(Link, { to: "/portfolio", className: "focus-ring inline-flex min-h-10 items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700", children: "Open Portfolio Workspace" }) })] })] })] }), jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [jsx(n, { icon: "folder", title: "Portfolio Workspace", description: "Open the operator workspace for monitoring, alert triage, shared reports, and later phased portfolio workflows." }), jsx(n, { icon: "document", title: "Rules Engine", description: "Deterministic analysis with versioned rulesets. Findings include evidence and remediation suggestions." })] })] });
};

export { E as component };
//# sourceMappingURL=index-CkDK1VJT.mjs.map
