import process from 'node:process';globalThis._importMeta_=globalThis._importMeta_||{url:"file:///_entry.js",env:process.env};import http, { Server as Server$1 } from 'node:http';
import https, { Server } from 'node:https';
import { EventEmitter } from 'node:events';
import { Buffer as Buffer$1 } from 'node:buffer';
import { promises, existsSync } from 'node:fs';
import { resolve as resolve$1, dirname as dirname$1, join } from 'node:path';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import invariant from 'vinxi/lib/invariant';
import { virtualId, handlerModule, join as join$1 } from 'vinxi/lib/path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isRedirect, isNotFound, isPlainObject as isPlainObject$1, pick, TSR_DEFERRED_PROMISE, createControlledPromise, isPlainArray, defer as defer$1 } from '@tanstack/router-core';
import { Hono } from 'hono';
import { TaggedError, Result } from 'better-result';
import { pgEnum, pgTable, timestamp, varchar, text, jsonb, uuid, index, boolean, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { eq, sql, or as or$1, like, inArray, and, desc, gt as gt$2 } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { drizzle } from 'drizzle-orm/d1';
import { drizzle as drizzle$1 } from 'drizzle-orm/node-postgres';
import wt$1 from 'events';
import yt$1 from 'util';
import require$$1 from 'crypto';
import Yi from 'dns';
import Us from 'fs';
import Vs from 'net';
import require$$4 from 'tls';
import Ji from 'path';
import require$$0$2 from 'stream';
import eo from 'string_decoder';
import { readFile as readFile$1, readdir as readdir$1 } from 'node:fs/promises';
import { verify } from '@node-rs/argon2';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { RouterProvider, createRootRoute, useRouter, HeadContent, Link, Outlet, Scripts, createFileRoute, lazyRouteComponent, redirect, useLocation, useNavigate, createRouter as createRouter$2 } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createMemoryHistory } from '@tanstack/history';
import { PassThrough, Readable } from 'node:stream';
import G$2 from 'react-dom/server';
import { ReadableStream as ReadableStream$1 } from 'node:stream/web';

const suspectProtoRx = /"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/;
const suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
const JsonSigRx = /^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;
function jsonParseTransform(key, value) {
  if (key === "__proto__" || key === "constructor" && value && typeof value === "object" && "prototype" in value) {
    warnKeyDropped(key);
    return;
  }
  return value;
}
function warnKeyDropped(key) {
  console.warn(`[destr] Dropping "${key}" key to prevent prototype pollution.`);
}
function destr(value, options = {}) {
  if (typeof value !== "string") {
    return value;
  }
  if (value[0] === '"' && value[value.length - 1] === '"' && value.indexOf("\\") === -1) {
    return value.slice(1, -1);
  }
  const _value = value.trim();
  if (_value.length <= 9) {
    switch (_value.toLowerCase()) {
      case "true": {
        return true;
      }
      case "false": {
        return false;
      }
      case "undefined": {
        return void 0;
      }
      case "null": {
        return null;
      }
      case "nan": {
        return Number.NaN;
      }
      case "infinity": {
        return Number.POSITIVE_INFINITY;
      }
      case "-infinity": {
        return Number.NEGATIVE_INFINITY;
      }
    }
  }
  if (!JsonSigRx.test(value)) {
    if (options.strict) {
      throw new SyntaxError("[destr] Invalid JSON");
    }
    return value;
  }
  try {
    if (suspectProtoRx.test(value) || suspectConstructorRx.test(value)) {
      if (options.strict) {
        throw new Error("[destr] Possible prototype pollution");
      }
      return JSON.parse(value, jsonParseTransform);
    }
    return JSON.parse(value);
  } catch (error) {
    if (options.strict) {
      throw error;
    }
    return value;
  }
}

const HASH_RE = /#/g;
const AMPERSAND_RE = /&/g;
const SLASH_RE = /\//g;
const EQUAL_RE = /=/g;
const PLUS_RE = /\+/g;
const ENC_CARET_RE = /%5e/gi;
const ENC_BACKTICK_RE = /%60/gi;
const ENC_PIPE_RE = /%7c/gi;
const ENC_SPACE_RE = /%20/gi;
const ENC_SLASH_RE = /%2f/gi;
function encode(text) {
  return encodeURI("" + text).replace(ENC_PIPE_RE, "|");
}
function encodeQueryValue(input) {
  return encode(typeof input === "string" ? input : JSON.stringify(input)).replace(PLUS_RE, "%2B").replace(ENC_SPACE_RE, "+").replace(HASH_RE, "%23").replace(AMPERSAND_RE, "%26").replace(ENC_BACKTICK_RE, "`").replace(ENC_CARET_RE, "^").replace(SLASH_RE, "%2F");
}
function encodeQueryKey(text) {
  return encodeQueryValue(text).replace(EQUAL_RE, "%3D");
}
function decode(text = "") {
  try {
    return decodeURIComponent("" + text);
  } catch {
    return "" + text;
  }
}
function decodePath(text) {
  return decode(text.replace(ENC_SLASH_RE, "%252F"));
}
function decodeQueryKey(text) {
  return decode(text.replace(PLUS_RE, " "));
}
function decodeQueryValue(text) {
  return decode(text.replace(PLUS_RE, " "));
}

function parseQuery(parametersString = "") {
  const object = /* @__PURE__ */ Object.create(null);
  if (parametersString[0] === "?") {
    parametersString = parametersString.slice(1);
  }
  for (const parameter of parametersString.split("&")) {
    const s = parameter.match(/([^=]+)=?(.*)/) || [];
    if (s.length < 2) {
      continue;
    }
    const key = decodeQueryKey(s[1]);
    if (key === "__proto__" || key === "constructor") {
      continue;
    }
    const value = decodeQueryValue(s[2] || "");
    if (object[key] === void 0) {
      object[key] = value;
    } else if (Array.isArray(object[key])) {
      object[key].push(value);
    } else {
      object[key] = [object[key], value];
    }
  }
  return object;
}
function encodeQueryItem(key, value) {
  if (typeof value === "number" || typeof value === "boolean") {
    value = String(value);
  }
  if (!value) {
    return encodeQueryKey(key);
  }
  if (Array.isArray(value)) {
    return value.map(
      (_value) => `${encodeQueryKey(key)}=${encodeQueryValue(_value)}`
    ).join("&");
  }
  return `${encodeQueryKey(key)}=${encodeQueryValue(value)}`;
}
function stringifyQuery(query) {
  return Object.keys(query).filter((k) => query[k] !== void 0).map((k) => encodeQueryItem(k, query[k])).filter(Boolean).join("&");
}

const PROTOCOL_STRICT_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{1,2})/;
const PROTOCOL_REGEX = /^[\s\w\0+.-]{2,}:([/\\]{2})?/;
const PROTOCOL_RELATIVE_REGEX = /^([/\\]\s*){2,}[^/\\]/;
const JOIN_LEADING_SLASH_RE = /^\.?\//;
function hasProtocol(inputString, opts = {}) {
  if (typeof opts === "boolean") {
    opts = { acceptRelative: opts };
  }
  if (opts.strict) {
    return PROTOCOL_STRICT_REGEX.test(inputString);
  }
  return PROTOCOL_REGEX.test(inputString) || (opts.acceptRelative ? PROTOCOL_RELATIVE_REGEX.test(inputString) : false);
}
function hasTrailingSlash(input = "", respectQueryAndFragment) {
  {
    return input.endsWith("/");
  }
}
function withoutTrailingSlash(input = "", respectQueryAndFragment) {
  {
    return (hasTrailingSlash(input) ? input.slice(0, -1) : input) || "/";
  }
}
function withTrailingSlash(input = "", respectQueryAndFragment) {
  {
    return input.endsWith("/") ? input : input + "/";
  }
}
function hasLeadingSlash(input = "") {
  return input.startsWith("/");
}
function withLeadingSlash(input = "") {
  return hasLeadingSlash(input) ? input : "/" + input;
}
function withBase(input, base) {
  if (isEmptyURL(base) || hasProtocol(input)) {
    return input;
  }
  const _base = withoutTrailingSlash(base);
  if (input.startsWith(_base)) {
    const nextChar = input[_base.length];
    if (!nextChar || nextChar === "/" || nextChar === "?") {
      return input;
    }
  }
  return joinURL(_base, input);
}
function withoutBase(input, base) {
  if (isEmptyURL(base)) {
    return input;
  }
  const _base = withoutTrailingSlash(base);
  if (!input.startsWith(_base)) {
    return input;
  }
  const nextChar = input[_base.length];
  if (nextChar && nextChar !== "/" && nextChar !== "?") {
    return input;
  }
  const trimmed = input.slice(_base.length);
  return trimmed[0] === "/" ? trimmed : "/" + trimmed;
}
function withQuery(input, query) {
  const parsed = parseURL(input);
  const mergedQuery = { ...parseQuery(parsed.search), ...query };
  parsed.search = stringifyQuery(mergedQuery);
  return stringifyParsedURL(parsed);
}
function getQuery(input) {
  return parseQuery(parseURL(input).search);
}
function isEmptyURL(url) {
  return !url || url === "/";
}
function isNonEmptyURL(url) {
  return url && url !== "/";
}
function joinURL(base, ...input) {
  let url = base || "";
  for (const segment of input.filter((url2) => isNonEmptyURL(url2))) {
    if (url) {
      const _segment = segment.replace(JOIN_LEADING_SLASH_RE, "");
      url = withTrailingSlash(url) + _segment;
    } else {
      url = segment;
    }
  }
  return url;
}

const protocolRelative = Symbol.for("ufo:protocolRelative");
function parseURL(input = "", defaultProto) {
  const _specialProtoMatch = input.match(
    /^[\s\0]*(blob:|data:|javascript:|vbscript:)(.*)/i
  );
  if (_specialProtoMatch) {
    const [, _proto, _pathname = ""] = _specialProtoMatch;
    return {
      protocol: _proto.toLowerCase(),
      pathname: _pathname,
      href: _proto + _pathname,
      auth: "",
      host: "",
      search: "",
      hash: ""
    };
  }
  if (!hasProtocol(input, { acceptRelative: true })) {
    return parsePath(input);
  }
  const [, protocol = "", auth, hostAndPath = ""] = input.replace(/\\/g, "/").match(/^[\s\0]*([\w+.-]{2,}:)?\/\/([^/@]+@)?(.*)/) || [];
  let [, host = "", path = ""] = hostAndPath.match(/([^#/?]*)(.*)?/) || [];
  if (protocol === "file:") {
    path = path.replace(/\/(?=[A-Za-z]:)/, "");
  }
  const { pathname, search, hash } = parsePath(path);
  return {
    protocol: protocol.toLowerCase(),
    auth: auth ? auth.slice(0, Math.max(0, auth.length - 1)) : "",
    host,
    pathname,
    search,
    hash,
    [protocolRelative]: !protocol
  };
}
function parsePath(input = "") {
  const [pathname = "", search = "", hash = ""] = (input.match(/([^#?]*)(\?[^#]*)?(#.*)?/) || []).splice(1);
  return {
    pathname,
    search,
    hash
  };
}
function stringifyParsedURL(parsed) {
  const pathname = parsed.pathname || "";
  const search = parsed.search ? (parsed.search.startsWith("?") ? "" : "?") + parsed.search : "";
  const hash = parsed.hash || "";
  const auth = parsed.auth ? parsed.auth + "@" : "";
  const host = parsed.host || "";
  const proto = parsed.protocol || parsed[protocolRelative] ? (parsed.protocol || "") + "//" : "";
  return proto + auth + host + pathname + search + hash;
}

const NODE_TYPES = {
  NORMAL: 0,
  WILDCARD: 1,
  PLACEHOLDER: 2
};

function createRouter$1(options = {}) {
  const ctx = {
    options,
    rootNode: createRadixNode(),
    staticRoutesMap: {}
  };
  const normalizeTrailingSlash = (p) => options.strictTrailingSlash ? p : p.replace(/\/$/, "") || "/";
  if (options.routes) {
    for (const path in options.routes) {
      insert(ctx, normalizeTrailingSlash(path), options.routes[path]);
    }
  }
  return {
    ctx,
    lookup: (path) => lookup(ctx, normalizeTrailingSlash(path)),
    insert: (path, data) => insert(ctx, normalizeTrailingSlash(path), data),
    remove: (path) => remove(ctx, normalizeTrailingSlash(path))
  };
}
function lookup(ctx, path) {
  const staticPathNode = ctx.staticRoutesMap[path];
  if (staticPathNode) {
    return staticPathNode.data;
  }
  const sections = path.split("/");
  const params = {};
  let paramsFound = false;
  let wildcardNode = null;
  let node = ctx.rootNode;
  let wildCardParam = null;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (node.wildcardChildNode !== null) {
      wildcardNode = node.wildcardChildNode;
      wildCardParam = sections.slice(i).join("/");
    }
    const nextNode = node.children.get(section);
    if (nextNode === void 0) {
      if (node && node.placeholderChildren.length > 1) {
        const remaining = sections.length - i;
        node = node.placeholderChildren.find((c) => c.maxDepth === remaining) || null;
      } else {
        node = node.placeholderChildren[0] || null;
      }
      if (!node) {
        break;
      }
      if (node.paramName) {
        params[node.paramName] = section;
      }
      paramsFound = true;
    } else {
      node = nextNode;
    }
  }
  if ((node === null || node.data === null) && wildcardNode !== null) {
    node = wildcardNode;
    params[node.paramName || "_"] = wildCardParam;
    paramsFound = true;
  }
  if (!node) {
    return null;
  }
  if (paramsFound) {
    return {
      ...node.data,
      params: paramsFound ? params : void 0
    };
  }
  return node.data;
}
function insert(ctx, path, data) {
  let isStaticRoute = true;
  const sections = path.split("/");
  let node = ctx.rootNode;
  let _unnamedPlaceholderCtr = 0;
  const matchedNodes = [node];
  for (const section of sections) {
    let childNode;
    if (childNode = node.children.get(section)) {
      node = childNode;
    } else {
      const type = getNodeType(section);
      childNode = createRadixNode({ type, parent: node });
      node.children.set(section, childNode);
      if (type === NODE_TYPES.PLACEHOLDER) {
        childNode.paramName = section === "*" ? `_${_unnamedPlaceholderCtr++}` : section.slice(1);
        node.placeholderChildren.push(childNode);
        isStaticRoute = false;
      } else if (type === NODE_TYPES.WILDCARD) {
        node.wildcardChildNode = childNode;
        childNode.paramName = section.slice(
          3
          /* "**:" */
        ) || "_";
        isStaticRoute = false;
      }
      matchedNodes.push(childNode);
      node = childNode;
    }
  }
  for (const [depth, node2] of matchedNodes.entries()) {
    node2.maxDepth = Math.max(matchedNodes.length - depth, node2.maxDepth || 0);
  }
  node.data = data;
  if (isStaticRoute === true) {
    ctx.staticRoutesMap[path] = node;
  }
  return node;
}
function remove(ctx, path) {
  let success = false;
  const sections = path.split("/");
  let node = ctx.rootNode;
  for (const section of sections) {
    node = node.children.get(section);
    if (!node) {
      return success;
    }
  }
  if (node.data) {
    const lastSection = sections.at(-1) || "";
    node.data = null;
    if (Object.keys(node.children).length === 0 && node.parent) {
      node.parent.children.delete(lastSection);
      node.parent.wildcardChildNode = null;
      node.parent.placeholderChildren = [];
    }
    success = true;
  }
  return success;
}
function createRadixNode(options = {}) {
  return {
    type: options.type || NODE_TYPES.NORMAL,
    maxDepth: 0,
    parent: options.parent || null,
    children: /* @__PURE__ */ new Map(),
    data: options.data || null,
    paramName: options.paramName || null,
    wildcardChildNode: null,
    placeholderChildren: []
  };
}
function getNodeType(str) {
  if (str.startsWith("**")) {
    return NODE_TYPES.WILDCARD;
  }
  if (str[0] === ":" || str === "*") {
    return NODE_TYPES.PLACEHOLDER;
  }
  return NODE_TYPES.NORMAL;
}

function toRouteMatcher(router) {
  const table = _routerNodeToTable("", router.ctx.rootNode);
  return _createMatcher(table, router.ctx.options.strictTrailingSlash);
}
function _createMatcher(table, strictTrailingSlash) {
  return {
    ctx: { table },
    matchAll: (path) => _matchRoutes(path, table, strictTrailingSlash)
  };
}
function _createRouteTable() {
  return {
    static: /* @__PURE__ */ new Map(),
    wildcard: /* @__PURE__ */ new Map(),
    dynamic: /* @__PURE__ */ new Map()
  };
}
function _matchRoutes(path, table, strictTrailingSlash) {
  if (strictTrailingSlash !== true && path.endsWith("/")) {
    path = path.slice(0, -1) || "/";
  }
  const matches = [];
  for (const [key, value] of _sortRoutesMap(table.wildcard)) {
    if (path === key || path.startsWith(key + "/")) {
      matches.push(value);
    }
  }
  for (const [key, value] of _sortRoutesMap(table.dynamic)) {
    if (path.startsWith(key + "/")) {
      const subPath = "/" + path.slice(key.length).split("/").splice(2).join("/");
      matches.push(..._matchRoutes(subPath, value));
    }
  }
  const staticMatch = table.static.get(path);
  if (staticMatch) {
    matches.push(staticMatch);
  }
  return matches.filter(Boolean);
}
function _sortRoutesMap(m) {
  return [...m.entries()].sort((a, b) => a[0].length - b[0].length);
}
function _routerNodeToTable(initialPath, initialNode) {
  const table = _createRouteTable();
  function _addNode(path, node) {
    if (path) {
      if (node.type === NODE_TYPES.NORMAL && !(path.includes("*") || path.includes(":"))) {
        if (node.data) {
          table.static.set(path, node.data);
        }
      } else if (node.type === NODE_TYPES.WILDCARD) {
        table.wildcard.set(path.replace("/**", ""), node.data);
      } else if (node.type === NODE_TYPES.PLACEHOLDER) {
        const subTable = _routerNodeToTable("", node);
        if (node.data) {
          subTable.static.set("/", node.data);
        }
        table.dynamic.set(path.replace(/\/\*|\/:\w+/, ""), subTable);
        return;
      }
    }
    for (const [childPath, child] of node.children.entries()) {
      _addNode(`${path}/${childPath}`.replace("//", "/"), child);
    }
  }
  _addNode(initialPath, initialNode);
  return table;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) {
    return false;
  }
  if (Symbol.iterator in value) {
    return false;
  }
  if (Symbol.toStringTag in value) {
    return Object.prototype.toString.call(value) === "[object Module]";
  }
  return true;
}

function _defu(baseObject, defaults, namespace = ".", merger) {
  if (!isPlainObject(defaults)) {
    return _defu(baseObject, {}, namespace, merger);
  }
  const object = Object.assign({}, defaults);
  for (const key in baseObject) {
    if (key === "__proto__" || key === "constructor") {
      continue;
    }
    const value = baseObject[key];
    if (value === null || value === void 0) {
      continue;
    }
    if (merger && merger(object, key, value, namespace)) {
      continue;
    }
    if (Array.isArray(value) && Array.isArray(object[key])) {
      object[key] = [...value, ...object[key]];
    } else if (isPlainObject(value) && isPlainObject(object[key])) {
      object[key] = _defu(
        value,
        object[key],
        (namespace ? `${namespace}.` : "") + key.toString(),
        merger
      );
    } else {
      object[key] = value;
    }
  }
  return object;
}
function createDefu(merger) {
  return (...arguments_) => (
    // eslint-disable-next-line unicorn/no-array-reduce
    arguments_.reduce((p, c) => _defu(p, c, "", merger), {})
  );
}
const defu = createDefu();
const defuFn = createDefu((object, key, currentValue) => {
  if (object[key] !== void 0 && typeof currentValue === "function") {
    object[key] = currentValue(object[key]);
    return true;
  }
});

function o(n){throw new Error(`${n} is not implemented yet!`)}let i$1 = class i extends EventEmitter{__unenv__={};readableEncoding=null;readableEnded=true;readableFlowing=false;readableHighWaterMark=0;readableLength=0;readableObjectMode=false;readableAborted=false;readableDidRead=false;closed=false;errored=null;readable=false;destroyed=false;static from(e,t){return new i(t)}constructor(e){super();}_read(e){}read(e){}setEncoding(e){return this}pause(){return this}resume(){return this}isPaused(){return  true}unpipe(e){return this}unshift(e,t){}wrap(e){return this}push(e,t){return  false}_destroy(e,t){this.removeAllListeners();}destroy(e){return this.destroyed=true,this._destroy(e),this}pipe(e,t){return {}}compose(e,t){throw new Error("Method not implemented.")}[Symbol.asyncDispose](){return this.destroy(),Promise.resolve()}async*[Symbol.asyncIterator](){throw o("Readable.asyncIterator")}iterator(e){throw o("Readable.iterator")}map(e,t){throw o("Readable.map")}filter(e,t){throw o("Readable.filter")}forEach(e,t){throw o("Readable.forEach")}reduce(e,t,r){throw o("Readable.reduce")}find(e,t){throw o("Readable.find")}findIndex(e,t){throw o("Readable.findIndex")}some(e,t){throw o("Readable.some")}toArray(e){throw o("Readable.toArray")}every(e,t){throw o("Readable.every")}flatMap(e,t){throw o("Readable.flatMap")}drop(e,t){throw o("Readable.drop")}take(e,t){throw o("Readable.take")}asIndexedPairs(e){throw o("Readable.asIndexedPairs")}};let l$2 = class l extends EventEmitter{__unenv__={};writable=true;writableEnded=false;writableFinished=false;writableHighWaterMark=0;writableLength=0;writableObjectMode=false;writableCorked=0;closed=false;errored=null;writableNeedDrain=false;writableAborted=false;destroyed=false;_data;_encoding="utf8";constructor(e){super();}pipe(e,t){return {}}_write(e,t,r){if(this.writableEnded){r&&r();return}if(this._data===void 0)this._data=e;else {const s=typeof this._data=="string"?Buffer$1.from(this._data,this._encoding||t||"utf8"):this._data,a=typeof e=="string"?Buffer$1.from(e,t||this._encoding||"utf8"):e;this._data=Buffer$1.concat([s,a]);}this._encoding=t,r&&r();}_writev(e,t){}_destroy(e,t){}_final(e){}write(e,t,r){const s=typeof t=="string"?this._encoding:"utf8",a=typeof t=="function"?t:typeof r=="function"?r:void 0;return this._write(e,s,a),true}setDefaultEncoding(e){return this}end(e,t,r){const s=typeof e=="function"?e:typeof t=="function"?t:typeof r=="function"?r:void 0;if(this.writableEnded)return s&&s(),this;const a=e===s?void 0:e;if(a){const u=t===s?void 0:t;this.write(a,u,s);}return this.writableEnded=true,this.writableFinished=true,this.emit("close"),this.emit("finish"),this}cork(){}uncork(){}destroy(e){return this.destroyed=true,delete this._data,this.removeAllListeners(),this}compose(e,t){throw new Error("Method not implemented.")}[Symbol.asyncDispose](){return Promise.resolve()}};const c=class{allowHalfOpen=true;_destroy;constructor(e=new i$1,t=new l$2){Object.assign(this,e),Object.assign(this,t),this._destroy=m(e._destroy,t._destroy);}};function _(){return Object.assign(c.prototype,i$1.prototype),Object.assign(c.prototype,l$2.prototype),c}function m(...n){return function(...e){for(const t of n)t(...e);}}const g$1=_();class A extends g$1{__unenv__={};bufferSize=0;bytesRead=0;bytesWritten=0;connecting=false;destroyed=false;pending=false;localAddress="";localPort=0;remoteAddress="";remoteFamily="";remotePort=0;autoSelectFamilyAttemptedAddresses=[];readyState="readOnly";constructor(e){super();}write(e,t,r){return  false}connect(e,t,r){return this}end(e,t,r){return this}setEncoding(e){return this}pause(){return this}resume(){return this}setTimeout(e,t){return this}setNoDelay(e){return this}setKeepAlive(e,t){return this}address(){return {}}unref(){return this}ref(){return this}destroySoon(){this.destroy();}resetAndDestroy(){const e=new Error("ERR_SOCKET_CLOSED");return e.code="ERR_SOCKET_CLOSED",this.destroy(e),this}}class y extends i$1{aborted=false;httpVersion="1.1";httpVersionMajor=1;httpVersionMinor=1;complete=true;connection;socket;headers={};trailers={};method="GET";url="/";statusCode=200;statusMessage="";closed=false;errored=null;readable=false;constructor(e){super(),this.socket=this.connection=e||new A;}get rawHeaders(){const e=this.headers,t=[];for(const r in e)if(Array.isArray(e[r]))for(const s of e[r])t.push(r,s);else t.push(r,e[r]);return t}get rawTrailers(){return []}setTimeout(e,t){return this}get headersDistinct(){return p(this.headers)}get trailersDistinct(){return p(this.trailers)}}function p(n){const e={};for(const[t,r]of Object.entries(n))t&&(e[t]=(Array.isArray(r)?r:[r]).filter(Boolean));return e}class w extends l$2{statusCode=200;statusMessage="";upgrading=false;chunkedEncoding=false;shouldKeepAlive=false;useChunkedEncodingByDefault=false;sendDate=false;finished=false;headersSent=false;strictContentLength=false;connection=null;socket=null;req;_headers={};constructor(e){super(),this.req=e;}assignSocket(e){e._httpMessage=this,this.socket=e,this.connection=e,this.emit("socket",e),this._flush();}_flush(){this.flushHeaders();}detachSocket(e){}writeContinue(e){}writeHead(e,t,r){e&&(this.statusCode=e),typeof t=="string"&&(this.statusMessage=t,t=void 0);const s=r||t;if(s&&!Array.isArray(s))for(const a in s)this.setHeader(a,s[a]);return this.headersSent=true,this}writeProcessing(){}setTimeout(e,t){return this}appendHeader(e,t){e=e.toLowerCase();const r=this._headers[e],s=[...Array.isArray(r)?r:[r],...Array.isArray(t)?t:[t]].filter(Boolean);return this._headers[e]=s.length>1?s:s[0],this}setHeader(e,t){return this._headers[e.toLowerCase()]=t,this}setHeaders(e){for(const[t,r]of Object.entries(e))this.setHeader(t,r);return this}getHeader(e){return this._headers[e.toLowerCase()]}getHeaders(){return this._headers}getHeaderNames(){return Object.keys(this._headers)}hasHeader(e){return e.toLowerCase()in this._headers}removeHeader(e){delete this._headers[e.toLowerCase()];}addTrailers(e){}flushHeaders(){}writeEarlyHints(e,t){typeof t=="function"&&t();}}const E$1=(()=>{const n=function(){};return n.prototype=Object.create(null),n})();function R(n={}){const e=new E$1,t=Array.isArray(n)||H$1(n)?n:Object.entries(n);for(const[r,s]of t)if(s){if(e[r]===void 0){e[r]=s;continue}e[r]=[...Array.isArray(e[r])?e[r]:[e[r]],...Array.isArray(s)?s:[s]];}return e}function H$1(n){return typeof n?.entries=="function"}function v$1(n={}){if(n instanceof Headers)return n;const e=new Headers;for(const[t,r]of Object.entries(n))if(r!==void 0){if(Array.isArray(r)){for(const s of r)e.append(t,String(s));continue}e.set(t,String(r));}return e}const S=new Set([101,204,205,304]);async function b$1(n,e){const t=new y,r=new w(t);t.url=e.url?.toString()||"/";let s;if(!t.url.startsWith("/")){const d=new URL(t.url);s=d.host,t.url=d.pathname+d.search+d.hash;}t.method=e.method||"GET",t.headers=R(e.headers||{}),t.headers.host||(t.headers.host=e.host||s||"localhost"),t.connection.encrypted=t.connection.encrypted||e.protocol==="https",t.body=e.body||null,t.__unenv__=e.context,await n(t,r);let a=r._data;(S.has(r.statusCode)||t.method.toUpperCase()==="HEAD")&&(a=null,delete r._headers["content-length"]);const u={status:r.statusCode,statusText:r.statusMessage,headers:r._headers,body:a};return t.destroy(),r.destroy(),u}async function C$1(n,e,t={}){try{const r=await b$1(n,{url:e,...t});return new Response(r.body,{status:r.status,statusText:r.statusText,headers:v$1(r.headers)})}catch(r){return new Response(r.toString(),{status:Number.parseInt(r.statusCode||r.code)||500,statusText:r.statusText})}}

function hasProp(obj, prop) {
  try {
    return prop in obj;
  } catch {
    return false;
  }
}

class H3Error extends Error {
  static __h3_error__ = true;
  statusCode = 500;
  fatal = false;
  unhandled = false;
  statusMessage;
  data;
  cause;
  constructor(message, opts = {}) {
    super(message, opts);
    if (opts.cause && !this.cause) {
      this.cause = opts.cause;
    }
  }
  toJSON() {
    const obj = {
      message: this.message,
      statusCode: sanitizeStatusCode(this.statusCode, 500)
    };
    if (this.statusMessage) {
      obj.statusMessage = sanitizeStatusMessage(this.statusMessage);
    }
    if (this.data !== void 0) {
      obj.data = this.data;
    }
    return obj;
  }
}
function createError$1(input) {
  if (typeof input === "string") {
    return new H3Error(input);
  }
  if (isError(input)) {
    return input;
  }
  const err = new H3Error(input.message ?? input.statusMessage ?? "", {
    cause: input.cause || input
  });
  if (hasProp(input, "stack")) {
    try {
      Object.defineProperty(err, "stack", {
        get() {
          return input.stack;
        }
      });
    } catch {
      try {
        err.stack = input.stack;
      } catch {
      }
    }
  }
  if (input.data) {
    err.data = input.data;
  }
  if (input.statusCode) {
    err.statusCode = sanitizeStatusCode(input.statusCode, err.statusCode);
  } else if (input.status) {
    err.statusCode = sanitizeStatusCode(input.status, err.statusCode);
  }
  if (input.statusMessage) {
    err.statusMessage = input.statusMessage;
  } else if (input.statusText) {
    err.statusMessage = input.statusText;
  }
  if (err.statusMessage) {
    const originalMessage = err.statusMessage;
    const sanitizedMessage = sanitizeStatusMessage(err.statusMessage);
    if (sanitizedMessage !== originalMessage) {
      console.warn(
        "[h3] Please prefer using `message` for longer error messages instead of `statusMessage`. In the future, `statusMessage` will be sanitized by default."
      );
    }
  }
  if (input.fatal !== void 0) {
    err.fatal = input.fatal;
  }
  if (input.unhandled !== void 0) {
    err.unhandled = input.unhandled;
  }
  return err;
}
function sendError(event, error, debug) {
  if (event.handled) {
    return;
  }
  const h3Error = isError(error) ? error : createError$1(error);
  const responseBody = {
    statusCode: h3Error.statusCode,
    statusMessage: h3Error.statusMessage,
    stack: [],
    data: h3Error.data
  };
  if (debug) {
    responseBody.stack = (h3Error.stack || "").split("\n").map((l) => l.trim());
  }
  if (event.handled) {
    return;
  }
  const _code = Number.parseInt(h3Error.statusCode);
  setResponseStatus(event, _code, h3Error.statusMessage);
  event.node.res.setHeader("content-type", MIMES.json);
  event.node.res.end(JSON.stringify(responseBody, void 0, 2));
}
function isError(input) {
  return input?.constructor?.__h3_error__ === true;
}
function isMethod(event, expected, allowHead) {
  if (typeof expected === "string") {
    if (event.method === expected) {
      return true;
    }
  } else if (expected.includes(event.method)) {
    return true;
  }
  return false;
}
function assertMethod(event, expected, allowHead) {
  if (!isMethod(event, expected)) {
    throw createError$1({
      statusCode: 405,
      statusMessage: "HTTP method is not allowed."
    });
  }
}
function getRequestHeaders(event) {
  const _headers = {};
  for (const key in event.node.req.headers) {
    const val = event.node.req.headers[key];
    _headers[key] = Array.isArray(val) ? val.filter(Boolean).join(", ") : val;
  }
  return _headers;
}
function getRequestHeader(event, name) {
  const headers = getRequestHeaders(event);
  const value = headers[name.toLowerCase()];
  return value;
}
function getRequestHost(event, opts = {}) {
  if (opts.xForwardedHost) {
    const _header = event.node.req.headers["x-forwarded-host"];
    const xForwardedHost = (_header || "").split(",").shift()?.trim();
    if (xForwardedHost) {
      return xForwardedHost;
    }
  }
  return event.node.req.headers.host || "localhost";
}
function getRequestProtocol(event, opts = {}) {
  if (opts.xForwardedProto !== false && event.node.req.headers["x-forwarded-proto"] === "https") {
    return "https";
  }
  return event.node.req.connection?.encrypted ? "https" : "http";
}
function getRequestURL(event, opts = {}) {
  const host = getRequestHost(event, opts);
  const protocol = getRequestProtocol(event, opts);
  const path = (event.node.req.originalUrl || event.path).replace(
    /^[/\\]+/g,
    "/"
  );
  return new URL(path, `${protocol}://${host}`);
}
function toWebRequest(event) {
  return event.web?.request || new Request(getRequestURL(event), {
    // @ts-ignore Undici option
    duplex: "half",
    method: event.method,
    headers: event.headers,
    body: getRequestWebStream(event)
  });
}

const RawBodySymbol = Symbol.for("h3RawBody");
const PayloadMethods$1 = ["PATCH", "POST", "PUT", "DELETE"];
function readRawBody(event, encoding = "utf8") {
  assertMethod(event, PayloadMethods$1);
  const _rawBody = event._requestBody || event.web?.request?.body || event.node.req[RawBodySymbol] || event.node.req.rawBody || event.node.req.body;
  if (_rawBody) {
    const promise2 = Promise.resolve(_rawBody).then((_resolved) => {
      if (Buffer.isBuffer(_resolved)) {
        return _resolved;
      }
      if (typeof _resolved.pipeTo === "function") {
        return new Promise((resolve, reject) => {
          const chunks = [];
          _resolved.pipeTo(
            new WritableStream({
              write(chunk) {
                chunks.push(chunk);
              },
              close() {
                resolve(Buffer.concat(chunks));
              },
              abort(reason) {
                reject(reason);
              }
            })
          ).catch(reject);
        });
      } else if (typeof _resolved.pipe === "function") {
        return new Promise((resolve, reject) => {
          const chunks = [];
          _resolved.on("data", (chunk) => {
            chunks.push(chunk);
          }).on("end", () => {
            resolve(Buffer.concat(chunks));
          }).on("error", reject);
        });
      }
      if (_resolved.constructor === Object) {
        return Buffer.from(JSON.stringify(_resolved));
      }
      if (_resolved instanceof URLSearchParams) {
        return Buffer.from(_resolved.toString());
      }
      if (_resolved instanceof FormData) {
        return new Response(_resolved).bytes().then((uint8arr) => Buffer.from(uint8arr));
      }
      return Buffer.from(_resolved);
    });
    return encoding ? promise2.then((buff) => buff.toString(encoding)) : promise2;
  }
  if (!Number.parseInt(event.node.req.headers["content-length"] || "") && !/\bchunked\b/i.test(
    String(event.node.req.headers["transfer-encoding"] ?? "")
  )) {
    return Promise.resolve(void 0);
  }
  const promise = event.node.req[RawBodySymbol] = new Promise(
    (resolve, reject) => {
      const bodyData = [];
      event.node.req.on("error", (err) => {
        reject(err);
      }).on("data", (chunk) => {
        bodyData.push(chunk);
      }).on("end", () => {
        resolve(Buffer.concat(bodyData));
      });
    }
  );
  const result = encoding ? promise.then((buff) => buff.toString(encoding)) : promise;
  return result;
}
function getRequestWebStream(event) {
  if (!PayloadMethods$1.includes(event.method)) {
    return;
  }
  const bodyStream = event.web?.request?.body || event._requestBody;
  if (bodyStream) {
    return bodyStream;
  }
  const _hasRawBody = RawBodySymbol in event.node.req || "rawBody" in event.node.req || "body" in event.node.req || "__unenv__" in event.node.req;
  if (_hasRawBody) {
    return new ReadableStream({
      async start(controller) {
        const _rawBody = await readRawBody(event, false);
        if (_rawBody) {
          controller.enqueue(_rawBody);
        }
        controller.close();
      }
    });
  }
  return new ReadableStream({
    start: (controller) => {
      event.node.req.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      event.node.req.on("end", () => {
        controller.close();
      });
      event.node.req.on("error", (err) => {
        controller.error(err);
      });
    }
  });
}

function handleCacheHeaders(event, opts) {
  const cacheControls = ["public", ...opts.cacheControls || []];
  let cacheMatched = false;
  if (opts.maxAge !== void 0) {
    cacheControls.push(`max-age=${+opts.maxAge}`, `s-maxage=${+opts.maxAge}`);
  }
  if (opts.modifiedTime) {
    const modifiedTime = new Date(opts.modifiedTime);
    const ifModifiedSince = event.node.req.headers["if-modified-since"];
    event.node.res.setHeader("last-modified", modifiedTime.toUTCString());
    if (ifModifiedSince && new Date(ifModifiedSince) >= modifiedTime) {
      cacheMatched = true;
    }
  }
  if (opts.etag) {
    event.node.res.setHeader("etag", opts.etag);
    const ifNonMatch = event.node.req.headers["if-none-match"];
    if (ifNonMatch === opts.etag) {
      cacheMatched = true;
    }
  }
  event.node.res.setHeader("cache-control", cacheControls.join(", "));
  if (cacheMatched) {
    event.node.res.statusCode = 304;
    if (!event.handled) {
      event.node.res.end();
    }
    return true;
  }
  return false;
}

const MIMES = {
  html: "text/html",
  json: "application/json"
};

const DISALLOWED_STATUS_CHARS = /[^\u0009\u0020-\u007E]/g;
function sanitizeStatusMessage(statusMessage = "") {
  return statusMessage.replace(DISALLOWED_STATUS_CHARS, "");
}
function sanitizeStatusCode(statusCode, defaultStatusCode = 200) {
  if (!statusCode) {
    return defaultStatusCode;
  }
  if (typeof statusCode === "string") {
    statusCode = Number.parseInt(statusCode, 10);
  }
  if (statusCode < 100 || statusCode > 999) {
    return defaultStatusCode;
  }
  return statusCode;
}
function splitCookiesString(cookiesString) {
  if (Array.isArray(cookiesString)) {
    return cookiesString.flatMap((c) => splitCookiesString(c));
  }
  if (typeof cookiesString !== "string") {
    return [];
  }
  const cookiesStrings = [];
  let pos = 0;
  let start;
  let ch;
  let lastComma;
  let nextStart;
  let cookiesSeparatorFound;
  const skipWhitespace = () => {
    while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
      pos += 1;
    }
    return pos < cookiesString.length;
  };
  const notSpecialChar = () => {
    ch = cookiesString.charAt(pos);
    return ch !== "=" && ch !== ";" && ch !== ",";
  };
  while (pos < cookiesString.length) {
    start = pos;
    cookiesSeparatorFound = false;
    while (skipWhitespace()) {
      ch = cookiesString.charAt(pos);
      if (ch === ",") {
        lastComma = pos;
        pos += 1;
        skipWhitespace();
        nextStart = pos;
        while (pos < cookiesString.length && notSpecialChar()) {
          pos += 1;
        }
        if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
          cookiesSeparatorFound = true;
          pos = nextStart;
          cookiesStrings.push(cookiesString.slice(start, lastComma));
          start = pos;
        } else {
          pos = lastComma + 1;
        }
      } else {
        pos += 1;
      }
    }
    if (!cookiesSeparatorFound || pos >= cookiesString.length) {
      cookiesStrings.push(cookiesString.slice(start));
    }
  }
  return cookiesStrings;
}

const defer = typeof setImmediate === "undefined" ? (fn) => fn() : setImmediate;
function send(event, data, type) {
  if (type) {
    defaultContentType(event, type);
  }
  return new Promise((resolve) => {
    defer(() => {
      if (!event.handled) {
        event.node.res.end(data);
      }
      resolve();
    });
  });
}
function sendNoContent(event, code) {
  if (event.handled) {
    return;
  }
  if (!code && event.node.res.statusCode !== 200) {
    code = event.node.res.statusCode;
  }
  const _code = sanitizeStatusCode(code, 204);
  if (_code === 204) {
    event.node.res.removeHeader("content-length");
  }
  event.node.res.writeHead(_code);
  event.node.res.end();
}
function setResponseStatus(event, code, text) {
  if (code) {
    event.node.res.statusCode = sanitizeStatusCode(
      code,
      event.node.res.statusCode
    );
  }
  if (text) {
    event.node.res.statusMessage = sanitizeStatusMessage(text);
  }
}
function getResponseStatus(event) {
  return event.node.res.statusCode;
}
function defaultContentType(event, type) {
  if (type && event.node.res.statusCode !== 304 && !event.node.res.getHeader("content-type")) {
    event.node.res.setHeader("content-type", type);
  }
}
function sendRedirect(event, location, code = 302) {
  event.node.res.statusCode = sanitizeStatusCode(
    code,
    event.node.res.statusCode
  );
  event.node.res.setHeader("location", location);
  const encodedLoc = location.replace(/"/g, "%22");
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${encodedLoc}"></head></html>`;
  return send(event, html, MIMES.html);
}
function getResponseHeaders(event) {
  return event.node.res.getHeaders();
}
function getResponseHeader(event, name) {
  return event.node.res.getHeader(name);
}
function setResponseHeaders(event, headers) {
  for (const [name, value] of Object.entries(headers)) {
    event.node.res.setHeader(
      name,
      value
    );
  }
}
const setHeaders = setResponseHeaders;
function setResponseHeader(event, name, value) {
  event.node.res.setHeader(name, value);
}
function appendResponseHeader(event, name, value) {
  let current = event.node.res.getHeader(name);
  if (!current) {
    event.node.res.setHeader(name, value);
    return;
  }
  if (!Array.isArray(current)) {
    current = [current.toString()];
  }
  event.node.res.setHeader(name, [...current, value]);
}
function removeResponseHeader(event, name) {
  return event.node.res.removeHeader(name);
}
function isStream(data) {
  if (!data || typeof data !== "object") {
    return false;
  }
  if (typeof data.pipe === "function") {
    if (typeof data._read === "function") {
      return true;
    }
    if (typeof data.abort === "function") {
      return true;
    }
  }
  if (typeof data.pipeTo === "function") {
    return true;
  }
  return false;
}
function isWebResponse(data) {
  return typeof Response !== "undefined" && data instanceof Response;
}
function sendStream(event, stream) {
  if (!stream || typeof stream !== "object") {
    throw new Error("[h3] Invalid stream provided.");
  }
  event.node.res._data = stream;
  if (!event.node.res.socket) {
    event._handled = true;
    return Promise.resolve();
  }
  if (hasProp(stream, "pipeTo") && typeof stream.pipeTo === "function") {
    return stream.pipeTo(
      new WritableStream({
        write(chunk) {
          event.node.res.write(chunk);
        }
      })
    ).then(() => {
      event.node.res.end();
    });
  }
  if (hasProp(stream, "pipe") && typeof stream.pipe === "function") {
    return new Promise((resolve, reject) => {
      stream.pipe(event.node.res);
      if (stream.on) {
        stream.on("end", () => {
          event.node.res.end();
          resolve();
        });
        stream.on("error", (error) => {
          reject(error);
        });
      }
      event.node.res.on("close", () => {
        if (stream.abort) {
          stream.abort();
        }
      });
    });
  }
  throw new Error("[h3] Invalid or incompatible stream provided.");
}
function sendWebResponse(event, response) {
  for (const [key, value] of response.headers) {
    if (key === "set-cookie") {
      event.node.res.appendHeader(key, splitCookiesString(value));
    } else {
      event.node.res.setHeader(key, value);
    }
  }
  if (response.status) {
    event.node.res.statusCode = sanitizeStatusCode(
      response.status,
      event.node.res.statusCode
    );
  }
  if (response.statusText) {
    event.node.res.statusMessage = sanitizeStatusMessage(response.statusText);
  }
  if (response.redirected) {
    event.node.res.setHeader("location", response.url);
  }
  if (!response.body) {
    event.node.res.end();
    return;
  }
  return sendStream(event, response.body);
}

const PayloadMethods = /* @__PURE__ */ new Set(["PATCH", "POST", "PUT", "DELETE"]);
const ignoredHeaders = /* @__PURE__ */ new Set([
  "transfer-encoding",
  "accept-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "expect",
  "host",
  "accept"
]);
async function proxyRequest(event, target, opts = {}) {
  let body;
  let duplex;
  if (PayloadMethods.has(event.method)) {
    if (opts.streamRequest) {
      body = getRequestWebStream(event);
      duplex = "half";
    } else {
      body = await readRawBody(event, false).catch(() => void 0);
    }
  }
  const method = opts.fetchOptions?.method || event.method;
  const fetchHeaders = mergeHeaders$1(
    getProxyRequestHeaders(event, { host: target.startsWith("/") }),
    opts.fetchOptions?.headers,
    opts.headers
  );
  return sendProxy(event, target, {
    ...opts,
    fetchOptions: {
      method,
      body,
      duplex,
      ...opts.fetchOptions,
      headers: fetchHeaders
    }
  });
}
async function sendProxy(event, target, opts = {}) {
  let response;
  try {
    response = await _getFetch(opts.fetch)(target, {
      headers: opts.headers,
      ignoreResponseError: true,
      // make $ofetch.raw transparent
      ...opts.fetchOptions
    });
  } catch (error) {
    throw createError$1({
      status: 502,
      statusMessage: "Bad Gateway",
      cause: error
    });
  }
  event.node.res.statusCode = sanitizeStatusCode(
    response.status,
    event.node.res.statusCode
  );
  event.node.res.statusMessage = sanitizeStatusMessage(response.statusText);
  const cookies = [];
  for (const [key, value] of response.headers.entries()) {
    if (key === "content-encoding") {
      continue;
    }
    if (key === "content-length") {
      continue;
    }
    if (key === "set-cookie") {
      cookies.push(...splitCookiesString(value));
      continue;
    }
    event.node.res.setHeader(key, value);
  }
  if (cookies.length > 0) {
    event.node.res.setHeader(
      "set-cookie",
      cookies.map((cookie) => {
        if (opts.cookieDomainRewrite) {
          cookie = rewriteCookieProperty(
            cookie,
            opts.cookieDomainRewrite,
            "domain"
          );
        }
        if (opts.cookiePathRewrite) {
          cookie = rewriteCookieProperty(
            cookie,
            opts.cookiePathRewrite,
            "path"
          );
        }
        return cookie;
      })
    );
  }
  if (opts.onResponse) {
    await opts.onResponse(event, response);
  }
  if (response._data !== void 0) {
    return response._data;
  }
  if (event.handled) {
    return;
  }
  if (opts.sendStream === false) {
    const data = new Uint8Array(await response.arrayBuffer());
    return event.node.res.end(data);
  }
  if (response.body) {
    for await (const chunk of response.body) {
      event.node.res.write(chunk);
    }
  }
  return event.node.res.end();
}
function getProxyRequestHeaders(event, opts) {
  const headers = /* @__PURE__ */ Object.create(null);
  const reqHeaders = getRequestHeaders(event);
  for (const name in reqHeaders) {
    if (!ignoredHeaders.has(name) || name === "host" && opts?.host) {
      headers[name] = reqHeaders[name];
    }
  }
  return headers;
}
function fetchWithEvent(event, req, init, options) {
  return _getFetch(options?.fetch)(req, {
    ...init,
    context: init?.context || event.context,
    headers: {
      ...getProxyRequestHeaders(event, {
        host: typeof req === "string" && req.startsWith("/")
      }),
      ...init?.headers
    }
  });
}
function _getFetch(_fetch) {
  if (_fetch) {
    return _fetch;
  }
  if (globalThis.fetch) {
    return globalThis.fetch;
  }
  throw new Error(
    "fetch is not available. Try importing `node-fetch-native/polyfill` for Node.js."
  );
}
function rewriteCookieProperty(header, map, property) {
  const _map = typeof map === "string" ? { "*": map } : map;
  return header.replace(
    new RegExp(`(;\\s*${property}=)([^;]+)`, "gi"),
    (match, prefix, previousValue) => {
      let newValue;
      if (previousValue in _map) {
        newValue = _map[previousValue];
      } else if ("*" in _map) {
        newValue = _map["*"];
      } else {
        return match;
      }
      return newValue ? prefix + newValue : "";
    }
  );
}
function mergeHeaders$1(defaults, ...inputs) {
  const _inputs = inputs.filter(Boolean);
  if (_inputs.length === 0) {
    return defaults;
  }
  const merged = new Headers(defaults);
  for (const input of _inputs) {
    const entries = Array.isArray(input) ? input : typeof input.entries === "function" ? input.entries() : Object.entries(input);
    for (const [key, value] of entries) {
      if (value !== void 0) {
        merged.set(key, value);
      }
    }
  }
  return merged;
}

class H3Event {
  "__is_event__" = true;
  // Context
  node;
  // Node
  web;
  // Web
  context = {};
  // Shared
  // Request
  _method;
  _path;
  _headers;
  _requestBody;
  // Response
  _handled = false;
  // Hooks
  _onBeforeResponseCalled;
  _onAfterResponseCalled;
  constructor(req, res) {
    this.node = { req, res };
  }
  // --- Request ---
  get method() {
    if (!this._method) {
      this._method = (this.node.req.method || "GET").toUpperCase();
    }
    return this._method;
  }
  get path() {
    return this._path || this.node.req.url || "/";
  }
  get headers() {
    if (!this._headers) {
      this._headers = _normalizeNodeHeaders(this.node.req.headers);
    }
    return this._headers;
  }
  // --- Respoonse ---
  get handled() {
    return this._handled || this.node.res.writableEnded || this.node.res.headersSent;
  }
  respondWith(response) {
    return Promise.resolve(response).then(
      (_response) => sendWebResponse(this, _response)
    );
  }
  // --- Utils ---
  toString() {
    return `[${this.method}] ${this.path}`;
  }
  toJSON() {
    return this.toString();
  }
  // --- Deprecated ---
  /** @deprecated Please use `event.node.req` instead. */
  get req() {
    return this.node.req;
  }
  /** @deprecated Please use `event.node.res` instead. */
  get res() {
    return this.node.res;
  }
}
function isEvent(input) {
  return hasProp(input, "__is_event__");
}
function createEvent(req, res) {
  return new H3Event(req, res);
}
function _normalizeNodeHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

function defineEventHandler(handler) {
  if (typeof handler === "function") {
    handler.__is_handler__ = true;
    return handler;
  }
  const _hooks = {
    onRequest: _normalizeArray(handler.onRequest),
    onBeforeResponse: _normalizeArray(handler.onBeforeResponse)
  };
  const _handler = (event) => {
    return _callHandler(event, handler.handler, _hooks);
  };
  _handler.__is_handler__ = true;
  _handler.__resolve__ = handler.handler.__resolve__;
  _handler.__websocket__ = handler.websocket;
  return _handler;
}
function _normalizeArray(input) {
  return input ? Array.isArray(input) ? input : [input] : void 0;
}
async function _callHandler(event, handler, hooks) {
  if (hooks.onRequest) {
    for (const hook of hooks.onRequest) {
      await hook(event);
      if (event.handled) {
        return;
      }
    }
  }
  const body = await handler(event);
  const response = { body };
  if (hooks.onBeforeResponse) {
    for (const hook of hooks.onBeforeResponse) {
      await hook(event, response);
    }
  }
  return response.body;
}
const eventHandler = defineEventHandler;
function isEventHandler(input) {
  return hasProp(input, "__is_handler__");
}
function toEventHandler(input, _, _route) {
  return input;
}
function defineLazyEventHandler(factory) {
  let _promise;
  let _resolved;
  const resolveHandler = () => {
    if (_resolved) {
      return Promise.resolve(_resolved);
    }
    if (!_promise) {
      _promise = Promise.resolve(factory()).then((r) => {
        const handler2 = r.default || r;
        if (typeof handler2 !== "function") {
          throw new TypeError(
            "Invalid lazy handler result. It should be a function:",
            handler2
          );
        }
        _resolved = { handler: toEventHandler(r.default || r) };
        return _resolved;
      });
    }
    return _promise;
  };
  const handler = eventHandler((event) => {
    if (_resolved) {
      return _resolved.handler(event);
    }
    return resolveHandler().then((r) => r.handler(event));
  });
  handler.__resolve__ = resolveHandler;
  return handler;
}
const lazyEventHandler = defineLazyEventHandler;

function createApp(options = {}) {
  const stack = [];
  const handler = createAppEventHandler(stack, options);
  const resolve = createResolver(stack);
  handler.__resolve__ = resolve;
  const getWebsocket = cachedFn(() => websocketOptions(resolve, options));
  const app = {
    // @ts-expect-error
    use: (arg1, arg2, arg3) => use(app, arg1, arg2, arg3),
    resolve,
    handler,
    stack,
    options,
    get websocket() {
      return getWebsocket();
    }
  };
  return app;
}
function use(app, arg1, arg2, arg3) {
  if (Array.isArray(arg1)) {
    for (const i of arg1) {
      use(app, i, arg2, arg3);
    }
  } else if (Array.isArray(arg2)) {
    for (const i of arg2) {
      use(app, arg1, i, arg3);
    }
  } else if (typeof arg1 === "string") {
    app.stack.push(
      normalizeLayer({ ...arg3, route: arg1, handler: arg2 })
    );
  } else if (typeof arg1 === "function") {
    app.stack.push(normalizeLayer({ ...arg2, handler: arg1 }));
  } else {
    app.stack.push(normalizeLayer({ ...arg1 }));
  }
  return app;
}
function createAppEventHandler(stack, options) {
  const spacing = options.debug ? 2 : void 0;
  return eventHandler(async (event) => {
    event.node.req.originalUrl = event.node.req.originalUrl || event.node.req.url || "/";
    const _rawReqUrl = event.node.req.url || "/";
    const _reqPath = _decodePath(event._path || _rawReqUrl);
    event._path = _reqPath;
    const _needsRawUrl = _reqPath !== _rawReqUrl;
    let _layerPath;
    if (options.onRequest) {
      await options.onRequest(event);
    }
    for (const layer of stack) {
      if (layer.route.length > 1) {
        if (!_reqPath.startsWith(layer.route)) {
          continue;
        }
        _layerPath = _reqPath.slice(layer.route.length) || "/";
      } else {
        _layerPath = _reqPath;
      }
      if (layer.match && !layer.match(_layerPath, event)) {
        continue;
      }
      event._path = _layerPath;
      event.node.req.url = _needsRawUrl ? layer.route.length > 1 ? _rawReqUrl.slice(layer.route.length) || "/" : _rawReqUrl : _layerPath;
      const val = await layer.handler(event);
      const _body = val === void 0 ? void 0 : await val;
      if (_body !== void 0) {
        const _response = { body: _body };
        if (options.onBeforeResponse) {
          event._onBeforeResponseCalled = true;
          await options.onBeforeResponse(event, _response);
        }
        await handleHandlerResponse(event, _response.body, spacing);
        if (options.onAfterResponse) {
          event._onAfterResponseCalled = true;
          await options.onAfterResponse(event, _response);
        }
        return;
      }
      if (event.handled) {
        if (options.onAfterResponse) {
          event._onAfterResponseCalled = true;
          await options.onAfterResponse(event, void 0);
        }
        return;
      }
    }
    if (!event.handled) {
      throw createError$1({
        statusCode: 404,
        statusMessage: `Cannot find any path matching ${event.path || "/"}.`
      });
    }
    if (options.onAfterResponse) {
      event._onAfterResponseCalled = true;
      await options.onAfterResponse(event, void 0);
    }
  });
}
function createResolver(stack) {
  return async (path) => {
    let _layerPath;
    for (const layer of stack) {
      if (layer.route === "/" && !layer.handler.__resolve__) {
        continue;
      }
      if (!path.startsWith(layer.route)) {
        continue;
      }
      _layerPath = path.slice(layer.route.length) || "/";
      if (layer.match && !layer.match(_layerPath, void 0)) {
        continue;
      }
      let res = { route: layer.route, handler: layer.handler };
      if (res.handler.__resolve__) {
        const _res = await res.handler.__resolve__(_layerPath);
        if (!_res) {
          continue;
        }
        res = {
          ...res,
          ..._res,
          route: joinURL(res.route || "/", _res.route || "/")
        };
      }
      return res;
    }
  };
}
function normalizeLayer(input) {
  let handler = input.handler;
  if (handler.handler) {
    handler = handler.handler;
  }
  if (input.lazy) {
    handler = lazyEventHandler(handler);
  } else if (!isEventHandler(handler)) {
    handler = toEventHandler(handler, void 0, input.route);
  }
  return {
    route: withoutTrailingSlash(input.route),
    match: input.match,
    handler
  };
}
function handleHandlerResponse(event, val, jsonSpace) {
  if (val === null) {
    return sendNoContent(event);
  }
  if (val) {
    if (isWebResponse(val)) {
      return sendWebResponse(event, val);
    }
    if (isStream(val)) {
      return sendStream(event, val);
    }
    if (val.buffer) {
      return send(event, val);
    }
    if (val.arrayBuffer && typeof val.arrayBuffer === "function") {
      return val.arrayBuffer().then((arrayBuffer) => {
        return send(event, Buffer.from(arrayBuffer), val.type);
      });
    }
    if (val instanceof Error) {
      throw createError$1(val);
    }
    if (typeof val.end === "function") {
      return true;
    }
  }
  const valType = typeof val;
  if (valType === "string") {
    return send(event, val, MIMES.html);
  }
  if (valType === "object" || valType === "boolean" || valType === "number") {
    return send(event, JSON.stringify(val, void 0, jsonSpace), MIMES.json);
  }
  if (valType === "bigint") {
    return send(event, val.toString(), MIMES.json);
  }
  throw createError$1({
    statusCode: 500,
    statusMessage: `[h3] Cannot send ${valType} as response.`
  });
}
function cachedFn(fn) {
  let cache;
  return () => {
    if (!cache) {
      cache = fn();
    }
    return cache;
  };
}
function _decodePath(url) {
  const qIndex = url.indexOf("?");
  const path = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = qIndex === -1 ? "" : url.slice(qIndex);
  const decodedPath = path.includes("%25") ? decodePath(path.replace(/%25/g, "%2525")) : decodePath(path);
  return decodedPath + query;
}
function websocketOptions(evResolver, appOptions) {
  return {
    ...appOptions.websocket,
    async resolve(info) {
      const url = info.request?.url || info.url || "/";
      const { pathname } = typeof url === "string" ? parseURL(url) : url;
      const resolved = await evResolver(pathname);
      return resolved?.handler?.__websocket__ || {};
    }
  };
}

const RouterMethods = [
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "post",
  "put",
  "trace",
  "patch"
];
function createRouter(opts = {}) {
  const _router = createRouter$1({});
  const routes = {};
  let _matcher;
  const router = {};
  const addRoute = (path, handler, method) => {
    let route = routes[path];
    if (!route) {
      routes[path] = route = { path, handlers: {} };
      _router.insert(path, route);
    }
    if (Array.isArray(method)) {
      for (const m of method) {
        addRoute(path, handler, m);
      }
    } else {
      route.handlers[method] = toEventHandler(handler);
    }
    return router;
  };
  router.use = router.add = (path, handler, method) => addRoute(path, handler, method || "all");
  for (const method of RouterMethods) {
    router[method] = (path, handle) => router.add(path, handle, method);
  }
  const matchHandler = (path = "/", method = "get") => {
    const qIndex = path.indexOf("?");
    if (qIndex !== -1) {
      path = path.slice(0, Math.max(0, qIndex));
    }
    const matched = _router.lookup(path);
    if (!matched || !matched.handlers) {
      return {
        error: createError$1({
          statusCode: 404,
          name: "Not Found",
          statusMessage: `Cannot find any route matching ${path || "/"}.`
        })
      };
    }
    let handler = matched.handlers[method] || matched.handlers.all;
    if (!handler) {
      if (!_matcher) {
        _matcher = toRouteMatcher(_router);
      }
      const _matches = _matcher.matchAll(path).reverse();
      for (const _match of _matches) {
        if (_match.handlers[method]) {
          handler = _match.handlers[method];
          matched.handlers[method] = matched.handlers[method] || handler;
          break;
        }
        if (_match.handlers.all) {
          handler = _match.handlers.all;
          matched.handlers.all = matched.handlers.all || handler;
          break;
        }
      }
    }
    if (!handler) {
      return {
        error: createError$1({
          statusCode: 405,
          name: "Method Not Allowed",
          statusMessage: `Method ${method} is not allowed on this route.`
        })
      };
    }
    return { matched, handler };
  };
  const isPreemptive = opts.preemptive || opts.preemtive;
  router.handler = eventHandler((event) => {
    const match = matchHandler(
      event.path,
      event.method.toLowerCase()
    );
    if ("error" in match) {
      if (isPreemptive) {
        throw match.error;
      } else {
        return;
      }
    }
    event.context.matchedRoute = match.matched;
    const params = match.matched.params || {};
    event.context.params = params;
    return Promise.resolve(match.handler(event)).then((res) => {
      if (res === void 0 && isPreemptive) {
        return null;
      }
      return res;
    });
  });
  router.handler.__resolve__ = async (path) => {
    path = withLeadingSlash(path);
    const match = matchHandler(path);
    if ("error" in match) {
      return;
    }
    let res = {
      route: match.matched.path,
      handler: match.handler
    };
    if (match.handler.__resolve__) {
      const _res = await match.handler.__resolve__(path);
      if (!_res) {
        return;
      }
      res = { ...res, ..._res };
    }
    return res;
  };
  return router;
}
function toNodeListener(app) {
  const toNodeHandle = async function(req, res) {
    const event = createEvent(req, res);
    try {
      await app.handler(event);
    } catch (_error) {
      const error = createError$1(_error);
      if (!isError(_error)) {
        error.unhandled = true;
      }
      setResponseStatus(event, error.statusCode, error.statusMessage);
      if (app.options.onError) {
        await app.options.onError(error, event);
      }
      if (event.handled) {
        return;
      }
      if (error.unhandled || error.fatal) {
        console.error("[h3]", error.fatal ? "[fatal]" : "[unhandled]", error);
      }
      if (app.options.onBeforeResponse && !event._onBeforeResponseCalled) {
        await app.options.onBeforeResponse(event, { body: error });
      }
      await sendError(event, error, !!app.options.debug);
      if (app.options.onAfterResponse && !event._onAfterResponseCalled) {
        await app.options.onAfterResponse(event, { body: error });
      }
    }
  };
  return toNodeHandle;
}

function flatHooks(configHooks, hooks = {}, parentName) {
  for (const key in configHooks) {
    const subHook = configHooks[key];
    const name = parentName ? `${parentName}:${key}` : key;
    if (typeof subHook === "object" && subHook !== null) {
      flatHooks(subHook, hooks, name);
    } else if (typeof subHook === "function") {
      hooks[name] = subHook;
    }
  }
  return hooks;
}
const defaultTask = { run: (function_) => function_() };
const _createTask = () => defaultTask;
const createTask = typeof console.createTask !== "undefined" ? console.createTask : _createTask;
function serialTaskCaller(hooks, args) {
  const name = args.shift();
  const task = createTask(name);
  return hooks.reduce(
    (promise, hookFunction) => promise.then(() => task.run(() => hookFunction(...args))),
    Promise.resolve()
  );
}
function parallelTaskCaller(hooks, args) {
  const name = args.shift();
  const task = createTask(name);
  return Promise.all(hooks.map((hook) => task.run(() => hook(...args))));
}
function callEachWith(callbacks, arg0) {
  for (const callback of [...callbacks]) {
    callback(arg0);
  }
}

class Hookable {
  constructor() {
    this._hooks = {};
    this._before = void 0;
    this._after = void 0;
    this._deprecatedMessages = void 0;
    this._deprecatedHooks = {};
    this.hook = this.hook.bind(this);
    this.callHook = this.callHook.bind(this);
    this.callHookWith = this.callHookWith.bind(this);
  }
  hook(name, function_, options = {}) {
    if (!name || typeof function_ !== "function") {
      return () => {
      };
    }
    const originalName = name;
    let dep;
    while (this._deprecatedHooks[name]) {
      dep = this._deprecatedHooks[name];
      name = dep.to;
    }
    if (dep && !options.allowDeprecated) {
      let message = dep.message;
      if (!message) {
        message = `${originalName} hook has been deprecated` + (dep.to ? `, please use ${dep.to}` : "");
      }
      if (!this._deprecatedMessages) {
        this._deprecatedMessages = /* @__PURE__ */ new Set();
      }
      if (!this._deprecatedMessages.has(message)) {
        console.warn(message);
        this._deprecatedMessages.add(message);
      }
    }
    if (!function_.name) {
      try {
        Object.defineProperty(function_, "name", {
          get: () => "_" + name.replace(/\W+/g, "_") + "_hook_cb",
          configurable: true
        });
      } catch {
      }
    }
    this._hooks[name] = this._hooks[name] || [];
    this._hooks[name].push(function_);
    return () => {
      if (function_) {
        this.removeHook(name, function_);
        function_ = void 0;
      }
    };
  }
  hookOnce(name, function_) {
    let _unreg;
    let _function = (...arguments_) => {
      if (typeof _unreg === "function") {
        _unreg();
      }
      _unreg = void 0;
      _function = void 0;
      return function_(...arguments_);
    };
    _unreg = this.hook(name, _function);
    return _unreg;
  }
  removeHook(name, function_) {
    if (this._hooks[name]) {
      const index = this._hooks[name].indexOf(function_);
      if (index !== -1) {
        this._hooks[name].splice(index, 1);
      }
      if (this._hooks[name].length === 0) {
        delete this._hooks[name];
      }
    }
  }
  deprecateHook(name, deprecated) {
    this._deprecatedHooks[name] = typeof deprecated === "string" ? { to: deprecated } : deprecated;
    const _hooks = this._hooks[name] || [];
    delete this._hooks[name];
    for (const hook of _hooks) {
      this.hook(name, hook);
    }
  }
  deprecateHooks(deprecatedHooks) {
    Object.assign(this._deprecatedHooks, deprecatedHooks);
    for (const name in deprecatedHooks) {
      this.deprecateHook(name, deprecatedHooks[name]);
    }
  }
  addHooks(configHooks) {
    const hooks = flatHooks(configHooks);
    const removeFns = Object.keys(hooks).map(
      (key) => this.hook(key, hooks[key])
    );
    return () => {
      for (const unreg of removeFns.splice(0, removeFns.length)) {
        unreg();
      }
    };
  }
  removeHooks(configHooks) {
    const hooks = flatHooks(configHooks);
    for (const key in hooks) {
      this.removeHook(key, hooks[key]);
    }
  }
  removeAllHooks() {
    for (const key in this._hooks) {
      delete this._hooks[key];
    }
  }
  callHook(name, ...arguments_) {
    arguments_.unshift(name);
    return this.callHookWith(serialTaskCaller, name, ...arguments_);
  }
  callHookParallel(name, ...arguments_) {
    arguments_.unshift(name);
    return this.callHookWith(parallelTaskCaller, name, ...arguments_);
  }
  callHookWith(caller, name, ...arguments_) {
    const event = this._before || this._after ? { name, args: arguments_, context: {} } : void 0;
    if (this._before) {
      callEachWith(this._before, event);
    }
    const result = caller(
      name in this._hooks ? [...this._hooks[name]] : [],
      arguments_
    );
    if (result instanceof Promise) {
      return result.finally(() => {
        if (this._after && event) {
          callEachWith(this._after, event);
        }
      });
    }
    if (this._after && event) {
      callEachWith(this._after, event);
    }
    return result;
  }
  beforeEach(function_) {
    this._before = this._before || [];
    this._before.push(function_);
    return () => {
      if (this._before !== void 0) {
        const index = this._before.indexOf(function_);
        if (index !== -1) {
          this._before.splice(index, 1);
        }
      }
    };
  }
  afterEach(function_) {
    this._after = this._after || [];
    this._after.push(function_);
    return () => {
      if (this._after !== void 0) {
        const index = this._after.indexOf(function_);
        if (index !== -1) {
          this._after.splice(index, 1);
        }
      }
    };
  }
}
function createHooks() {
  return new Hookable();
}

const s$1=globalThis.Headers,i=globalThis.AbortController,l$1=globalThis.fetch||(()=>{throw new Error("[node-fetch-native] Failed to fetch: `globalThis.fetch` is not available!")});

class FetchError extends Error {
  constructor(message, opts) {
    super(message, opts);
    this.name = "FetchError";
    if (opts?.cause && !this.cause) {
      this.cause = opts.cause;
    }
  }
}
function createFetchError(ctx) {
  const errorMessage = ctx.error?.message || ctx.error?.toString() || "";
  const method = ctx.request?.method || ctx.options?.method || "GET";
  const url = ctx.request?.url || String(ctx.request) || "/";
  const requestStr = `[${method}] ${JSON.stringify(url)}`;
  const statusStr = ctx.response ? `${ctx.response.status} ${ctx.response.statusText}` : "<no response>";
  const message = `${requestStr}: ${statusStr}${errorMessage ? ` ${errorMessage}` : ""}`;
  const fetchError = new FetchError(
    message,
    ctx.error ? { cause: ctx.error } : void 0
  );
  for (const key of ["request", "options", "response"]) {
    Object.defineProperty(fetchError, key, {
      get() {
        return ctx[key];
      }
    });
  }
  for (const [key, refKey] of [
    ["data", "_data"],
    ["status", "status"],
    ["statusCode", "status"],
    ["statusText", "statusText"],
    ["statusMessage", "statusText"]
  ]) {
    Object.defineProperty(fetchError, key, {
      get() {
        return ctx.response && ctx.response[refKey];
      }
    });
  }
  return fetchError;
}

const payloadMethods = new Set(
  Object.freeze(["PATCH", "POST", "PUT", "DELETE"])
);
function isPayloadMethod(method = "GET") {
  return payloadMethods.has(method.toUpperCase());
}
function isJSONSerializable(value) {
  if (value === void 0) {
    return false;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === null) {
    return true;
  }
  if (t !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (value.buffer) {
    return false;
  }
  if (value instanceof FormData || value instanceof URLSearchParams) {
    return false;
  }
  return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
const textTypes = /* @__PURE__ */ new Set([
  "image/svg",
  "application/xml",
  "application/xhtml",
  "application/html"
]);
const JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(;.+)?$/i;
function detectResponseType(_contentType = "") {
  if (!_contentType) {
    return "json";
  }
  const contentType = _contentType.split(";").shift() || "";
  if (JSON_RE.test(contentType)) {
    return "json";
  }
  if (contentType === "text/event-stream") {
    return "stream";
  }
  if (textTypes.has(contentType) || contentType.startsWith("text/")) {
    return "text";
  }
  return "blob";
}
function resolveFetchOptions(request, input, defaults, Headers) {
  const headers = mergeHeaders(
    input?.headers ?? request?.headers,
    defaults?.headers,
    Headers
  );
  let query;
  if (defaults?.query || defaults?.params || input?.params || input?.query) {
    query = {
      ...defaults?.params,
      ...defaults?.query,
      ...input?.params,
      ...input?.query
    };
  }
  return {
    ...defaults,
    ...input,
    query,
    params: query,
    headers
  };
}
function mergeHeaders(input, defaults, Headers) {
  if (!defaults) {
    return new Headers(input);
  }
  const headers = new Headers(defaults);
  if (input) {
    for (const [key, value] of Symbol.iterator in input || Array.isArray(input) ? input : new Headers(input)) {
      headers.set(key, value);
    }
  }
  return headers;
}
async function callHooks(context, hooks) {
  if (hooks) {
    if (Array.isArray(hooks)) {
      for (const hook of hooks) {
        await hook(context);
      }
    } else {
      await hooks(context);
    }
  }
}

const retryStatusCodes = /* @__PURE__ */ new Set([
  408,
  // Request Timeout
  409,
  // Conflict
  425,
  // Too Early (Experimental)
  429,
  // Too Many Requests
  500,
  // Internal Server Error
  502,
  // Bad Gateway
  503,
  // Service Unavailable
  504
  // Gateway Timeout
]);
const nullBodyResponses = /* @__PURE__ */ new Set([101, 204, 205, 304]);
function createFetch(globalOptions = {}) {
  const {
    fetch = globalThis.fetch,
    Headers = globalThis.Headers,
    AbortController = globalThis.AbortController
  } = globalOptions;
  async function onError(context) {
    const isAbort = context.error && context.error.name === "AbortError" && !context.options.timeout || false;
    if (context.options.retry !== false && !isAbort) {
      let retries;
      if (typeof context.options.retry === "number") {
        retries = context.options.retry;
      } else {
        retries = isPayloadMethod(context.options.method) ? 0 : 1;
      }
      const responseCode = context.response && context.response.status || 500;
      if (retries > 0 && (Array.isArray(context.options.retryStatusCodes) ? context.options.retryStatusCodes.includes(responseCode) : retryStatusCodes.has(responseCode))) {
        const retryDelay = typeof context.options.retryDelay === "function" ? context.options.retryDelay(context) : context.options.retryDelay || 0;
        if (retryDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
        return $fetchRaw(context.request, {
          ...context.options,
          retry: retries - 1
        });
      }
    }
    const error = createFetchError(context);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(error, $fetchRaw);
    }
    throw error;
  }
  const $fetchRaw = async function $fetchRaw2(_request, _options = {}) {
    const context = {
      request: _request,
      options: resolveFetchOptions(
        _request,
        _options,
        globalOptions.defaults,
        Headers
      ),
      response: void 0,
      error: void 0
    };
    if (context.options.method) {
      context.options.method = context.options.method.toUpperCase();
    }
    if (context.options.onRequest) {
      await callHooks(context, context.options.onRequest);
      if (!(context.options.headers instanceof Headers)) {
        context.options.headers = new Headers(
          context.options.headers || {}
          /* compat */
        );
      }
    }
    if (typeof context.request === "string") {
      if (context.options.baseURL) {
        context.request = withBase(context.request, context.options.baseURL);
      }
      if (context.options.query) {
        context.request = withQuery(context.request, context.options.query);
        delete context.options.query;
      }
      if ("query" in context.options) {
        delete context.options.query;
      }
      if ("params" in context.options) {
        delete context.options.params;
      }
    }
    if (context.options.body && isPayloadMethod(context.options.method)) {
      if (isJSONSerializable(context.options.body)) {
        const contentType = context.options.headers.get("content-type");
        if (typeof context.options.body !== "string") {
          context.options.body = contentType === "application/x-www-form-urlencoded" ? new URLSearchParams(
            context.options.body
          ).toString() : JSON.stringify(context.options.body);
        }
        if (!contentType) {
          context.options.headers.set("content-type", "application/json");
        }
        if (!context.options.headers.has("accept")) {
          context.options.headers.set("accept", "application/json");
        }
      } else if (
        // ReadableStream Body
        "pipeTo" in context.options.body && typeof context.options.body.pipeTo === "function" || // Node.js Stream Body
        typeof context.options.body.pipe === "function"
      ) {
        if (!("duplex" in context.options)) {
          context.options.duplex = "half";
        }
      }
    }
    let abortTimeout;
    if (!context.options.signal && context.options.timeout) {
      const controller = new AbortController();
      abortTimeout = setTimeout(() => {
        const error = new Error(
          "[TimeoutError]: The operation was aborted due to timeout"
        );
        error.name = "TimeoutError";
        error.code = 23;
        controller.abort(error);
      }, context.options.timeout);
      context.options.signal = controller.signal;
    }
    try {
      context.response = await fetch(
        context.request,
        context.options
      );
    } catch (error) {
      context.error = error;
      if (context.options.onRequestError) {
        await callHooks(
          context,
          context.options.onRequestError
        );
      }
      return await onError(context);
    } finally {
      if (abortTimeout) {
        clearTimeout(abortTimeout);
      }
    }
    const hasBody = (context.response.body || // https://github.com/unjs/ofetch/issues/324
    // https://github.com/unjs/ofetch/issues/294
    // https://github.com/JakeChampion/fetch/issues/1454
    context.response._bodyInit) && !nullBodyResponses.has(context.response.status) && context.options.method !== "HEAD";
    if (hasBody) {
      const responseType = (context.options.parseResponse ? "json" : context.options.responseType) || detectResponseType(context.response.headers.get("content-type") || "");
      switch (responseType) {
        case "json": {
          const data = await context.response.text();
          const parseFunction = context.options.parseResponse || destr;
          context.response._data = parseFunction(data);
          break;
        }
        case "stream": {
          context.response._data = context.response.body || context.response._bodyInit;
          break;
        }
        default: {
          context.response._data = await context.response[responseType]();
        }
      }
    }
    if (context.options.onResponse) {
      await callHooks(
        context,
        context.options.onResponse
      );
    }
    if (!context.options.ignoreResponseError && context.response.status >= 400 && context.response.status < 600) {
      if (context.options.onResponseError) {
        await callHooks(
          context,
          context.options.onResponseError
        );
      }
      return await onError(context);
    }
    return context.response;
  };
  const $fetch = async function $fetch2(request, options) {
    const r = await $fetchRaw(request, options);
    return r._data;
  };
  $fetch.raw = $fetchRaw;
  $fetch.native = (...args) => fetch(...args);
  $fetch.create = (defaultOptions = {}, customGlobalOptions = {}) => createFetch({
    ...globalOptions,
    ...customGlobalOptions,
    defaults: {
      ...globalOptions.defaults,
      ...customGlobalOptions.defaults,
      ...defaultOptions
    }
  });
  return $fetch;
}

function createNodeFetch() {
  const useKeepAlive = JSON.parse(process.env.FETCH_KEEP_ALIVE || "false");
  if (!useKeepAlive) {
    return l$1;
  }
  const agentOptions = { keepAlive: true };
  const httpAgent = new http.Agent(agentOptions);
  const httpsAgent = new https.Agent(agentOptions);
  const nodeFetchOptions = {
    agent(parsedURL) {
      return parsedURL.protocol === "http:" ? httpAgent : httpsAgent;
    }
  };
  return function nodeFetchWithKeepAlive(input, init) {
    return l$1(input, { ...nodeFetchOptions, ...init });
  };
}
const fetch$1 = globalThis.fetch ? (...args) => globalThis.fetch(...args) : createNodeFetch();
const Headers$1 = globalThis.Headers || s$1;
const AbortController$1 = globalThis.AbortController || i;
createFetch({ fetch: fetch$1, Headers: Headers$1, AbortController: AbortController$1 });

function wrapToPromise(value) {
  if (!value || typeof value.then !== "function") {
    return Promise.resolve(value);
  }
  return value;
}
function asyncCall(function_, ...arguments_) {
  try {
    return wrapToPromise(function_(...arguments_));
  } catch (error) {
    return Promise.reject(error);
  }
}
function isPrimitive(value) {
  const type = typeof value;
  return value === null || type !== "object" && type !== "function";
}
function isPureObject(value) {
  const proto = Object.getPrototypeOf(value);
  return !proto || proto.isPrototypeOf(Object);
}
function stringify(value) {
  if (isPrimitive(value)) {
    return String(value);
  }
  if (isPureObject(value) || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value.toJSON === "function") {
    return stringify(value.toJSON());
  }
  throw new Error("[unstorage] Cannot stringify value!");
}
const BASE64_PREFIX = "base64:";
function serializeRaw(value) {
  if (typeof value === "string") {
    return value;
  }
  return BASE64_PREFIX + base64Encode(value);
}
function deserializeRaw(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (!value.startsWith(BASE64_PREFIX)) {
    return value;
  }
  return base64Decode(value.slice(BASE64_PREFIX.length));
}
function base64Decode(input) {
  if (globalThis.Buffer) {
    return Buffer.from(input, "base64");
  }
  return Uint8Array.from(
    globalThis.atob(input),
    (c) => c.codePointAt(0)
  );
}
function base64Encode(input) {
  if (globalThis.Buffer) {
    return Buffer.from(input).toString("base64");
  }
  return globalThis.btoa(String.fromCodePoint(...input));
}

const storageKeyProperties = [
  "has",
  "hasItem",
  "get",
  "getItem",
  "getItemRaw",
  "set",
  "setItem",
  "setItemRaw",
  "del",
  "remove",
  "removeItem",
  "getMeta",
  "setMeta",
  "removeMeta",
  "getKeys",
  "clear",
  "mount",
  "unmount"
];
function prefixStorage(storage, base) {
  base = normalizeBaseKey(base);
  if (!base) {
    return storage;
  }
  const nsStorage = { ...storage };
  for (const property of storageKeyProperties) {
    nsStorage[property] = (key = "", ...args) => (
      // @ts-ignore
      storage[property](base + key, ...args)
    );
  }
  nsStorage.getKeys = (key = "", ...arguments_) => storage.getKeys(base + key, ...arguments_).then((keys) => keys.map((key2) => key2.slice(base.length)));
  nsStorage.keys = nsStorage.getKeys;
  nsStorage.getItems = async (items, commonOptions) => {
    const prefixedItems = items.map(
      (item) => typeof item === "string" ? base + item : { ...item, key: base + item.key }
    );
    const results = await storage.getItems(prefixedItems, commonOptions);
    return results.map((entry) => ({
      key: entry.key.slice(base.length),
      value: entry.value
    }));
  };
  nsStorage.setItems = async (items, commonOptions) => {
    const prefixedItems = items.map((item) => ({
      key: base + item.key,
      value: item.value,
      options: item.options
    }));
    return storage.setItems(prefixedItems, commonOptions);
  };
  return nsStorage;
}
function normalizeKey$1(key) {
  if (!key) {
    return "";
  }
  return key.split("?")[0]?.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "") || "";
}
function joinKeys(...keys) {
  return normalizeKey$1(keys.join(":"));
}
function normalizeBaseKey(base) {
  base = normalizeKey$1(base);
  return base ? base + ":" : "";
}
function filterKeyByDepth(key, depth) {
  if (depth === void 0) {
    return true;
  }
  let substrCount = 0;
  let index = key.indexOf(":");
  while (index > -1) {
    substrCount++;
    index = key.indexOf(":", index + 1);
  }
  return substrCount <= depth;
}
function filterKeyByBase(key, base) {
  if (base) {
    return key.startsWith(base) && key[key.length - 1] !== "$";
  }
  return key[key.length - 1] !== "$";
}

function defineDriver$1(factory) {
  return factory;
}

const DRIVER_NAME$1 = "memory";
const memory = defineDriver$1(() => {
  const data = /* @__PURE__ */ new Map();
  return {
    name: DRIVER_NAME$1,
    getInstance: () => data,
    hasItem(key) {
      return data.has(key);
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    getItemRaw(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    setItemRaw(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    getKeys() {
      return [...data.keys()];
    },
    clear() {
      data.clear();
    },
    dispose() {
      data.clear();
    }
  };
});

function createStorage(options = {}) {
  const context = {
    mounts: { "": options.driver || memory() },
    mountpoints: [""],
    watching: false,
    watchListeners: [],
    unwatch: {}
  };
  const getMount = (key) => {
    for (const base of context.mountpoints) {
      if (key.startsWith(base)) {
        return {
          base,
          relativeKey: key.slice(base.length),
          driver: context.mounts[base]
        };
      }
    }
    return {
      base: "",
      relativeKey: key,
      driver: context.mounts[""]
    };
  };
  const getMounts = (base, includeParent) => {
    return context.mountpoints.filter(
      (mountpoint) => mountpoint.startsWith(base) || includeParent && base.startsWith(mountpoint)
    ).map((mountpoint) => ({
      relativeBase: base.length > mountpoint.length ? base.slice(mountpoint.length) : void 0,
      mountpoint,
      driver: context.mounts[mountpoint]
    }));
  };
  const onChange = (event, key) => {
    if (!context.watching) {
      return;
    }
    key = normalizeKey$1(key);
    for (const listener of context.watchListeners) {
      listener(event, key);
    }
  };
  const startWatch = async () => {
    if (context.watching) {
      return;
    }
    context.watching = true;
    for (const mountpoint in context.mounts) {
      context.unwatch[mountpoint] = await watch(
        context.mounts[mountpoint],
        onChange,
        mountpoint
      );
    }
  };
  const stopWatch = async () => {
    if (!context.watching) {
      return;
    }
    for (const mountpoint in context.unwatch) {
      await context.unwatch[mountpoint]();
    }
    context.unwatch = {};
    context.watching = false;
  };
  const runBatch = (items, commonOptions, cb) => {
    const batches = /* @__PURE__ */ new Map();
    const getBatch = (mount) => {
      let batch = batches.get(mount.base);
      if (!batch) {
        batch = {
          driver: mount.driver,
          base: mount.base,
          items: []
        };
        batches.set(mount.base, batch);
      }
      return batch;
    };
    for (const item of items) {
      const isStringItem = typeof item === "string";
      const key = normalizeKey$1(isStringItem ? item : item.key);
      const value = isStringItem ? void 0 : item.value;
      const options2 = isStringItem || !item.options ? commonOptions : { ...commonOptions, ...item.options };
      const mount = getMount(key);
      getBatch(mount).items.push({
        key,
        value,
        relativeKey: mount.relativeKey,
        options: options2
      });
    }
    return Promise.all([...batches.values()].map((batch) => cb(batch))).then(
      (r) => r.flat()
    );
  };
  const storage = {
    // Item
    hasItem(key, opts = {}) {
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      return asyncCall(driver.hasItem, relativeKey, opts);
    },
    getItem(key, opts = {}) {
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      return asyncCall(driver.getItem, relativeKey, opts).then(
        (value) => destr(value)
      );
    },
    getItems(items, commonOptions = {}) {
      return runBatch(items, commonOptions, (batch) => {
        if (batch.driver.getItems) {
          return asyncCall(
            batch.driver.getItems,
            batch.items.map((item) => ({
              key: item.relativeKey,
              options: item.options
            })),
            commonOptions
          ).then(
            (r) => r.map((item) => ({
              key: joinKeys(batch.base, item.key),
              value: destr(item.value)
            }))
          );
        }
        return Promise.all(
          batch.items.map((item) => {
            return asyncCall(
              batch.driver.getItem,
              item.relativeKey,
              item.options
            ).then((value) => ({
              key: item.key,
              value: destr(value)
            }));
          })
        );
      });
    },
    getItemRaw(key, opts = {}) {
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      if (driver.getItemRaw) {
        return asyncCall(driver.getItemRaw, relativeKey, opts);
      }
      return asyncCall(driver.getItem, relativeKey, opts).then(
        (value) => deserializeRaw(value)
      );
    },
    async setItem(key, value, opts = {}) {
      if (value === void 0) {
        return storage.removeItem(key);
      }
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      if (!driver.setItem) {
        return;
      }
      await asyncCall(driver.setItem, relativeKey, stringify(value), opts);
      if (!driver.watch) {
        onChange("update", key);
      }
    },
    async setItems(items, commonOptions) {
      await runBatch(items, commonOptions, async (batch) => {
        if (batch.driver.setItems) {
          return asyncCall(
            batch.driver.setItems,
            batch.items.map((item) => ({
              key: item.relativeKey,
              value: stringify(item.value),
              options: item.options
            })),
            commonOptions
          );
        }
        if (!batch.driver.setItem) {
          return;
        }
        await Promise.all(
          batch.items.map((item) => {
            return asyncCall(
              batch.driver.setItem,
              item.relativeKey,
              stringify(item.value),
              item.options
            );
          })
        );
      });
    },
    async setItemRaw(key, value, opts = {}) {
      if (value === void 0) {
        return storage.removeItem(key, opts);
      }
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      if (driver.setItemRaw) {
        await asyncCall(driver.setItemRaw, relativeKey, value, opts);
      } else if (driver.setItem) {
        await asyncCall(driver.setItem, relativeKey, serializeRaw(value), opts);
      } else {
        return;
      }
      if (!driver.watch) {
        onChange("update", key);
      }
    },
    async removeItem(key, opts = {}) {
      if (typeof opts === "boolean") {
        opts = { removeMeta: opts };
      }
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      if (!driver.removeItem) {
        return;
      }
      await asyncCall(driver.removeItem, relativeKey, opts);
      if (opts.removeMeta || opts.removeMata) {
        await asyncCall(driver.removeItem, relativeKey + "$", opts);
      }
      if (!driver.watch) {
        onChange("remove", key);
      }
    },
    // Meta
    async getMeta(key, opts = {}) {
      if (typeof opts === "boolean") {
        opts = { nativeOnly: opts };
      }
      key = normalizeKey$1(key);
      const { relativeKey, driver } = getMount(key);
      const meta = /* @__PURE__ */ Object.create(null);
      if (driver.getMeta) {
        Object.assign(meta, await asyncCall(driver.getMeta, relativeKey, opts));
      }
      if (!opts.nativeOnly) {
        const value = await asyncCall(
          driver.getItem,
          relativeKey + "$",
          opts
        ).then((value_) => destr(value_));
        if (value && typeof value === "object") {
          if (typeof value.atime === "string") {
            value.atime = new Date(value.atime);
          }
          if (typeof value.mtime === "string") {
            value.mtime = new Date(value.mtime);
          }
          Object.assign(meta, value);
        }
      }
      return meta;
    },
    setMeta(key, value, opts = {}) {
      return this.setItem(key + "$", value, opts);
    },
    removeMeta(key, opts = {}) {
      return this.removeItem(key + "$", opts);
    },
    // Keys
    async getKeys(base, opts = {}) {
      base = normalizeBaseKey(base);
      const mounts = getMounts(base, true);
      let maskedMounts = [];
      const allKeys = [];
      let allMountsSupportMaxDepth = true;
      for (const mount of mounts) {
        if (!mount.driver.flags?.maxDepth) {
          allMountsSupportMaxDepth = false;
        }
        const rawKeys = await asyncCall(
          mount.driver.getKeys,
          mount.relativeBase,
          opts
        );
        for (const key of rawKeys) {
          const fullKey = mount.mountpoint + normalizeKey$1(key);
          if (!maskedMounts.some((p) => fullKey.startsWith(p))) {
            allKeys.push(fullKey);
          }
        }
        maskedMounts = [
          mount.mountpoint,
          ...maskedMounts.filter((p) => !p.startsWith(mount.mountpoint))
        ];
      }
      const shouldFilterByDepth = opts.maxDepth !== void 0 && !allMountsSupportMaxDepth;
      return allKeys.filter(
        (key) => (!shouldFilterByDepth || filterKeyByDepth(key, opts.maxDepth)) && filterKeyByBase(key, base)
      );
    },
    // Utils
    async clear(base, opts = {}) {
      base = normalizeBaseKey(base);
      await Promise.all(
        getMounts(base, false).map(async (m) => {
          if (m.driver.clear) {
            return asyncCall(m.driver.clear, m.relativeBase, opts);
          }
          if (m.driver.removeItem) {
            const keys = await m.driver.getKeys(m.relativeBase || "", opts);
            return Promise.all(
              keys.map((key) => m.driver.removeItem(key, opts))
            );
          }
        })
      );
    },
    async dispose() {
      await Promise.all(
        Object.values(context.mounts).map((driver) => dispose(driver))
      );
    },
    async watch(callback) {
      await startWatch();
      context.watchListeners.push(callback);
      return async () => {
        context.watchListeners = context.watchListeners.filter(
          (listener) => listener !== callback
        );
        if (context.watchListeners.length === 0) {
          await stopWatch();
        }
      };
    },
    async unwatch() {
      context.watchListeners = [];
      await stopWatch();
    },
    // Mount
    mount(base, driver) {
      base = normalizeBaseKey(base);
      if (base && context.mounts[base]) {
        throw new Error(`already mounted at ${base}`);
      }
      if (base) {
        context.mountpoints.push(base);
        context.mountpoints.sort((a, b) => b.length - a.length);
      }
      context.mounts[base] = driver;
      if (context.watching) {
        Promise.resolve(watch(driver, onChange, base)).then((unwatcher) => {
          context.unwatch[base] = unwatcher;
        }).catch(console.error);
      }
      return storage;
    },
    async unmount(base, _dispose = true) {
      base = normalizeBaseKey(base);
      if (!base || !context.mounts[base]) {
        return;
      }
      if (context.watching && base in context.unwatch) {
        context.unwatch[base]?.();
        delete context.unwatch[base];
      }
      if (_dispose) {
        await dispose(context.mounts[base]);
      }
      context.mountpoints = context.mountpoints.filter((key) => key !== base);
      delete context.mounts[base];
    },
    getMount(key = "") {
      key = normalizeKey$1(key) + ":";
      const m = getMount(key);
      return {
        driver: m.driver,
        base: m.base
      };
    },
    getMounts(base = "", opts = {}) {
      base = normalizeKey$1(base);
      const mounts = getMounts(base, opts.parents);
      return mounts.map((m) => ({
        driver: m.driver,
        base: m.mountpoint
      }));
    },
    // Aliases
    keys: (base, opts = {}) => storage.getKeys(base, opts),
    get: (key, opts = {}) => storage.getItem(key, opts),
    set: (key, value, opts = {}) => storage.setItem(key, value, opts),
    has: (key, opts = {}) => storage.hasItem(key, opts),
    del: (key, opts = {}) => storage.removeItem(key, opts),
    remove: (key, opts = {}) => storage.removeItem(key, opts)
  };
  return storage;
}
function watch(driver, onChange, base) {
  return driver.watch ? driver.watch((event, key) => onChange(event, base + key)) : () => {
  };
}
async function dispose(driver) {
  if (typeof driver.dispose === "function") {
    await asyncCall(driver.dispose);
  }
}

const _assets = {

};

const normalizeKey = function normalizeKey(key) {
  if (!key) {
    return "";
  }
  return key.split("?")[0]?.replace(/[/\\]/g, ":").replace(/:+/g, ":").replace(/^:|:$/g, "") || "";
};

const assets$1 = {
  getKeys() {
    return Promise.resolve(Object.keys(_assets))
  },
  hasItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(id in _assets)
  },
  getItem (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].import() : null)
  },
  getMeta (id) {
    id = normalizeKey(id);
    return Promise.resolve(_assets[id] ? _assets[id].meta : {})
  }
};

function defineDriver(factory) {
  return factory;
}
function createError(driver, message, opts) {
  const err = new Error(`[unstorage] [${driver}] ${message}`, opts);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(err, createError);
  }
  return err;
}
function createRequiredError(driver, name) {
  if (Array.isArray(name)) {
    return createError(
      driver,
      `Missing some of the required options ${name.map((n) => "`" + n + "`").join(", ")}`
    );
  }
  return createError(driver, `Missing required option \`${name}\`.`);
}

function ignoreNotfound(err) {
  return err.code === "ENOENT" || err.code === "EISDIR" ? null : err;
}
function ignoreExists(err) {
  return err.code === "EEXIST" ? null : err;
}
async function writeFile(path, data, encoding) {
  await ensuredir(dirname$1(path));
  return promises.writeFile(path, data, encoding);
}
function readFile(path, encoding) {
  return promises.readFile(path, encoding).catch(ignoreNotfound);
}
function unlink(path) {
  return promises.unlink(path).catch(ignoreNotfound);
}
function readdir(dir) {
  return promises.readdir(dir, { withFileTypes: true }).catch(ignoreNotfound).then((r) => r || []);
}
async function ensuredir(dir) {
  if (existsSync(dir)) {
    return;
  }
  await ensuredir(dirname$1(dir)).catch(ignoreExists);
  await promises.mkdir(dir).catch(ignoreExists);
}
async function readdirRecursive(dir, ignore, maxDepth) {
  if (ignore && ignore(dir)) {
    return [];
  }
  const entries = await readdir(dir);
  const files = [];
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = resolve$1(dir, entry.name);
      if (entry.isDirectory()) {
        if (maxDepth === void 0 || maxDepth > 0) {
          const dirFiles = await readdirRecursive(
            entryPath,
            ignore,
            maxDepth === void 0 ? void 0 : maxDepth - 1
          );
          files.push(...dirFiles.map((f) => entry.name + "/" + f));
        }
      } else {
        if (!(ignore && ignore(entry.name))) {
          files.push(entry.name);
        }
      }
    })
  );
  return files;
}
async function rmRecursive(dir) {
  const entries = await readdir(dir);
  await Promise.all(
    entries.map((entry) => {
      const entryPath = resolve$1(dir, entry.name);
      if (entry.isDirectory()) {
        return rmRecursive(entryPath).then(() => promises.rmdir(entryPath));
      } else {
        return promises.unlink(entryPath);
      }
    })
  );
}

const PATH_TRAVERSE_RE = /\.\.:|\.\.$/;
const DRIVER_NAME = "fs-lite";
const unstorage_47drivers_47fs_45lite = defineDriver((opts = {}) => {
  if (!opts.base) {
    throw createRequiredError(DRIVER_NAME, "base");
  }
  opts.base = resolve$1(opts.base);
  const r = (key) => {
    if (PATH_TRAVERSE_RE.test(key)) {
      throw createError(
        DRIVER_NAME,
        `Invalid key: ${JSON.stringify(key)}. It should not contain .. segments`
      );
    }
    const resolved = join(opts.base, key.replace(/:/g, "/"));
    return resolved;
  };
  return {
    name: DRIVER_NAME,
    options: opts,
    flags: {
      maxDepth: true
    },
    hasItem(key) {
      return existsSync(r(key));
    },
    getItem(key) {
      return readFile(r(key), "utf8");
    },
    getItemRaw(key) {
      return readFile(r(key));
    },
    async getMeta(key) {
      const { atime, mtime, size, birthtime, ctime } = await promises.stat(r(key)).catch(() => ({}));
      return { atime, mtime, size, birthtime, ctime };
    },
    setItem(key, value) {
      if (opts.readOnly) {
        return;
      }
      return writeFile(r(key), value, "utf8");
    },
    setItemRaw(key, value) {
      if (opts.readOnly) {
        return;
      }
      return writeFile(r(key), value);
    },
    removeItem(key) {
      if (opts.readOnly) {
        return;
      }
      return unlink(r(key));
    },
    getKeys(_base, topts) {
      return readdirRecursive(r("."), opts.ignore, topts?.maxDepth);
    },
    async clear() {
      if (opts.readOnly || opts.noClear) {
        return;
      }
      await rmRecursive(r("."));
    }
  };
});

const storage = createStorage({});

storage.mount('/assets', assets$1);

storage.mount('data', unstorage_47drivers_47fs_45lite({"driver":"fsLite","base":"./.data/kv"}));

function useStorage(base = "") {
  return base ? prefixStorage(storage, base) : storage;
}

const e=globalThis.process?.getBuiltinModule?.("crypto")?.hash,r="sha256",s="base64url";function digest(t){if(e)return e(r,t,s);const o=createHash(r).update(t);return globalThis.process?.versions?.webcontainer?o.digest().toString(s):o.digest(s)}

const Hasher = /* @__PURE__ */ (() => {
  class Hasher2 {
    buff = "";
    #context = /* @__PURE__ */ new Map();
    write(str) {
      this.buff += str;
    }
    dispatch(value) {
      const type = value === null ? "null" : typeof value;
      return this[type](value);
    }
    object(object) {
      if (object && typeof object.toJSON === "function") {
        return this.object(object.toJSON());
      }
      const objString = Object.prototype.toString.call(object);
      let objType = "";
      const objectLength = objString.length;
      objType = objectLength < 10 ? "unknown:[" + objString + "]" : objString.slice(8, objectLength - 1);
      objType = objType.toLowerCase();
      let objectNumber = null;
      if ((objectNumber = this.#context.get(object)) === void 0) {
        this.#context.set(object, this.#context.size);
      } else {
        return this.dispatch("[CIRCULAR:" + objectNumber + "]");
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(object)) {
        this.write("buffer:");
        return this.write(object.toString("utf8"));
      }
      if (objType !== "object" && objType !== "function" && objType !== "asyncfunction") {
        if (this[objType]) {
          this[objType](object);
        } else {
          this.unknown(object, objType);
        }
      } else {
        const keys = Object.keys(object).sort();
        const extraKeys = [];
        this.write("object:" + (keys.length + extraKeys.length) + ":");
        const dispatchForKey = (key) => {
          this.dispatch(key);
          this.write(":");
          this.dispatch(object[key]);
          this.write(",");
        };
        for (const key of keys) {
          dispatchForKey(key);
        }
        for (const key of extraKeys) {
          dispatchForKey(key);
        }
      }
    }
    array(arr, unordered) {
      unordered = unordered === void 0 ? false : unordered;
      this.write("array:" + arr.length + ":");
      if (!unordered || arr.length <= 1) {
        for (const entry of arr) {
          this.dispatch(entry);
        }
        return;
      }
      const contextAdditions = /* @__PURE__ */ new Map();
      const entries = arr.map((entry) => {
        const hasher = new Hasher2();
        hasher.dispatch(entry);
        for (const [key, value] of hasher.#context) {
          contextAdditions.set(key, value);
        }
        return hasher.toString();
      });
      this.#context = contextAdditions;
      entries.sort();
      return this.array(entries, false);
    }
    date(date) {
      return this.write("date:" + date.toJSON());
    }
    symbol(sym) {
      return this.write("symbol:" + sym.toString());
    }
    unknown(value, type) {
      this.write(type);
      if (!value) {
        return;
      }
      this.write(":");
      if (value && typeof value.entries === "function") {
        return this.array(
          [...value.entries()],
          true
          /* ordered */
        );
      }
    }
    error(err) {
      return this.write("error:" + err.toString());
    }
    boolean(bool) {
      return this.write("bool:" + bool);
    }
    string(string) {
      this.write("string:" + string.length + ":");
      this.write(string);
    }
    function(fn) {
      this.write("fn:");
      if (isNativeFunction(fn)) {
        this.dispatch("[native]");
      } else {
        this.dispatch(fn.toString());
      }
    }
    number(number) {
      return this.write("number:" + number);
    }
    null() {
      return this.write("Null");
    }
    undefined() {
      return this.write("Undefined");
    }
    regexp(regex) {
      return this.write("regex:" + regex.toString());
    }
    arraybuffer(arr) {
      this.write("arraybuffer:");
      return this.dispatch(new Uint8Array(arr));
    }
    url(url) {
      return this.write("url:" + url.toString());
    }
    map(map) {
      this.write("map:");
      const arr = [...map];
      return this.array(arr, false);
    }
    set(set) {
      this.write("set:");
      const arr = [...set];
      return this.array(arr, false);
    }
    bigint(number) {
      return this.write("bigint:" + number.toString());
    }
  }
  for (const type of [
    "uint8array",
    "uint8clampedarray",
    "unt8array",
    "uint16array",
    "unt16array",
    "uint32array",
    "unt32array",
    "float32array",
    "float64array"
  ]) {
    Hasher2.prototype[type] = function(arr) {
      this.write(type + ":");
      return this.array([...arr], false);
    };
  }
  function isNativeFunction(f) {
    if (typeof f !== "function") {
      return false;
    }
    return Function.prototype.toString.call(f).slice(
      -15
      /* "[native code] }".length */
    ) === "[native code] }";
  }
  return Hasher2;
})();
function serialize(object) {
  const hasher = new Hasher();
  hasher.dispatch(object);
  return hasher.buff;
}
function hash(value) {
  return digest(typeof value === "string" ? value : serialize(value)).replace(/[-_]/g, "").slice(0, 10);
}

function defaultCacheOptions() {
  return {
    name: "_",
    base: "/cache",
    swr: true,
    maxAge: 1
  };
}
function defineCachedFunction(fn, opts = {}) {
  opts = { ...defaultCacheOptions(), ...opts };
  const pending = {};
  const group = opts.group || "nitro/functions";
  const name = opts.name || fn.name || "_";
  const integrity = opts.integrity || hash([fn, opts]);
  const validate = opts.validate || ((entry) => entry.value !== void 0);
  async function get(key, resolver, shouldInvalidateCache, event) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    let entry = await useStorage().getItem(cacheKey).catch((error) => {
      console.error(`[cache] Cache read error.`, error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }) || {};
    if (typeof entry !== "object") {
      entry = {};
      const error = new Error("Malformed data read from cache.");
      console.error("[cache]", error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }
    const ttl = (opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = shouldInvalidateCache || entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl || validate(entry) === false;
    const _resolve = async () => {
      const isPending = pending[key];
      if (!isPending) {
        if (entry.value !== void 0 && (opts.staleMaxAge || 0) >= 0 && opts.swr === false) {
          entry.value = void 0;
          entry.integrity = void 0;
          entry.mtime = void 0;
          entry.expires = void 0;
        }
        pending[key] = Promise.resolve(resolver());
      }
      try {
        entry.value = await pending[key];
      } catch (error) {
        if (!isPending) {
          delete pending[key];
        }
        throw error;
      }
      if (!isPending) {
        entry.mtime = Date.now();
        entry.integrity = integrity;
        delete pending[key];
        if (validate(entry) !== false) {
          let setOpts;
          if (opts.maxAge && !opts.swr) {
            setOpts = { ttl: opts.maxAge };
          }
          const promise = useStorage().setItem(cacheKey, entry, setOpts).catch((error) => {
            console.error(`[cache] Cache write error.`, error);
            useNitroApp().captureError(error, { event, tags: ["cache"] });
          });
          if (event?.waitUntil) {
            event.waitUntil(promise);
          }
        }
      }
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (entry.value === void 0) {
      await _resolvePromise;
    } else if (expired && event && event.waitUntil) {
      event.waitUntil(_resolvePromise);
    }
    if (opts.swr && validate(entry) !== false) {
      _resolvePromise.catch((error) => {
        console.error(`[cache] SWR handler error.`, error);
        useNitroApp().captureError(error, { event, tags: ["cache"] });
      });
      return entry;
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const shouldBypassCache = await opts.shouldBypassCache?.(...args);
    if (shouldBypassCache) {
      return fn(...args);
    }
    const key = await (opts.getKey || getKey)(...args);
    const shouldInvalidateCache = await opts.shouldInvalidateCache?.(...args);
    const entry = await get(
      key,
      () => fn(...args),
      shouldInvalidateCache,
      args[0] && isEvent(args[0]) ? args[0] : void 0
    );
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
function cachedFunction(fn, opts = {}) {
  return defineCachedFunction(fn, opts);
}
function getKey(...args) {
  return args.length > 0 ? hash(args) : "";
}
function escapeKey(key) {
  return String(key).replace(/\W/g, "");
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions()) {
  const variableHeaderNames = (opts.varies || []).filter(Boolean).map((h) => h.toLowerCase()).sort();
  const _opts = {
    ...opts,
    getKey: async (event) => {
      const customKey = await opts.getKey?.(event);
      if (customKey) {
        return escapeKey(customKey);
      }
      const _path = event.node.req.originalUrl || event.node.req.url || event.path;
      let _pathname;
      try {
        _pathname = escapeKey(decodeURI(parseURL(_path).pathname)).slice(0, 16) || "index";
      } catch {
        _pathname = "-";
      }
      const _hashedPath = `${_pathname}.${hash(_path)}`;
      const _headers = variableHeaderNames.map((header) => [header, event.node.req.headers[header]]).map(([name, value]) => `${escapeKey(name)}.${hash(value)}`);
      return [_hashedPath, ..._headers].join(":");
    },
    validate: (entry) => {
      if (!entry.value) {
        return false;
      }
      if (entry.value.code >= 400) {
        return false;
      }
      if (entry.value.body === void 0) {
        return false;
      }
      if (entry.value.headers.etag === "undefined" || entry.value.headers["last-modified"] === "undefined") {
        return false;
      }
      return true;
    },
    group: opts.group || "nitro/handlers",
    integrity: opts.integrity || hash([handler, opts])
  };
  const _cachedHandler = cachedFunction(
    async (incomingEvent) => {
      const variableHeaders = {};
      for (const header of variableHeaderNames) {
        const value = incomingEvent.node.req.headers[header];
        if (value !== void 0) {
          variableHeaders[header] = value;
        }
      }
      const reqProxy = cloneWithProxy(incomingEvent.node.req, {
        headers: variableHeaders
      });
      const resHeaders = {};
      let _resSendBody;
      const resProxy = cloneWithProxy(incomingEvent.node.res, {
        statusCode: 200,
        writableEnded: false,
        writableFinished: false,
        headersSent: false,
        closed: false,
        getHeader(name) {
          return resHeaders[name];
        },
        setHeader(name, value) {
          resHeaders[name] = value;
          return this;
        },
        getHeaderNames() {
          return Object.keys(resHeaders);
        },
        hasHeader(name) {
          return name in resHeaders;
        },
        removeHeader(name) {
          delete resHeaders[name];
        },
        getHeaders() {
          return resHeaders;
        },
        end(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2();
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return this;
        },
        write(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2(void 0);
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return true;
        },
        writeHead(statusCode, headers2) {
          this.statusCode = statusCode;
          if (headers2) {
            if (Array.isArray(headers2) || typeof headers2 === "string") {
              throw new TypeError("Raw headers  is not supported.");
            }
            for (const header in headers2) {
              const value = headers2[header];
              if (value !== void 0) {
                this.setHeader(
                  header,
                  value
                );
              }
            }
          }
          return this;
        }
      });
      const event = createEvent(reqProxy, resProxy);
      event.fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: useNitroApp().localFetch
      });
      event.$fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: globalThis.$fetch
      });
      event.waitUntil = incomingEvent.waitUntil;
      event.context = incomingEvent.context;
      event.context.cache = {
        options: _opts
      };
      const body = await handler(event) || _resSendBody;
      const headers = event.node.res.getHeaders();
      headers.etag = String(
        headers.Etag || headers.etag || `W/"${hash(body)}"`
      );
      headers["last-modified"] = String(
        headers["Last-Modified"] || headers["last-modified"] || (/* @__PURE__ */ new Date()).toUTCString()
      );
      const cacheControl = [];
      if (opts.swr) {
        if (opts.maxAge) {
          cacheControl.push(`s-maxage=${opts.maxAge}`);
        }
        if (opts.staleMaxAge) {
          cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
        } else {
          cacheControl.push("stale-while-revalidate");
        }
      } else if (opts.maxAge) {
        cacheControl.push(`max-age=${opts.maxAge}`);
      }
      if (cacheControl.length > 0) {
        headers["cache-control"] = cacheControl.join(", ");
      }
      const cacheEntry = {
        code: event.node.res.statusCode,
        headers,
        body
      };
      return cacheEntry;
    },
    _opts
  );
  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return;
      }
      return handler(event);
    }
    const response = await _cachedHandler(
      event
    );
    if (event.node.res.headersSent || event.node.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["last-modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.node.res.statusCode = response.code;
    for (const name in response.headers) {
      const value = response.headers[name];
      if (name === "set-cookie") {
        event.node.res.appendHeader(
          name,
          splitCookiesString(value)
        );
      } else {
        if (value !== void 0) {
          event.node.res.setHeader(name, value);
        }
      }
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

function klona(x) {
	if (typeof x !== 'object') return x;

	var k, tmp, str=Object.prototype.toString.call(x);

	if (str === '[object Object]') {
		if (x.constructor !== Object && typeof x.constructor === 'function') {
			tmp = new x.constructor();
			for (k in x) {
				if (x.hasOwnProperty(k) && tmp[k] !== x[k]) {
					tmp[k] = klona(x[k]);
				}
			}
		} else {
			tmp = {}; // null
			for (k in x) {
				if (k === '__proto__') {
					Object.defineProperty(tmp, k, {
						value: klona(x[k]),
						configurable: true,
						enumerable: true,
						writable: true,
					});
				} else {
					tmp[k] = klona(x[k]);
				}
			}
		}
		return tmp;
	}

	if (str === '[object Array]') {
		k = x.length;
		for (tmp=Array(k); k--;) {
			tmp[k] = klona(x[k]);
		}
		return tmp;
	}

	if (str === '[object Set]') {
		tmp = new Set;
		x.forEach(function (val) {
			tmp.add(klona(val));
		});
		return tmp;
	}

	if (str === '[object Map]') {
		tmp = new Map;
		x.forEach(function (val, key) {
			tmp.set(klona(key), klona(val));
		});
		return tmp;
	}

	if (str === '[object Date]') {
		return new Date(+x);
	}

	if (str === '[object RegExp]') {
		tmp = new RegExp(x.source, x.flags);
		tmp.lastIndex = x.lastIndex;
		return tmp;
	}

	if (str === '[object DataView]') {
		return new x.constructor( klona(x.buffer) );
	}

	if (str === '[object ArrayBuffer]') {
		return x.slice(0);
	}

	// ArrayBuffer.isView(x)
	// ~> `new` bcuz `Buffer.slice` => ref
	if (str.slice(-6) === 'Array]') {
		return new x.constructor(x);
	}

	return x;
}

const inlineAppConfig = {};



const appConfig$1 = defuFn(inlineAppConfig);

const NUMBER_CHAR_RE = /\d/;
const STR_SPLITTERS = ["-", "_", "/", "."];
function isUppercase(char = "") {
  if (NUMBER_CHAR_RE.test(char)) {
    return void 0;
  }
  return char !== char.toLowerCase();
}
function splitByCase(str, separators) {
  const splitters = STR_SPLITTERS;
  const parts = [];
  if (!str || typeof str !== "string") {
    return parts;
  }
  let buff = "";
  let previousUpper;
  let previousSplitter;
  for (const char of str) {
    const isSplitter = splitters.includes(char);
    if (isSplitter === true) {
      parts.push(buff);
      buff = "";
      previousUpper = void 0;
      continue;
    }
    const isUpper = isUppercase(char);
    if (previousSplitter === false) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buff);
        buff = char;
        previousUpper = isUpper;
        continue;
      }
      if (previousUpper === true && isUpper === false && buff.length > 1) {
        const lastChar = buff.at(-1);
        parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
        buff = lastChar + char;
        previousUpper = isUpper;
        continue;
      }
    }
    buff += char;
    previousUpper = isUpper;
    previousSplitter = isSplitter;
  }
  parts.push(buff);
  return parts;
}
function kebabCase(str, joiner) {
  return str ? (Array.isArray(str) ? str : splitByCase(str)).map((p) => p.toLowerCase()).join(joiner) : "";
}
function snakeCase(str) {
  return kebabCase(str || "", "_");
}

function getEnv(key, opts) {
  const envKey = snakeCase(key).toUpperCase();
  return destr(
    process.env[opts.prefix + envKey] ?? process.env[opts.altPrefix + envKey]
  );
}
function _isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function applyEnv(obj, opts, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey, opts);
    if (_isObject(obj[key])) {
      if (_isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
        applyEnv(obj[key], opts, subKey);
      } else if (envValue === void 0) {
        applyEnv(obj[key], opts, subKey);
      } else {
        obj[key] = envValue ?? obj[key];
      }
    } else {
      obj[key] = envValue ?? obj[key];
    }
    if (opts.envExpansion && typeof obj[key] === "string") {
      obj[key] = _expandFromEnv(obj[key]);
    }
  }
  return obj;
}
const envExpandRx = /\{\{([^{}]*)\}\}/g;
function _expandFromEnv(value) {
  return value.replace(envExpandRx, (match, key) => {
    return process.env[key] || match;
  });
}

const _inlineRuntimeConfig = {
  "app": {
    "baseURL": "/"
  },
  "nitro": {
    "routeRules": {}
  }
};
const envOptions = {
  prefix: "NITRO_",
  altPrefix: _inlineRuntimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_",
  envExpansion: _inlineRuntimeConfig.nitro.envExpansion ?? process.env.NITRO_ENV_EXPANSION ?? false
};
const _sharedRuntimeConfig = _deepFreeze(
  applyEnv(klona(_inlineRuntimeConfig), envOptions)
);
function useRuntimeConfig(event) {
  {
    return _sharedRuntimeConfig;
  }
}
_deepFreeze(klona(appConfig$1));
function _deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      _deepFreeze(value);
    }
  }
  return Object.freeze(object);
}
new Proxy(/* @__PURE__ */ Object.create(null), {
  get: (_, prop) => {
    console.warn(
      "Please use `useRuntimeConfig()` instead of accessing config directly."
    );
    const runtimeConfig = useRuntimeConfig();
    if (prop in runtimeConfig) {
      return runtimeConfig[prop];
    }
    return void 0;
  }
});

function createContext(opts = {}) {
  let currentInstance;
  let isSingleton = false;
  const checkConflict = (instance) => {
    if (currentInstance && currentInstance !== instance) {
      throw new Error("Context conflict");
    }
  };
  let als;
  if (opts.asyncContext) {
    const _AsyncLocalStorage = opts.AsyncLocalStorage || globalThis.AsyncLocalStorage;
    if (_AsyncLocalStorage) {
      als = new _AsyncLocalStorage();
    } else {
      console.warn("[unctx] `AsyncLocalStorage` is not provided.");
    }
  }
  const _getCurrentInstance = () => {
    if (als) {
      const instance = als.getStore();
      if (instance !== void 0) {
        return instance;
      }
    }
    return currentInstance;
  };
  return {
    use: () => {
      const _instance = _getCurrentInstance();
      if (_instance === void 0) {
        throw new Error("Context is not available");
      }
      return _instance;
    },
    tryUse: () => {
      return _getCurrentInstance();
    },
    set: (instance, replace) => {
      if (!replace) {
        checkConflict(instance);
      }
      currentInstance = instance;
      isSingleton = true;
    },
    unset: () => {
      currentInstance = void 0;
      isSingleton = false;
    },
    call: (instance, callback) => {
      checkConflict(instance);
      currentInstance = instance;
      try {
        return als ? als.run(instance, callback) : callback();
      } finally {
        if (!isSingleton) {
          currentInstance = void 0;
        }
      }
    },
    async callAsync(instance, callback) {
      currentInstance = instance;
      const onRestore = () => {
        currentInstance = instance;
      };
      const onLeave = () => currentInstance === instance ? onRestore : void 0;
      asyncHandlers.add(onLeave);
      try {
        const r = als ? als.run(instance, callback) : callback();
        if (!isSingleton) {
          currentInstance = void 0;
        }
        return await r;
      } finally {
        asyncHandlers.delete(onLeave);
      }
    }
  };
}
function createNamespace(defaultOpts = {}) {
  const contexts = {};
  return {
    get(key, opts = {}) {
      if (!contexts[key]) {
        contexts[key] = createContext({ ...defaultOpts, ...opts });
      }
      return contexts[key];
    }
  };
}
const _globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof global !== "undefined" ? global : {};
const globalKey = "__unctx__";
const defaultNamespace = _globalThis[globalKey] || (_globalThis[globalKey] = createNamespace());
const getContext = (key, opts = {}) => defaultNamespace.get(key, opts);
const asyncHandlersKey = "__unctx_async_handlers__";
const asyncHandlers = _globalThis[asyncHandlersKey] || (_globalThis[asyncHandlersKey] = /* @__PURE__ */ new Set());

const nitroAsyncContext = getContext("nitro-app", {
  asyncContext: true,
  AsyncLocalStorage: AsyncLocalStorage 
});

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(
  createRouter$1({ routes: config.nitro.routeRules })
);
function createRouteRulesHandler(ctx) {
  return eventHandler((event) => {
    const routeRules = getRouteRules(event);
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
    }
    if (routeRules.redirect) {
      let target = routeRules.redirect.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.redirect._redirectStripBase;
        if (strpBase) {
          targetPath = withoutBase(targetPath, strpBase);
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return sendRedirect(event, target, routeRules.redirect.statusCode);
    }
    if (routeRules.proxy) {
      let target = routeRules.proxy.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.proxy._proxyStripBase;
        if (strpBase) {
          targetPath = withoutBase(targetPath, strpBase);
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return proxyRequest(event, target, {
        fetch: ctx.localFetch,
        ...routeRules.proxy
      });
    }
  });
}
function getRouteRules(event) {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    event.context._nitro.routeRules = getRouteRulesForPath(
      withoutBase(event.path.split("?")[0], useRuntimeConfig().app.baseURL)
    );
  }
  return event.context._nitro.routeRules;
}
function getRouteRulesForPath(path) {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}

function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError(error, { tags: [type] });
}
function trapUnhandledNodeErrors() {
  process.on(
    "unhandledRejection",
    (error) => _captureError(error, "unhandledRejection")
  );
  process.on(
    "uncaughtException",
    (error) => _captureError(error, "uncaughtException")
  );
}
function joinHeaders(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
function normalizeFetchResponse(response) {
  if (!response.headers.has("set-cookie")) {
    return response;
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeCookieHeaders(response.headers)
  });
}
function normalizeCookieHeader(header = "") {
  return splitCookiesString(joinHeaders(header));
}
function normalizeCookieHeaders(headers) {
  const outgoingHeaders = new Headers();
  for (const [name, header] of headers) {
    if (name === "set-cookie") {
      for (const cookie of normalizeCookieHeader(header)) {
        outgoingHeaders.append("set-cookie", cookie);
      }
    } else {
      outgoingHeaders.set(name, joinHeaders(header));
    }
  }
  return outgoingHeaders;
}

function defineNitroErrorHandler(handler) {
  return handler;
}

const errorHandler$0 = defineNitroErrorHandler(
  function defaultNitroErrorHandler(error, event) {
    const res = defaultHandler(error, event);
    setResponseHeaders(event, res.headers);
    setResponseStatus(event, res.status, res.statusText);
    return send(event, JSON.stringify(res.body, null, 2));
  }
);
function defaultHandler(error, event, opts) {
  const isSensitive = error.unhandled || error.fatal;
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage || "Server Error";
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true });
  if (statusCode === 404) {
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      const redirectTo = `${baseURL}${url.pathname.slice(1)}${url.search}`;
      return {
        status: 302,
        statusText: "Found",
        headers: { location: redirectTo },
        body: `Redirecting...`
      };
    }
  }
  if (isSensitive && !opts?.silent) {
    const tags = [error.unhandled && "[unhandled]", error.fatal && "[fatal]"].filter(Boolean).join(" ");
    console.error(`[request error] ${tags} [${event.method}] ${url}
`, error);
  }
  const headers = {
    "content-type": "application/json",
    // Prevent browser from guessing the MIME types of resources.
    "x-content-type-options": "nosniff",
    // Prevent error page from being embedded in an iframe
    "x-frame-options": "DENY",
    // Prevent browsers from sending the Referer header
    "referrer-policy": "no-referrer",
    // Disable the execution of any js
    "content-security-policy": "script-src 'none'; frame-ancestors 'none';"
  };
  setResponseStatus(event, statusCode, statusMessage);
  if (statusCode === 404 || !getResponseHeader(event, "cache-control")) {
    headers["cache-control"] = "no-cache";
  }
  const body = {
    error: true,
    url: url.href,
    statusCode,
    statusMessage,
    message: isSensitive ? "Server Error" : error.message,
    data: isSensitive ? void 0 : error.data
  };
  return {
    status: statusCode,
    statusText: statusMessage,
    headers,
    body
  };
}

const errorHandlers = [errorHandler$0];

async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      await handler(error, event, { defaultHandler });
      if (event.handled) {
        return; // Response handled
      }
    } catch(error) {
      // Handler itself thrown, log and continue
      console.error(error);
    }
  }
  // H3 will handle fallback
}

const appConfig = {"name":"vinxi","routers":[{"name":"public","type":"static","dir":"./public","base":"/","root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web","order":0,"outDir":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/.vinxi/build/public"},{"name":"client","type":"client","target":"browser","handler":"app/client.tsx","base":"/_build","build":{"sourcemap":true},"root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web","outDir":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/.vinxi/build/client","order":1},{"name":"ssr","type":"http","target":"server","handler":"app/ssr.tsx","link":{"client":"client"},"root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web","base":"/","outDir":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/.vinxi/build/ssr","order":2},{"name":"server","type":"http","target":"server","base":"/_server","handler":"../../node_modules/.bun/@tanstack+start-server-functions-handler@1.120.19/node_modules/@tanstack/start-server-functions-handler/dist/esm/index.js","root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web","outDir":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/.vinxi/build/server","order":3},{"name":"api","base":"/api","type":"http","handler":"app/api.ts","target":"server","root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web","outDir":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/.vinxi/build/api","order":4}],"server":{"rollupConfig":{},"preset":"node-server","experimental":{"asyncContext":true}},"root":"/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web"};
				const buildManifest = {"client":{"_StateDisplay-DZF_2AmC.js":{"file":"assets/StateDisplay-DZF_2AmC.js","name":"StateDisplay","imports":["_client-BtEB09H5.js"]},"_client-BtEB09H5.js":{"file":"assets/client-BtEB09H5.js","name":"client","dynamicImports":["app/routes/portfolio.tsx?tsr-split=component","app/routes/login.tsx?tsr-split=component","app/routes/index.tsx?tsr-split=component","app/routes/domain/$domain.tsx?tsr-split=component"],"css":["assets/client.css"]},"_client.css":{"file":"assets/client.css","src":"_client.css"},"_index-C9K5BSm1.js":{"file":"assets/index-C9K5BSm1.js","name":"index","imports":["_client-BtEB09H5.js"]},"app/routes/domain/$domain.tsx?tsr-split=component":{"file":"assets/_domain-3g4THw3K.js","name":"_domain","src":"app/routes/domain/$domain.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_client-BtEB09H5.js","_StateDisplay-DZF_2AmC.js","_index-C9K5BSm1.js"]},"app/routes/index.tsx?tsr-split=component":{"file":"assets/index-CIMG3FnP.js","name":"index","src":"app/routes/index.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_client-BtEB09H5.js","_index-C9K5BSm1.js"]},"app/routes/login.tsx?tsr-split=component":{"file":"assets/login-CvZXTVs6.js","name":"login","src":"app/routes/login.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_client-BtEB09H5.js"]},"app/routes/portfolio.tsx?tsr-split=component":{"file":"assets/portfolio-suyHj5VQ.js","name":"portfolio","src":"app/routes/portfolio.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_client-BtEB09H5.js","_StateDisplay-DZF_2AmC.js"]},"virtual:$vinxi/handler/client":{"file":"assets/client-d7wXsaxM.js","name":"client","src":"virtual:$vinxi/handler/client","isEntry":true,"imports":["_client-BtEB09H5.js"]}},"ssr":{"_StateDisplay-DMFHryPA.js":{"file":"assets/StateDisplay-DMFHryPA.js","name":"StateDisplay"},"_index-XVNoRTPO.js":{"file":"assets/index-XVNoRTPO.js","name":"index","imports":["_ssr-n6P6cpG-.js"]},"_ssr-n6P6cpG-.js":{"file":"assets/ssr-n6P6cpG-.js","name":"ssr","dynamicImports":["app/routes/portfolio.tsx?tsr-split=component","app/routes/login.tsx?tsr-split=component","app/routes/index.tsx?tsr-split=component","app/routes/domain/$domain.tsx?tsr-split=component"],"css":["assets/ssr.css"]},"_ssr.css":{"file":"assets/ssr.css","src":"_ssr.css"},"app/routes/domain/$domain.tsx?tsr-split=component":{"file":"assets/_domain-DJPc2vNI.js","name":"_domain","src":"app/routes/domain/$domain.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_StateDisplay-DMFHryPA.js","_index-XVNoRTPO.js","_ssr-n6P6cpG-.js"]},"app/routes/index.tsx?tsr-split=component":{"file":"assets/index-CkDK1VJT.js","name":"index","src":"app/routes/index.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_index-XVNoRTPO.js","_ssr-n6P6cpG-.js"]},"app/routes/login.tsx?tsr-split=component":{"file":"assets/login-CJz8182m.js","name":"login","src":"app/routes/login.tsx?tsr-split=component","isDynamicEntry":true},"app/routes/portfolio.tsx?tsr-split=component":{"file":"assets/portfolio-DibpN4rR.js","name":"portfolio","src":"app/routes/portfolio.tsx?tsr-split=component","isDynamicEntry":true,"imports":["_StateDisplay-DMFHryPA.js"]},"virtual:$vinxi/handler/ssr":{"file":"ssr.js","name":"ssr","src":"virtual:$vinxi/handler/ssr","isEntry":true,"imports":["_ssr-n6P6cpG-.js"]}},"server":{"virtual:$vinxi/handler/server":{"file":"server.js","name":"server","src":"virtual:$vinxi/handler/server","isEntry":true}},"api":{"../../packages/db/dist/index.js":{"file":"assets/index-BHdYYgJK.js","name":"index","src":"../../packages/db/dist/index.js","isDynamicEntry":true,"imports":["_api-lQSrnIfP.js"]},"_api-lQSrnIfP.js":{"file":"assets/api-lQSrnIfP.js","name":"api","dynamicImports":["../../packages/db/dist/index.js"]},"virtual:$vinxi/handler/api":{"file":"api.js","name":"api","src":"virtual:$vinxi/handler/api","isEntry":true,"imports":["_api-lQSrnIfP.js"]}}};

				const routeManifest = {"api":{}};

        function createProdApp(appConfig) {
          return {
            config: { ...appConfig, buildManifest, routeManifest },
            getRouter(name) {
              return appConfig.routers.find(router => router.name === name)
            }
          }
        }

        function plugin$2(app) {
          const prodApp = createProdApp(appConfig);
          globalThis.app = prodApp;
        }

function plugin$1(app) {
	globalThis.$handle = (event) => app.h3App.handler(event);
}

/**
 * Traverses the module graph and collects assets for a given chunk
 *
 * @param {any} manifest Client manifest
 * @param {string} id Chunk id
 * @param {Map<string, string[]>} assetMap Cache of assets
 * @param {string[]} stack Stack of chunk ids to prevent circular dependencies
 * @returns Array of asset URLs
 */
function findAssetsInViteManifest(manifest, id, assetMap = new Map(), stack = []) {
	if (stack.includes(id)) {
		return [];
	}

	const cached = assetMap.get(id);
	if (cached) {
		return cached;
	}
	const chunk = manifest[id];
	if (!chunk) {
		return [];
	}

	const assets = [
		...(chunk.assets?.filter(Boolean) || []),
		...(chunk.css?.filter(Boolean) || [])
	];
	if (chunk.imports) {
		stack.push(id);
		for (let i = 0, l = chunk.imports.length; i < l; i++) {
			assets.push(...findAssetsInViteManifest(manifest, chunk.imports[i], assetMap, stack));
		}
		stack.pop();
	}
	assets.push(chunk.file);
	const all = Array.from(new Set(assets));
	assetMap.set(id, all);

	return all;
}

/** @typedef {import("../app.js").App & { config: { buildManifest: { [key:string]: any } }}} ProdApp */

function createHtmlTagsForAssets(router, app, assets) {
	return assets
		.filter(
			(asset) =>
				asset.endsWith(".css") ||
				asset.endsWith(".js") ||
				asset.endsWith(".mjs"),
		)
		.map((asset) => ({
			tag: "link",
			attrs: {
				href: joinURL(app.config.server.baseURL ?? "/", router.base, asset),
				key: join$1(app.config.server.baseURL ?? "", router.base, asset),
				...(asset.endsWith(".css")
					? { rel: "stylesheet", fetchPriority: "high" }
					: { rel: "modulepreload" }),
			},
		}));
}

/**
 *
 * @param {ProdApp} app
 * @returns
 */
function createProdManifest(app) {
	const manifest = new Proxy(
		{},
		{
			get(target, routerName) {
				invariant(typeof routerName === "string", "Bundler name expected");
				const router = app.getRouter(routerName);
				const bundlerManifest = app.config.buildManifest[routerName];

				invariant(
					router.type !== "static",
					"manifest not available for static router",
				);
				return {
					handler: router.handler,
					async assets() {
						/** @type {{ [key: string]: string[] }} */
						let assets = {};
						assets[router.handler] = await this.inputs[router.handler].assets();
						for (const route of (await router.internals.routes?.getRoutes()) ??
							[]) {
							assets[route.filePath] = await this.inputs[
								route.filePath
							].assets();
						}
						return assets;
					},
					async routes() {
						return (await router.internals.routes?.getRoutes()) ?? [];
					},
					async json() {
						/** @type {{ [key: string]: { output: string; assets: string[]} }} */
						let json = {};
						for (const input of Object.keys(this.inputs)) {
							json[input] = {
								output: this.inputs[input].output.path,
								assets: await this.inputs[input].assets(),
							};
						}
						return json;
					},
					chunks: new Proxy(
						{},
						{
							get(target, chunk) {
								invariant(typeof chunk === "string", "Chunk expected");
								const chunkPath = join$1(
									router.outDir,
									router.base,
									chunk + ".mjs",
								);
								return {
									import() {
										if (globalThis.$$chunks[chunk + ".mjs"]) {
											return globalThis.$$chunks[chunk + ".mjs"];
										}
										return import(
											/* @vite-ignore */ pathToFileURL(chunkPath).href
										);
									},
									output: {
										path: chunkPath,
									},
								};
							},
						},
					),
					inputs: new Proxy(
						{},
						{
							ownKeys(target) {
								const keys = Object.keys(bundlerManifest)
									.filter((id) => bundlerManifest[id].isEntry)
									.map((id) => id);
								return keys;
							},
							getOwnPropertyDescriptor(k) {
								return {
									enumerable: true,
									configurable: true,
								};
							},
							get(target, input) {
								invariant(typeof input === "string", "Input expected");
								if (router.target === "server") {
									const id =
										input === router.handler
											? virtualId(handlerModule(router))
											: input;
									return {
										assets() {
											return createHtmlTagsForAssets(
												router,
												app,
												findAssetsInViteManifest(bundlerManifest, id),
											);
										},
										output: {
											path: join$1(
												router.outDir,
												router.base,
												bundlerManifest[id].file,
											),
										},
									};
								} else if (router.target === "browser") {
									const id =
										input === router.handler && !input.endsWith(".html")
											? virtualId(handlerModule(router))
											: input;
									return {
										import() {
											return import(
												/* @vite-ignore */ joinURL(
													app.config.server.baseURL ?? "",
													router.base,
													bundlerManifest[id].file,
												)
											);
										},
										assets() {
											return createHtmlTagsForAssets(
												router,
												app,
												findAssetsInViteManifest(bundlerManifest, id),
											);
										},
										output: {
											path: joinURL(
												app.config.server.baseURL ?? "",
												router.base,
												bundlerManifest[id].file,
											),
										},
									};
								}
							},
						},
					),
				};
			},
		},
	);

	return manifest;
}

function plugin() {
	globalThis.MANIFEST =
		createProdManifest(globalThis.app)
			;
}

const chunks = {};
			 




			 function app() {
				 globalThis.$$chunks = chunks;
			 }

const plugins = [
  plugin$2,
plugin$1,
plugin,
app
];

const assets = {
  "/_build/assets/StateDisplay-DZF_2AmC.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"3f21-ntbT8pX4rWB6SAg/0f9/lhu9pNQ\"",
    "mtime": "2026-05-04T16:23:39.770Z",
    "size": 16161,
    "path": "../public/_build/assets/StateDisplay-DZF_2AmC.js"
  },
  "/_build/assets/_domain-3g4THw3K.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"1686d-0FYxHf9p7zRDoGcu7w5mw7C8ouk\"",
    "mtime": "2026-05-04T16:23:39.771Z",
    "size": 92269,
    "path": "../public/_build/assets/_domain-3g4THw3K.js"
  },
  "/_build/assets/client-BtEB09H5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"3ceb6-mLR75R67gCqDrJINmovwts/iZoI\"",
    "mtime": "2026-05-04T16:23:39.774Z",
    "size": 249526,
    "path": "../public/_build/assets/client-BtEB09H5.js"
  },
  "/_build/assets/client-d7wXsaxM.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"3f-IQuoEDQx8Nf/nfwNfM19xaxSS0I\"",
    "mtime": "2026-05-04T16:23:39.772Z",
    "size": 63,
    "path": "../public/_build/assets/client-d7wXsaxM.js"
  },
  "/_build/assets/client.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"7396-DFEgGkaEkYkiAjH5pAr4xAGfAH8\"",
    "mtime": "2026-05-04T16:23:39.772Z",
    "size": 29590,
    "path": "../public/_build/assets/client.css"
  },
  "/_build/assets/index-C9K5BSm1.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"1507-iQV4YkM26svL3OccYgIs0stq0fw\"",
    "mtime": "2026-05-04T16:23:39.772Z",
    "size": 5383,
    "path": "../public/_build/assets/index-C9K5BSm1.js"
  },
  "/_build/assets/login-CvZXTVs6.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"b7d-ZQBryZRWcWzPo8RXjP15xzIlgLU\"",
    "mtime": "2026-05-04T16:23:39.774Z",
    "size": 2941,
    "path": "../public/_build/assets/login-CvZXTVs6.js"
  },
  "/_build/assets/portfolio-suyHj5VQ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"13476-kQNYaJ9yXtNisTgufBVq42WERpI\"",
    "mtime": "2026-05-04T16:23:39.775Z",
    "size": 78966,
    "path": "../public/_build/assets/portfolio-suyHj5VQ.js"
  },
  "/_build/.vite/manifest.json": {
    "type": "application/json",
    "etag": "\"867-0vkVPBgIMYkguhmqy7qpZLIqam8\"",
    "mtime": "2026-05-04T16:23:39.769Z",
    "size": 2151,
    "path": "../public/_build/.vite/manifest.json"
  },
  "/_build/assets/index-CIMG3FnP.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": "\"1da7-Xt9qEFeE4lXXsfUD2UEoE0ilkrs\"",
    "mtime": "2026-05-04T16:23:39.772Z",
    "size": 7591,
    "path": "../public/_build/assets/index-CIMG3FnP.js"
  },
  "/assets/ssr.css": {
    "type": "text/css; charset=utf-8",
    "etag": "\"7396-DFEgGkaEkYkiAjH5pAr4xAGfAH8\"",
    "mtime": "2026-05-04T16:23:39.787Z",
    "size": 29590,
    "path": "../public/assets/ssr.css"
  }
};

const _DRIVE_LETTER_START_RE = /^[A-Za-z]:\//;
function normalizeWindowsPath(input = "") {
  if (!input) {
    return input;
  }
  return input.replace(/\\/g, "/").replace(_DRIVE_LETTER_START_RE, (r) => r.toUpperCase());
}
const _IS_ABSOLUTE_RE = /^[/\\](?![/\\])|^[/\\]{2}(?!\.)|^[A-Za-z]:[/\\]/;
const _DRIVE_LETTER_RE = /^[A-Za-z]:$/;
function cwd() {
  if (typeof process !== "undefined" && typeof process.cwd === "function") {
    return process.cwd().replace(/\\/g, "/");
  }
  return "/";
}
const resolve = function(...arguments_) {
  arguments_ = arguments_.map((argument) => normalizeWindowsPath(argument));
  let resolvedPath = "";
  let resolvedAbsolute = false;
  for (let index = arguments_.length - 1; index >= -1 && !resolvedAbsolute; index--) {
    const path = index >= 0 ? arguments_[index] : cwd();
    if (!path || path.length === 0) {
      continue;
    }
    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = isAbsolute(path);
  }
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
  if (resolvedAbsolute && !isAbsolute(resolvedPath)) {
    return `/${resolvedPath}`;
  }
  return resolvedPath.length > 0 ? resolvedPath : ".";
};
function normalizeString(path, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let char = null;
  for (let index = 0; index <= path.length; ++index) {
    if (index < path.length) {
      char = path[index];
    } else if (char === "/") {
      break;
    } else {
      char = "/";
    }
    if (char === "/") {
      if (lastSlash === index - 1 || dots === 1) ; else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res[res.length - 1] !== "." || res[res.length - 2] !== ".") {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
            }
            lastSlash = index;
            dots = 0;
            continue;
          } else if (res.length > 0) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = index;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? "/.." : "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += `/${path.slice(lastSlash + 1, index)}`;
        } else {
          res = path.slice(lastSlash + 1, index);
        }
        lastSegmentLength = index - lastSlash - 1;
      }
      lastSlash = index;
      dots = 0;
    } else if (char === "." && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
const isAbsolute = function(p) {
  return _IS_ABSOLUTE_RE.test(p);
};
const dirname = function(p) {
  const segments = normalizeWindowsPath(p).replace(/\/$/, "").split("/").slice(0, -1);
  if (segments.length === 1 && _DRIVE_LETTER_RE.test(segments[0])) {
    segments[0] += "/";
  }
  return segments.join("/") || (isAbsolute(p) ? "/" : ".");
};

function readAsset (id) {
  const serverDir = dirname(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve(serverDir, assets[id].path))
}

const publicAssetBases = {};

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = { gzip: ".gz", br: ".br" };
const _MTmOo_ = eventHandler((event) => {
  if (event.method && !METHODS.has(event.method)) {
    return;
  }
  let id = decodePath(
    withLeadingSlash(withoutTrailingSlash(parseURL(event.path).pathname))
  );
  let asset;
  const encodingHeader = String(
    getRequestHeader(event, "accept-encoding") || ""
  );
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    ""
  ];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      removeResponseHeader(event, "Cache-Control");
      throw createError$1({ statusCode: 404 });
    }
    return;
  }
  if (asset.encoding !== void 0) {
    appendResponseHeader(event, "Vary", "Accept-Encoding");
  }
  const ifNotMatch = getRequestHeader(event, "if-none-match") === asset.etag;
  if (ifNotMatch) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  const ifModifiedSinceH = getRequestHeader(event, "if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  if (asset.type && !getResponseHeader(event, "Content-Type")) {
    setResponseHeader(event, "Content-Type", asset.type);
  }
  if (asset.etag && !getResponseHeader(event, "ETag")) {
    setResponseHeader(event, "ETag", asset.etag);
  }
  if (asset.mtime && !getResponseHeader(event, "Last-Modified")) {
    setResponseHeader(event, "Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !getResponseHeader(event, "Content-Encoding")) {
    setResponseHeader(event, "Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !getResponseHeader(event, "Content-Length")) {
    setResponseHeader(event, "Content-Length", asset.size);
  }
  return readAsset(id);
});

var B = "Invariant failed";
function K$2(e, n) {
  if (!e) throw new Error(B);
}
const l = { stringify: (e) => JSON.stringify(e, function(t, r) {
  const o = this[t], a = v.find((s) => s.stringifyCondition(o));
  return a ? a.stringify(o) : r;
}), parse: (e) => JSON.parse(e, function(t, r) {
  const o = this[t];
  if (isPlainObject$1(o)) {
    const a = v.find((s) => s.parseCondition(o));
    if (a) return a.parse(o);
  }
  return r;
}), encode: (e) => {
  if (Array.isArray(e)) return e.map((t) => l.encode(t));
  if (isPlainObject$1(e)) return Object.fromEntries(Object.entries(e).map(([t, r]) => [t, l.encode(r)]));
  const n = v.find((t) => t.stringifyCondition(e));
  return n ? n.stringify(e) : e;
}, decode: (e) => {
  if (isPlainObject$1(e)) {
    const n = v.find((t) => t.parseCondition(e));
    if (n) return n.parse(e);
  }
  return Array.isArray(e) ? e.map((n) => l.decode(n)) : isPlainObject$1(e) ? Object.fromEntries(Object.entries(e).map(([n, t]) => [n, l.decode(t)])) : e;
} }, g = (e, n, t, r) => ({ key: e, stringifyCondition: n, stringify: (o) => ({ [`$${e}`]: t(o) }), parseCondition: (o) => Object.hasOwn(o, `$${e}`), parse: (o) => r(o[`$${e}`]) }), v = [g("undefined", (e) => e === void 0, () => 0, () => {
}), g("date", (e) => e instanceof Date, (e) => e.toISOString(), (e) => new Date(e)), g("error", (e) => e instanceof Error, (e) => ({ ...e, message: e.message, stack: void 0, cause: e.cause }), (e) => Object.assign(new Error(e.message), e)), g("formData", (e) => e instanceof FormData, (e) => {
  const n = {};
  return e.forEach((t, r) => {
    const o = n[r];
    o !== void 0 ? Array.isArray(o) ? o.push(t) : n[r] = [o, t] : n[r] = t;
  }), n;
}, (e) => {
  const n = new FormData();
  return Object.entries(e).forEach(([t, r]) => {
    Array.isArray(r) ? r.forEach((o) => n.append(t, o)) : n.append(t, r);
  }), n;
}), g("bigint", (e) => typeof e == "bigint", (e) => e.toString(), (e) => BigInt(e))];
function V(e = {}) {
  let n, t = false;
  const r = (s) => {
    if (n && n !== s) throw new Error("Context conflict");
  };
  let o;
  if (e.asyncContext) {
    const s = e.AsyncLocalStorage || globalThis.AsyncLocalStorage;
    s ? o = new s() : console.warn("[unctx] `AsyncLocalStorage` is not provided.");
  }
  const a = () => {
    if (o) {
      const s = o.getStore();
      if (s !== void 0) return s;
    }
    return n;
  };
  return { use: () => {
    const s = a();
    if (s === void 0) throw new Error("Context is not available");
    return s;
  }, tryUse: () => a(), set: (s, c) => {
    c || r(s), n = s, t = true;
  }, unset: () => {
    n = void 0, t = false;
  }, call: (s, c) => {
    r(s), n = s;
    try {
      return o ? o.run(s, c) : c();
    } finally {
      t || (n = void 0);
    }
  }, async callAsync(s, c) {
    n = s;
    const y = () => {
      n = s;
    }, f = () => n === s ? y : void 0;
    $$1.add(f);
    try {
      const d = o ? o.run(s, c) : c();
      return t || (n = void 0), await d;
    } finally {
      $$1.delete(f);
    }
  } };
}
function G$1(e = {}) {
  const n = {};
  return { get(t, r = {}) {
    return n[t] || (n[t] = V({ ...e, ...r })), n[t];
  } };
}
const C = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof global < "u" ? global : {}, L = "__unctx__", Q = C[L] || (C[L] = G$1()), X$1 = (e, n = {}) => Q.get(e, n), q = "__unctx_async_handlers__", $$1 = C[q] || (C[q] = /* @__PURE__ */ new Set());
function Y(e) {
  let n;
  const t = D$1(e), r = { duplex: "half", method: e.method, headers: e.headers };
  return e.node.req.body instanceof ArrayBuffer ? new Request(t, { ...r, body: e.node.req.body }) : new Request(t, { ...r, get body() {
    return n || (n = te$1(e), n);
  } });
}
function Z$1(e) {
  var _a;
  return (_a = e.web) != null ? _a : e.web = { request: Y(e), url: D$1(e) }, e.web.request;
}
function k$1() {
  return H();
}
const j = /* @__PURE__ */ Symbol("$HTTPEvent");
function ee$1(e) {
  return typeof e == "object" && (e instanceof H3Event || (e == null ? void 0 : e[j]) instanceof H3Event || (e == null ? void 0 : e.__is_event__) === true);
}
function E(e) {
  return function(...n) {
    var t;
    const r = n[0];
    if (ee$1(r)) n[0] = r instanceof H3Event || r.__is_event__ ? r : r[j];
    else {
      if (!((t = globalThis.app.config.server.experimental) != null && t.asyncContext)) throw new Error("AsyncLocalStorage was not enabled. Use the `server.experimental.asyncContext: true` option in your app configuration to enable it. Or, pass the instance of HTTPEvent that you have as the first argument to the function.");
      n.unshift(k$1());
    }
    return e(...n);
  };
}
const D$1 = E(getRequestURL), ne$1 = E(getResponseStatus), te$1 = E(getRequestWebStream);
function re$2() {
  var e;
  return X$1("nitro-app", { asyncContext: !!((e = globalThis.app.config.server.experimental) != null && e.asyncContext), AsyncLocalStorage: AsyncLocalStorage });
}
function H() {
  const e = re$2().use().event;
  if (!e) throw new Error("No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.");
  return e;
}
const oe = {}, le = eventHandler(se$2), b = oe;
async function se$2(e) {
  const n = Z$1(e);
  return await ae$1({ request: n, event: e });
}
function ie$2(e) {
  return e.replace(/^\/|\/$/g, "");
}
async function ae$1({ request: e, event: n }) {
  const t = new AbortController(), r = t.signal, o = () => t.abort();
  n.node.req.on("close", o);
  const a = e.method, s = new URL(e.url, "http://localhost:3000"), c = new RegExp(`${ie$2("/_server")}/([^/?#]+)`), y = s.pathname.match(c), f = y ? y[1] : null, d = Object.fromEntries(s.searchParams.entries()), x = "createServerFn" in d, I = "raw" in d;
  if (typeof f != "string") throw new Error("Invalid server action param for serverFnId: " + f);
  const R = b[f];
  if (!R) throw console.log("serverFnManifest", b), new Error("Server function info not found for " + f);
  let w;
  if (w = await R.importer(), !w) throw console.log("serverFnManifest", b), new Error("Server function module not resolved for " + f);
  const p = w[R.functionName];
  if (!p) throw console.log("serverFnManifest", b), console.log("fnModule", w), new Error(`Server function module export not resolved for serverFn ID: ${f}`);
  const z = ["multipart/form-data", "application/x-www-form-urlencoded"], h = await (async () => {
    try {
      let i = await (async () => {
        if (e.headers.get("Content-Type") && z.some((u) => {
          var A;
          return (A = e.headers.get("Content-Type")) == null ? void 0 : A.includes(u);
        })) return K$2(a.toLowerCase() !== "get", "GET requests with FormData payloads are not supported"), await p(await e.formData(), r);
        if (a.toLowerCase() === "get") {
          let u = d;
          return x && (u = d.payload), u = u && l.parse(u), await p(u, r);
        }
        const m = await e.text(), T = l.parse(m);
        return x ? await p(T, r) : await p(...T, r);
      })();
      return i.result instanceof Response ? i.result : !x && (i = i.result, i instanceof Response) ? i : isRedirect(i) || isNotFound(i) ? N(i) : new Response(i !== void 0 ? l.stringify(i) : void 0, { status: ne$1(H()), headers: { "Content-Type": "application/json" } });
    } catch (i) {
      return i instanceof Response ? i : isRedirect(i) || isNotFound(i) ? N(i) : (console.info(), console.info("Server Fn Error!"), console.info(), console.error(i), console.info(), new Response(l.stringify(i), { status: 500, headers: { "Content-Type": "application/json" } }));
    }
  })();
  if (n.node.req.removeListener("close", o), I) return h;
  if (h.headers.get("Content-Type") === "application/json") {
    const m = await h.clone().text();
    m && JSON.stringify(JSON.parse(m));
  }
  return h;
}
function N(e) {
  const { headers: n, ...t } = e;
  return new Response(JSON.stringify(t), { status: 200, headers: { "Content-Type": "application/json", ...n || {} } });
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var rr = typeof globalThis < "u" ? globalThis : typeof global < "u" ? global : typeof self < "u" ? self : {};
function Qs(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function oo(e) {
  if (Object.prototype.hasOwnProperty.call(e, "__esModule")) return e;
  var t = e.default;
  if (typeof t == "function") {
    var n = function r() {
      return this instanceof r ? Reflect.construct(t, arguments, this.constructor) : t.apply(this, arguments);
    };
    n.prototype = t.prototype;
  } else n = {};
  return Object.defineProperty(n, "__esModule", { value: true }), Object.keys(e).forEach(function(r) {
    var s = Object.getOwnPropertyDescriptor(e, r);
    Object.defineProperty(n, r, s.get ? s : { enumerable: true, get: function() {
      return e[r];
    } });
  }), n;
}
function ao(e = {}) {
  let t, n = false;
  const r = (o) => {
    if (t && t !== o) throw new Error("Context conflict");
  };
  let s;
  if (e.asyncContext) {
    const o = e.AsyncLocalStorage || globalThis.AsyncLocalStorage;
    o ? s = new o() : console.warn("[unctx] `AsyncLocalStorage` is not provided.");
  }
  const i = () => {
    if (s) {
      const o = s.getStore();
      if (o !== void 0) return o;
    }
    return t;
  };
  return { use: () => {
    const o = i();
    if (o === void 0) throw new Error("Context is not available");
    return o;
  }, tryUse: () => i(), set: (o, a) => {
    a || r(o), t = o, n = true;
  }, unset: () => {
    t = void 0, n = false;
  }, call: (o, a) => {
    r(o), t = o;
    try {
      return s ? s.run(o, a) : a();
    } finally {
      n || (t = void 0);
    }
  }, async callAsync(o, a) {
    t = o;
    const u = () => {
      t = o;
    }, d = () => t === o ? u : void 0;
    Rr.add(d);
    try {
      const c = s ? s.run(o, a) : a();
      return n || (t = void 0), await c;
    } finally {
      Rr.delete(d);
    }
  } };
}
function co(e = {}) {
  const t = {};
  return { get(n, r = {}) {
    return t[n] || (t[n] = ao({ ...e, ...r })), t[n];
  } };
}
const Xt$1 = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof global < "u" ? global : {}, Ar = "__unctx__", uo = Xt$1[Ar] || (Xt$1[Ar] = co()), lo = (e, t = {}) => uo.get(e, t), Tr = "__unctx_async_handlers__", Rr = Xt$1[Tr] || (Xt$1[Tr] = /* @__PURE__ */ new Set());
function po(e) {
  let t;
  const n = Gs(e), r = { duplex: "half", method: e.method, headers: e.headers };
  return e.node.req.body instanceof ArrayBuffer ? new Request(n, { ...r, body: e.node.req.body }) : new Request(n, { ...r, get body() {
    return t || (t = go(e), t);
  } });
}
function fo(e) {
  var _a2;
  return (_a2 = e.web) != null ? _a2 : e.web = { request: po(e), url: Gs(e) }, e.web.request;
}
function mo() {
  return Hs();
}
const Ks = /* @__PURE__ */ Symbol("$HTTPEvent");
function ho(e) {
  return typeof e == "object" && (e instanceof H3Event || (e == null ? void 0 : e[Ks]) instanceof H3Event || (e == null ? void 0 : e.__is_event__) === true);
}
function Ws(e) {
  return function(...t) {
    var n;
    const r = t[0];
    if (ho(r)) t[0] = r instanceof H3Event || r.__is_event__ ? r : r[Ks];
    else {
      if (!((n = globalThis.app.config.server.experimental) != null && n.asyncContext)) throw new Error("AsyncLocalStorage was not enabled. Use the `server.experimental.asyncContext: true` option in your app configuration to enable it. Or, pass the instance of HTTPEvent that you have as the first argument to the function.");
      t.unshift(mo());
    }
    return e(...t);
  };
}
const Gs = Ws(getRequestURL), go = Ws(getRequestWebStream);
function yo() {
  var e;
  return lo("nitro-app", { asyncContext: !!((e = globalThis.app.config.server.experimental) != null && e.asyncContext), AsyncLocalStorage: AsyncLocalStorage });
}
function Hs() {
  const e = yo().use().event;
  if (!e) throw new Error("No HTTPEvent found in AsyncLocalStorage. Make sure you are using the function within the server runtime.");
  return e;
}
const wo = [{ path: "/__root", filePath: "/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/app/routes/__root.tsx" }, { path: "/", filePath: "/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/app/routes/index.tsx" }, { path: "/login", filePath: "/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/app/routes/login.tsx" }, { path: "/portfolio", filePath: "/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/app/routes/portfolio.tsx" }, { path: "/domain/:$domain?", filePath: "/Users/antonio/Documents/PROYECTOS/dns-ops/apps/web/app/routes/domain/$domain.tsx" }];
function vo(e) {
  return eventHandler(async (t) => {
    const n = fo(t);
    return await e({ request: n });
  });
}
wo.filter((e) => e.$APIRoute);
new AsyncLocalStorage();
const Er = { debug: 0, info: 1, warn: 2, error: 3 };
class sr {
  constructor(t, n = {}) {
    __publicField(this, "config");
    __publicField(this, "context");
    this.config = t, this.context = { service: t.service, version: t.version, ...n };
  }
  child(t) {
    return new sr(this.config, { ...this.context, ...t });
  }
  forRequest(t) {
    return this.child(t);
  }
  debug(t, n) {
    this.log("debug", t, n);
  }
  info(t, n) {
    this.log("info", t, n);
  }
  warn(t, n) {
    this.log("warn", t, n);
  }
  error(t, n, r) {
    const s = this.extractError(n);
    this.log("error", t, r, s);
  }
  requestStart(t, n) {
    this.info("Request started", { method: t, path: n });
  }
  requestEnd(t, n) {
    const r = t >= 500 ? "error" : t >= 400 ? "warn" : "info";
    this.log(r, "Request completed", { statusCode: t, durationMs: n });
  }
  log(t, n, r, s) {
    if (Er[t] < Er[this.config.minLevel]) return;
    const i = { level: t, message: n, timestamp: (/* @__PURE__ */ new Date()).toISOString(), context: { ...this.context, ...r }, ...s && { error: s } };
    this.config.output ? this.config.output(i) : this.defaultOutput(i);
  }
  defaultOutput(t) {
    this.config.pretty ? this.prettyPrint(t) : this.jsonPrint(t);
  }
  jsonPrint(t) {
    const n = JSON.stringify(t);
    switch (t.level) {
      case "error":
        console.error(n);
        break;
      case "warn":
        console.warn(n);
        break;
      default:
        console.log(n);
    }
  }
  prettyPrint(t) {
    var _a2;
    const n = { debug: "\x1B[90m", info: "\x1B[36m", warn: "\x1B[33m", error: "\x1B[31m" }, r = "\x1B[0m", s = n[t.level], i = t.level.toUpperCase().padEnd(5), o = Object.entries(t.context).filter(([u, d]) => d !== void 0).map(([u, d]) => `${u}=${typeof d == "object" ? JSON.stringify(d) : d}`).join(" "), a = `${s}${i}${r} ${t.timestamp} ${t.message}${o ? ` | ${o}` : ""}`;
    switch (t.level) {
      case "error":
        console.error(a), ((_a2 = t.error) == null ? void 0 : _a2.stack) && console.error(`      ${t.error.stack}`);
        break;
      case "warn":
        console.warn(a);
        break;
      default:
        console.log(a);
    }
  }
  extractError(t) {
    if (t) return t instanceof Error ? { name: t.name, message: t.message, stack: t.stack } : { name: "Unknown", message: String(t) };
  }
}
function vt$1(e) {
  return new sr({ minLevel: process.env.LOG_LEVEL || "info", pretty: false, ...e });
}
class Io {
  constructor(t, n = "dns_ops") {
    __publicField(this, "logger");
    __publicField(this, "prefix");
    this.logger = t, this.prefix = n;
  }
  counter(t, n, r) {
    this.emit({ name: `${this.prefix}_${t}`, type: "counter", value: n, labels: r, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
  gauge(t, n, r) {
    this.emit({ name: `${this.prefix}_${t}`, type: "gauge", value: n, labels: r, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
  histogram(t, n, r) {
    this.emit({ name: `${this.prefix}_${t}`, type: "histogram", value: n, labels: r, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
  emit(t) {
    this.logger.info("metric", { metricName: t.name, metricType: t.type, metricValue: t.value, ...t.labels });
  }
  createRemediationMetrics() {
    return { created: (t) => {
      var _a2, _b;
      this.counter("remediation_created_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: t.type, priority: (_b = t.priority) != null ? _b : "normal" });
    }, started: (t) => {
      var _a2;
      this.counter("remediation_started_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: t.type }), t.timeToStartMs !== void 0 && this.histogram("remediation_time_to_start_ms", t.timeToStartMs, { type: t.type });
    }, completed: (t) => {
      var _a2;
      this.counter("remediation_completed_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: t.type }), this.histogram("remediation_duration_ms", t.durationMs, { type: t.type, outcome: "success" });
    }, failed: (t) => {
      var _a2;
      this.counter("remediation_failed_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: t.type, reason: t.reason }), t.durationMs !== void 0 && this.histogram("remediation_duration_ms", t.durationMs, { type: t.type, outcome: "failure" });
    }, cancelled: (t) => {
      var _a2, _b;
      this.counter("remediation_cancelled_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: t.type, reason: (_b = t.reason) != null ? _b : "user_request" });
    } };
  }
  createShadowMetrics() {
    return { comparisonRun: (t) => {
      var _a2, _b, _c2;
      if (this.counter("shadow_comparison_total", 1, { provider: (_a2 = t.provider) != null ? _a2 : "unknown", had_mismatch: String(t.hadMismatch) }), t.latencyMs !== void 0 && this.histogram("shadow_comparison_latency_ms", t.latencyMs, { provider: (_b = t.provider) != null ? _b : "unknown" }), t.hadMismatch && t.mismatchTypes) for (const n of t.mismatchTypes) this.counter("shadow_mismatch_total", 1, { provider: (_c2 = t.provider) != null ? _c2 : "unknown", mismatch_type: n });
    }, adjudicated: (t) => {
      var _a2;
      this.counter("shadow_adjudication_total", 1, { provider: (_a2 = t.provider) != null ? _a2 : "unknown", verdict: t.verdict });
    }, parityRate: (t) => {
      var _a2;
      this.gauge("shadow_parity_rate", t.rate, { provider: (_a2 = t.provider) != null ? _a2 : "all" });
    } };
  }
  createAlertMetrics() {
    return { created: (t) => {
      var _a2, _b;
      this.counter("alert_created_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", type: (_b = t.type) != null ? _b : "unknown", severity: t.severity });
    }, acknowledged: (t) => {
      var _a2, _b;
      this.counter("alert_acknowledged_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown" }), this.histogram("alert_time_to_ack_ms", t.timeToAckMs, { tenant_id: (_b = t.tenantId) != null ? _b : "unknown" });
    }, resolved: (t) => {
      var _a2, _b;
      this.counter("alert_resolved_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", resolution: t.resolution }), this.histogram("alert_time_to_resolve_ms", t.timeToResolveMs, { tenant_id: (_b = t.tenantId) != null ? _b : "unknown", resolution: t.resolution });
    }, suppressed: (t) => {
      var _a2, _b, _c2;
      this.counter("alert_suppressed_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown", reason: (_b = t.suppressionReason) != null ? _b : "manual" }), t.suppressionDurationMs !== void 0 && this.histogram("alert_suppression_duration_ms", t.suppressionDurationMs, { tenant_id: (_c2 = t.tenantId) != null ? _c2 : "unknown" });
    }, deduplicated: (t) => {
      var _a2, _b;
      this.counter("alert_deduplicated_total", 1, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "unknown" }), this.histogram("alert_duplicate_count", t.duplicateCount, { tenant_id: (_b = t.tenantId) != null ? _b : "unknown" });
    }, activeCount: (t) => {
      var _a2, _b;
      this.gauge("alert_active_count", t.count, { tenant_id: (_a2 = t.tenantId) != null ? _a2 : "all", severity: (_b = t.severity) != null ? _b : "all" });
    } };
  }
  createJobMetrics() {
    return { started: (t) => {
      this.counter("job_started_total", 1, { job_type: t.jobType, queue: t.queue });
    }, completed: (t) => {
      this.counter("job_completed_total", 1, { job_type: t.jobType, queue: t.queue }), this.histogram("job_duration_ms", t.durationMs, { job_type: t.jobType, queue: t.queue, outcome: "success" });
    }, failed: (t) => {
      const n = t.error.length > 60 ? `${t.error.slice(0, 57)}...` : t.error;
      this.counter("job_failed_total", 1, { job_type: t.jobType, queue: t.queue, error: n }), this.histogram("job_duration_ms", t.durationMs, { job_type: t.jobType, queue: t.queue, outcome: "failure" });
    }, retried: (t) => {
      this.counter("job_retried_total", 1, { job_type: t.jobType, queue: t.queue, attempt: String(t.attempt) });
    }, queueDepth: (t) => {
      this.gauge("queue_waiting", t.waiting, { queue: t.queue }), this.gauge("queue_active", t.active, { queue: t.queue }), this.gauge("queue_failed", t.failed, { queue: t.queue });
    } };
  }
}
function _o(e, t) {
  return new Io(e, t);
}
function bo(e, t) {
  const n = _o(e, t);
  return { remediation: n.createRemediationMetrics(), shadow: n.createShadowMetrics(), alerts: n.createAlertMetrics(), jobs: n.createJobMetrics() };
}
const Dr = vt$1({ service: "dns-ops-web", version: "1.0.0", minLevel: "info" }), Ys = [{ name: "NODE_ENV", required: false, description: "Runtime environment (development/production/test)", validate: (e) => ["development", "production", "test"].includes(e) ? null : "Must be one of: development, production, test", default: "production" }, { name: "DATABASE_URL", required: "development", description: "PostgreSQL connection URL for local development or bound runtime", validate: (e) => e.startsWith("postgresql://") || e.startsWith("postgres://") ? null : "Must be a valid PostgreSQL URL (postgresql://... or postgres://...)" }, { name: "HYPERDRIVE_URL", required: false, description: "Optional Cloudflare-bound PostgreSQL/Hyperdrive connection URL", validate: (e) => e.startsWith("postgresql://") || e.startsWith("postgres://") ? null : "Must be a valid PostgreSQL URL (postgresql://... or postgres://...)" }, { name: "COLLECTOR_URL", required: true, description: "URL for the DNS collector service", validate: (e) => {
  try {
    return new URL(e), null;
  } catch {
    return "Must be a valid URL";
  }
}, default: "http://localhost:3001" }, { name: "INTERNAL_SECRET", required: "production", description: "Shared secret for internal web \u2192 collector authentication", validate: (e) => e.length >= 16 ? null : "Must be at least 16 characters for security" }, { name: "API_KEY_SECRET", required: false, description: "Shared secret for service API key authentication", validate: (e) => e.length >= 16 ? null : "Must be at least 16 characters for security" }];
function So(e, t) {
  return e.required === true ? true : e.required === false ? false : e.required === t;
}
function pt$1(e, t, n = process.env) {
  var _a2, _b, _c2, _d2, _e2, _f, _g, _h;
  switch (e) {
    case "DATABASE_URL":
      return (_c2 = (_b = (_a2 = t == null ? void 0 : t.DATABASE_URL) != null ? _a2 : t == null ? void 0 : t.HYPERDRIVE_URL) != null ? _b : n.DATABASE_URL) != null ? _c2 : n.HYPERDRIVE_URL;
    case "HYPERDRIVE_URL":
      return (_d2 = t == null ? void 0 : t.HYPERDRIVE_URL) != null ? _d2 : n.HYPERDRIVE_URL;
    case "COLLECTOR_URL":
      return (_e2 = t == null ? void 0 : t.COLLECTOR_URL) != null ? _e2 : n.COLLECTOR_URL;
    case "INTERNAL_SECRET":
      return (_f = t == null ? void 0 : t.INTERNAL_SECRET) != null ? _f : n.INTERNAL_SECRET;
    case "API_KEY_SECRET":
      return (_g = t == null ? void 0 : t.API_KEY_SECRET) != null ? _g : n.API_KEY_SECRET;
    case "NODE_ENV":
      return (_h = t == null ? void 0 : t.NODE_ENV) != null ? _h : n.NODE_ENV;
  }
}
function Ao(e = process.env) {
  const t = [], n = [], r = e.NODE_ENV || "production";
  for (const s of Ys) {
    const i = pt$1(s.name, void 0, e);
    if (So(s, r) && !i) {
      t.push({ name: s.name, error: "Required but not set", description: s.description });
      continue;
    }
    if (!i) {
      s.required === "production" && r === "development" && n.push(`${s.name} not set (required in production): ${s.description}`);
      continue;
    }
    if (s.validate) {
      const a = s.validate(i);
      a && t.push({ name: s.name, error: a, description: s.description });
    }
  }
  return { valid: t.length === 0, errors: t, warnings: n, environment: r };
}
function To(e) {
  const t = ["", "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557", "\u2551           ENVIRONMENT CONFIGURATION ERROR                      \u2551", "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D", "", `Environment: ${e.environment}`, ""];
  if (e.errors.length > 0) {
    t.push("ERRORS (startup blocked):"), t.push("\u2500".repeat(60));
    for (const n of e.errors) t.push(`  \u2717 ${n.name}`), t.push(`    Error: ${n.error}`), t.push(`    Purpose: ${n.description}`), t.push("");
  }
  if (e.warnings.length > 0) {
    t.push("WARNINGS:"), t.push("\u2500".repeat(60));
    for (const n of e.warnings) t.push(`  \u26A0 ${n}`);
    t.push("");
  }
  return t.push("\u2500".repeat(60)), t.push("Fix the errors above and restart the application."), t.push(""), t.join(`
`);
}
function Ro(e = process.env) {
  const t = Ao(e);
  if (t.warnings.length > 0 && Dr.warn("Environment validation warnings", { warnings: t.warnings }), !t.valid) {
    const n = To(t);
    throw Dr.error("Environment validation failed", void 0, { errorCount: t.errors.length, errors: t.errors.map((r) => `${r.name}: ${r.error}`), formatted: n }), new Error(`Environment validation failed: ${t.errors.length} error(s)`);
  }
}
function ir(e, t = process.env) {
  const n = pt$1("NODE_ENV", e, t) || "production";
  return { nodeEnv: n, databaseUrl: pt$1("DATABASE_URL", e, t), collectorUrl: pt$1("COLLECTOR_URL", e, t) || "http://localhost:3001", internalSecret: pt$1("INTERNAL_SECRET", e, t), apiKeySecret: pt$1("API_KEY_SECRET", e, t), isDevelopment: n === "development", isProduction: n === "production" };
}
function Eo(e, t = process.env) {
  return ir(e, t);
}
Ys.map((e) => e.name);
function It$1(e) {
  return TaggedError(e);
}
It$1("ValidationError")();
const Do = It$1("NotFoundError")();
class qo extends Do {
  constructor() {
    super(...arguments);
    __publicField(this, "statusCode", 404);
  }
}
const No = It$1("TenantIsolationError")();
class Co extends No {
  constructor() {
    super(...arguments);
    __publicField(this, "statusCode", 403);
  }
}
It$1("DatabaseError")();
It$1("ParseError")();
It$1("NetworkError")();
const ko = "6ba7b810-9dad-11d1-80b4-00c04fd430c8", Mo = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function xo(e) {
  return Mo.test(e);
}
function jo(e) {
  const t = e.replace(/-/g, ""), n = new Uint8Array(16);
  for (let r = 0; r < 16; r++) n[r] = parseInt(t.substring(r * 2, r * 2 + 2), 16);
  return n;
}
function Lo(e) {
  const t = Array.from(e).map((n) => n.toString(16).padStart(2, "0")).join("");
  return [t.substring(0, 8), t.substring(8, 12), t.substring(12, 16), t.substring(16, 20), t.substring(20, 32)].join("-");
}
async function Po(e, t = ko) {
  const n = jo(t), r = new TextEncoder().encode(e), s = new Uint8Array(n.length + r.length);
  s.set(n), s.set(r, n.length);
  const i = await crypto.subtle.digest("SHA-1", s), o = new Uint8Array(i), a = new Uint8Array(16);
  return a.set(o.slice(0, 16)), a[6] = a[6] & 15 | 80, a[8] = a[8] & 63 | 128, Lo(a);
}
async function Oo(e) {
  if (!e) throw new Error("Tenant identifier is required");
  return xo(e) ? e.toLowerCase() : Po(e.toLowerCase());
}
const qr = /* @__PURE__ */ new Map();
async function Qt$1(e) {
  const t = e.toLowerCase(), n = qr.get(t);
  if (n) return n;
  const r = await Oo(e);
  return qr.set(t, r), r;
}
const Zs = pgEnum("remediation_status", ["open", "in-progress", "resolved", "closed"]), Js = pgEnum("remediation_priority", ["low", "medium", "high", "critical"]), pe$1 = pgTable("remediation_requests", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id"), domain: varchar("domain", { length: 253 }).notNull(), contactEmail: varchar("contact_email", { length: 254 }).notNull(), contactName: varchar("contact_name", { length: 100 }).notNull(), contactPhone: varchar("contact_phone", { length: 20 }), tenantId: uuid("tenant_id").notNull(), createdBy: varchar("created_by", { length: 100 }).notNull(), issues: jsonb("issues").notNull().$type(), priority: Js("priority").notNull().default("medium"), notes: text("notes"), status: Zs("status").notNull().default("open"), assignedTo: varchar("assigned_to", { length: 100 }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), resolvedAt: timestamp("resolved_at", { withTimezone: true }) }, (e) => ({ domainIdx: index("remediation_domain_idx").on(e.domain), statusIdx: index("remediation_status_idx").on(e.status), snapshotIdx: index("remediation_snapshot_idx").on(e.snapshotId), tenantIdx: index("remediation_tenant_idx").on(e.tenantId), createdByIdx: index("remediation_created_by_idx").on(e.createdBy), createdAtIdx: index("remediation_created_at_idx").on(e.createdAt) })), ei = pgEnum("selector_provenance", ["managed-zone-config", "operator-supplied", "provider-heuristic", "common-dictionary", "not-found"]), or = pgEnum("selector_confidence", ["certain", "high", "medium", "low", "heuristic"]), ar = pgEnum("mail_provider", ["google-workspace", "microsoft-365", "amazon-ses", "sendgrid", "mailgun", "mailchimp", "zoho", "fastmail", "protonmail", "custom", "unknown"]), Te = pgTable("dkim_selectors", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), selector: varchar("selector", { length: 63 }).notNull(), domain: varchar("domain", { length: 253 }).notNull(), provenance: ei("provenance").notNull(), confidence: or("confidence").notNull(), provider: ar("provider"), found: boolean("found").notNull(), recordData: text("record_data"), keyType: varchar("key_type", { length: 10 }), keySize: varchar("key_size", { length: 10 }), hashAlgorithms: jsonb("hash_algorithms").$type(), flags: jsonb("flags").$type(), isValid: boolean("is_valid"), validationError: text("validation_error"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ snapshotIdx: index("dkim_selector_snapshot_idx").on(e.snapshotId), selectorIdx: index("dkim_selector_selector_idx").on(e.selector), domainIdx: index("dkim_selector_domain_idx").on(e.domain), providerIdx: index("dkim_selector_provider_idx").on(e.provider), provenanceIdx: index("dkim_selector_provenance_idx").on(e.provenance) })), re$1 = pgTable("mail_evidence", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), domain: varchar("domain", { length: 253 }).notNull(), detectedProvider: ar("detected_provider"), providerConfidence: or("provider_confidence"), hasMx: boolean("has_mx").notNull().default(false), isNullMx: boolean("is_null_mx").notNull().default(false), mxHosts: jsonb("mx_hosts").$type(), hasSpf: boolean("has_spf").notNull().default(false), spfRecord: text("spf_record"), spfMechanisms: jsonb("spf_mechanisms").$type(), hasDmarc: boolean("has_dmarc").notNull().default(false), dmarcRecord: text("dmarc_record"), dmarcPolicy: varchar("dmarc_policy", { length: 20 }), dmarcSubdomainPolicy: varchar("dmarc_subdomain_policy", { length: 20 }), dmarcPercent: varchar("dmarc_percent", { length: 5 }), dmarcRua: jsonb("dmarc_rua").$type(), dmarcRuf: jsonb("dmarc_ruf").$type(), hasDkim: boolean("has_dkim").notNull().default(false), dkimSelectorsFound: jsonb("dkim_selectors_found").$type(), dkimSelectorCount: varchar("dkim_selector_count", { length: 5 }), hasMtaSts: boolean("has_mta_sts").notNull().default(false), mtaStsMode: varchar("mta_sts_mode", { length: 20 }), mtaStsVersion: varchar("mta_sts_version", { length: 10 }), mtaStsMaxAge: varchar("mta_sts_max_age", { length: 15 }), hasTlsRpt: boolean("has_tls_rpt").notNull().default(false), tlsRptRua: jsonb("tls_rpt_rua").$type(), hasBimi: boolean("has_bimi").notNull().default(false), bimiVersion: varchar("bimi_version", { length: 10 }), bimiLocation: text("bimi_location"), bimiAuthority: text("bimi_authority"), securityScore: varchar("security_score", { length: 5 }), scoreBreakdown: jsonb("score_breakdown").$type(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ snapshotIdx: index("mail_evidence_snapshot_idx").on(e.snapshotId), domainIdx: index("mail_evidence_domain_idx").on(e.domain), providerIdx: index("mail_evidence_provider_idx").on(e.detectedProvider), scoreIdx: index("mail_evidence_score_idx").on(e.securityScore) })), ti = pgEnum("shadow_status", ["match", "mismatch", "partial-match", "error"]), Bo = pgEnum("field_comparison_status", ["match", "mismatch", "missing-in-legacy", "missing-in-new", "not-comparable"]), ni = pgEnum("adjudication_decision", ["new-correct", "legacy-correct", "both-wrong", "acceptable-difference"]), ri = pgEnum("legacy_tool_type", ["dmarc-check", "dkim-check", "spf-check", "mx-check", "dns-check"]), si = pgEnum("baseline_status", ["active", "deprecated", "draft"]), fe$1 = pgTable("shadow_comparisons", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), domain: varchar("domain", { length: 253 }).notNull(), comparedAt: timestamp("compared_at", { withTimezone: true }).notNull().defaultNow(), status: ti("status").notNull(), comparisons: jsonb("comparisons").notNull().$type(), metrics: jsonb("metrics").notNull().$type(), summary: text("summary").notNull(), legacyOutput: jsonb("legacy_output").notNull().$type(), acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }), acknowledgedBy: varchar("acknowledged_by", { length: 100 }), adjudication: ni("adjudication"), adjudicationNotes: text("adjudication_notes"), tenantId: uuid("tenant_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ snapshotIdx: index("shadow_comparison_snapshot_idx").on(e.snapshotId), domainIdx: index("shadow_comparison_domain_idx").on(e.domain), statusIdx: index("shadow_comparison_status_idx").on(e.status), adjudicationIdx: index("shadow_comparison_adjudication_idx").on(e.adjudication), comparedAtIdx: index("shadow_comparison_compared_at_idx").on(e.comparedAt), tenantIdx: index("shadow_comparison_tenant_idx").on(e.tenantId) })), Ce = pgTable("legacy_access_logs", { id: uuid("id").primaryKey().defaultRandom(), toolType: ri("tool_type").notNull(), toolEndpoint: varchar("tool_endpoint", { length: 500 }), domain: varchar("domain", { length: 253 }).notNull(), requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(), requestedBy: varchar("requested_by", { length: 100 }), requestSource: varchar("request_source", { length: 50 }), responseStatus: varchar("response_status", { length: 20 }), responseTimeMs: jsonb("response_time_ms").$type(), outputSummary: jsonb("output_summary").$type(), rawOutput: text("raw_output"), snapshotId: uuid("snapshot_id").references(() => K$1.id, { onDelete: "set null" }), tenantId: uuid("tenant_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ toolTypeIdx: index("legacy_access_tool_type_idx").on(e.toolType), domainIdx: index("legacy_access_domain_idx").on(e.domain), requestedAtIdx: index("legacy_access_requested_at_idx").on(e.requestedAt), snapshotIdx: index("legacy_access_snapshot_idx").on(e.snapshotId), tenantIdx: index("legacy_access_tenant_idx").on(e.tenantId) })), Re = pgTable("provider_baselines", { id: uuid("id").primaryKey().defaultRandom(), providerKey: varchar("provider_key", { length: 50 }).notNull(), providerName: varchar("provider_name", { length: 100 }).notNull(), status: si("status").notNull().default("active"), baseline: jsonb("baseline").notNull().$type(), dkimSelectors: jsonb("dkim_selectors").$type(), mxPatterns: jsonb("mx_patterns").$type(), spfIncludes: jsonb("spf_includes").$type(), notes: text("notes"), documentationUrl: varchar("documentation_url", { length: 500 }), version: varchar("version", { length: 20 }).notNull().default("1.0.0"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ providerKeyIdx: index("provider_baseline_provider_key_idx").on(e.providerKey), statusIdx: index("provider_baseline_status_idx").on(e.status) })), ft$1 = pgTable("mismatch_reports", { id: uuid("id").primaryKey().defaultRandom(), domain: varchar("domain", { length: 253 }), tenantId: uuid("tenant_id"), periodStart: timestamp("period_start", { withTimezone: true }).notNull(), periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), totalComparisons: jsonb("total_comparisons").$type().notNull(), matchCount: jsonb("match_count").$type().notNull(), mismatchCount: jsonb("mismatch_count").$type().notNull(), partialMatchCount: jsonb("partial_match_count").$type().notNull(), mismatchBreakdown: jsonb("mismatch_breakdown").$type(), adjudicatedCount: jsonb("adjudicated_count").$type(), pendingCount: jsonb("pending_count").$type(), matchRate: varchar("match_rate", { length: 10 }), cutoverReady: boolean("cutover_ready").notNull().default(false), cutoverNotes: text("cutover_notes"), generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(), generatedBy: varchar("generated_by", { length: 100 }) }, (e) => ({ domainIdx: index("mismatch_report_domain_idx").on(e.domain), tenantIdx: index("mismatch_report_tenant_idx").on(e.tenantId), periodIdx: index("mismatch_report_period_idx").on(e.periodStart, e.periodEnd), cutoverIdx: index("mismatch_report_cutover_idx").on(e.cutoverReady) })), ii = pgEnum("result_state", ["complete", "partial", "failed"]), dr = pgEnum("severity", ["critical", "high", "medium", "low", "info"]), oi = pgEnum("confidence", ["certain", "high", "medium", "low", "heuristic"]), cr = pgEnum("risk_posture", ["safe", "low", "medium", "high", "critical"]), ur = pgEnum("blast_radius", ["none", "single-domain", "subdomain-tree", "related-domains", "infrastructure", "organization-wide"]), lr = pgEnum("zone_management", ["managed", "unmanaged", "unknown"]), ai = pgEnum("vantage_type", ["public-recursive", "authoritative", "parent-zone", "probe"]), di = pgEnum("collection_status", ["success", "timeout", "refused", "truncated", "nxdomain", "nodata", "error"]), z$1 = pgTable("domains", { id: uuid("id").primaryKey().defaultRandom(), name: varchar("name", { length: 253 }).notNull(), normalizedName: varchar("normalized_name", { length: 253 }).notNull(), punycodeName: varchar("punycode_name", { length: 253 }), zoneManagement: lr("zone_management").notNull().default("unknown"), tenantId: uuid("tenant_id"), metadata: jsonb("metadata"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ nameTenantIdx: uniqueIndex("domain_name_tenant_idx").on(e.normalizedName, e.tenantId), tenantIdx: index("domain_tenant_idx").on(e.tenantId), zoneMgmtIdx: index("domain_zone_management_idx").on(e.zoneManagement) })), ue$1 = pgTable("ruleset_versions", { id: uuid("id").primaryKey().defaultRandom(), version: varchar("version", { length: 50 }).notNull(), name: varchar("name", { length: 100 }).notNull(), description: text("description"), rules: jsonb("rules").notNull(), active: boolean("active").notNull().default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), createdBy: varchar("created_by", { length: 100 }).notNull() }, (e) => ({ versionIdx: uniqueIndex("ruleset_version_idx").on(e.version), activeIdx: index("ruleset_active_idx").on(e.active) })), K$1 = pgTable("snapshots", { id: uuid("id").primaryKey().defaultRandom(), domainId: uuid("domain_id").notNull().references(() => z$1.id, { onDelete: "cascade" }), domainName: varchar("domain_name", { length: 253 }).notNull(), resultState: ii("result_state").notNull(), queriedNames: jsonb("queried_names").notNull().$type(), queriedTypes: jsonb("queried_types").notNull().$type(), vantages: jsonb("vantages").notNull().$type(), zoneManagement: lr("zone_management").notNull(), rulesetVersionId: uuid("ruleset_version_id").references(() => ue$1.id), triggeredBy: varchar("triggered_by", { length: 100 }).notNull(), collectionDurationMs: integer("collection_duration_ms"), errorMessage: text("error_message"), metadata: jsonb("metadata").$type(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ domainIdx: index("snapshot_domain_idx").on(e.domainId), createdAtIdx: index("snapshot_created_at_idx").on(e.createdAt), domainCreatedIdx: index("snapshot_domain_created_idx").on(e.domainId, e.createdAt), stateIdx: index("snapshot_state_idx").on(e.resultState) })), Xe = pgTable("observations", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), queryName: varchar("query_name", { length: 253 }).notNull(), queryType: varchar("query_type", { length: 10 }).notNull(), vantageType: ai("vantage_type").notNull(), vantageIdentifier: varchar("vantage_identifier", { length: 100 }), status: di("status").notNull(), queriedAt: timestamp("queried_at", { withTimezone: true }).notNull().defaultNow(), responseTimeMs: integer("response_time_ms"), responseCode: integer("response_code"), flags: jsonb("flags").$type(), answerSection: jsonb("answer_section").$type(), authoritySection: jsonb("authority_section").$type(), additionalSection: jsonb("additional_section").$type(), errorMessage: text("error_message"), errorDetails: jsonb("error_details"), rawResponse: text("raw_response") }, (e) => ({ snapshotIdx: index("observation_snapshot_idx").on(e.snapshotId), queryIdx: index("observation_query_idx").on(e.queryName, e.queryType), statusIdx: index("observation_status_idx").on(e.status) })), de = pgTable("record_sets", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), name: varchar("name", { length: 253 }).notNull(), type: varchar("type", { length: 10 }).notNull(), ttl: integer("ttl"), values: jsonb("values").notNull().$type(), sourceObservationIds: jsonb("source_observation_ids").notNull().$type(), sourceVantages: jsonb("source_vantages").notNull().$type(), isConsistent: boolean("is_consistent").notNull(), consolidationNotes: text("consolidation_notes"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ snapshotIdx: index("recordset_snapshot_idx").on(e.snapshotId), nameTypeIdx: index("recordset_name_type_idx").on(e.name, e.type) })), X = pgTable("findings", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), type: varchar("type", { length: 100 }).notNull(), title: varchar("title", { length: 200 }).notNull(), description: text("description").notNull(), severity: dr("severity").notNull(), confidence: oi("confidence").notNull(), riskPosture: cr("risk_posture").notNull(), blastRadius: ur("blast_radius").notNull(), reviewOnly: boolean("review_only").notNull().default(false), evidence: jsonb("evidence").notNull().$type(), ruleId: varchar("rule_id", { length: 100 }).notNull(), ruleVersion: varchar("rule_version", { length: 50 }).notNull(), rulesetVersionId: uuid("ruleset_version_id").references(() => ue$1.id, { onDelete: "set null" }), acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }), acknowledgedBy: varchar("acknowledged_by", { length: 100 }), falsePositive: boolean("false_positive").default(false), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ snapshotIdx: index("finding_snapshot_idx").on(e.snapshotId), typeIdx: index("finding_type_idx").on(e.type), severityIdx: index("finding_severity_idx").on(e.severity), reviewOnlyIdx: index("finding_review_only_idx").on(e.reviewOnly), rulesetVersionIdx: index("finding_ruleset_version_idx").on(e.rulesetVersionId), uniqueFindingIdx: uniqueIndex("finding_unique_idx").on(e.snapshotId, e.ruleId, e.type, e.rulesetVersionId) })), ge = pgTable("suggestions", { id: uuid("id").primaryKey().defaultRandom(), findingId: uuid("finding_id").notNull().references(() => X.id, { onDelete: "cascade" }), title: varchar("title", { length: 200 }).notNull(), description: text("description").notNull(), action: text("action").notNull(), riskPosture: cr("risk_posture").notNull(), blastRadius: ur("blast_radius").notNull(), reviewOnly: boolean("review_only").notNull().default(false), appliedAt: timestamp("applied_at", { withTimezone: true }), appliedBy: varchar("applied_by", { length: 100 }), dismissedAt: timestamp("dismissed_at", { withTimezone: true }), dismissedBy: varchar("dismissed_by", { length: 100 }), dismissalReason: text("dismissal_reason"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ findingIdx: index("suggestion_finding_idx").on(e.findingId), reviewOnlyIdx: index("suggestion_review_only_idx").on(e.reviewOnly) })), ke = pgTable("domain_notes", { id: uuid("id").primaryKey().defaultRandom(), domainId: uuid("domain_id").notNull().references(() => z$1.id, { onDelete: "cascade" }), content: text("content").notNull(), createdBy: varchar("created_by", { length: 100 }).notNull(), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ domainIdx: index("domain_note_domain_idx").on(e.domainId), tenantIdx: index("domain_note_tenant_idx").on(e.tenantId), createdIdx: index("domain_note_created_idx").on(e.createdAt) })), Ie = pgTable("domain_tags", { id: uuid("id").primaryKey().defaultRandom(), domainId: uuid("domain_id").notNull().references(() => z$1.id, { onDelete: "cascade" }), tag: varchar("tag", { length: 50 }).notNull(), createdBy: varchar("created_by", { length: 100 }).notNull(), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ domainIdx: index("domain_tag_domain_idx").on(e.domainId), tagIdx: index("domain_tag_tag_idx").on(e.tag), tenantIdx: index("domain_tag_tenant_idx").on(e.tenantId), uniqueTag: uniqueIndex("domain_tag_unique_idx").on(e.domainId, e.tag) })), Fe = pgTable("saved_filters", { id: uuid("id").primaryKey().defaultRandom(), name: varchar("name", { length: 100 }).notNull(), description: text("description"), criteria: jsonb("criteria").notNull().$type(), isShared: boolean("is_shared").notNull().default(false), createdBy: varchar("created_by", { length: 100 }).notNull(), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ tenantIdx: index("saved_filter_tenant_idx").on(e.tenantId), createdByIdx: index("saved_filter_created_by_idx").on(e.createdBy), sharedIdx: index("saved_filter_shared_idx").on(e.isShared) })), ci = pgEnum("audit_action", ["domain_note_created", "domain_note_updated", "domain_note_deleted", "domain_tag_added", "domain_tag_removed", "filter_created", "filter_updated", "filter_deleted", "template_override_created", "template_override_updated", "template_override_deleted", "remediation_request_created", "remediation_request_updated", "shared_report_created", "shared_report_expired", "monitored_domain_created", "monitored_domain_updated", "monitored_domain_deleted", "monitored_domain_toggled", "alert_acknowledged", "alert_resolved", "alert_suppressed"]), mt$1 = pgTable("audit_events", { id: uuid("id").primaryKey().defaultRandom(), action: ci("action").notNull(), entityType: varchar("entity_type", { length: 50 }).notNull(), entityId: uuid("entity_id").notNull(), previousValue: jsonb("previous_value"), newValue: jsonb("new_value"), actorId: varchar("actor_id", { length: 100 }).notNull(), actorEmail: varchar("actor_email", { length: 255 }), tenantId: uuid("tenant_id"), ipAddress: varchar("ip_address", { length: 45 }), userAgent: text("user_agent"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ entityIdx: index("audit_entity_idx").on(e.entityType, e.entityId), actorIdx: index("audit_actor_idx").on(e.actorId), tenantIdx: index("audit_tenant_idx").on(e.tenantId), actionIdx: index("audit_action_idx").on(e.action), createdIdx: index("audit_created_idx").on(e.createdAt) })), Me = pgTable("template_overrides", { id: uuid("id").primaryKey().defaultRandom(), providerKey: varchar("provider_key", { length: 50 }).notNull(), templateKey: varchar("template_key", { length: 50 }).notNull(), overrideData: jsonb("override_data").notNull(), appliesToDomains: jsonb("applies_to_domains").$type(), createdBy: varchar("created_by", { length: 100 }).notNull(), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ providerIdx: index("template_override_provider_idx").on(e.providerKey), tenantIdx: index("template_override_tenant_idx").on(e.tenantId), uniqueOverride: uniqueIndex("template_override_unique_idx").on(e.providerKey, e.templateKey, e.tenantId) })), ui = pgEnum("monitoring_schedule", ["hourly", "daily", "weekly"]), me$1 = pgTable("monitored_domains", { id: uuid("id").primaryKey().defaultRandom(), domainId: uuid("domain_id").notNull().references(() => z$1.id, { onDelete: "cascade" }), schedule: ui("schedule").notNull().default("daily"), alertChannels: jsonb("alert_channels").notNull().$type(), maxAlertsPerDay: integer("max_alerts_per_day").notNull().default(5), suppressionWindowMinutes: integer("suppression_window_minutes").notNull().default(60), isActive: boolean("is_active").notNull().default(true), lastCheckAt: timestamp("last_check_at", { withTimezone: true }), lastAlertAt: timestamp("last_alert_at", { withTimezone: true }), createdBy: varchar("created_by", { length: 100 }).notNull(), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ domainIdx: uniqueIndex("monitored_domain_unique_idx").on(e.domainId), tenantIdx: index("monitored_domain_tenant_idx").on(e.tenantId), activeIdx: index("monitored_domain_active_idx").on(e.isActive), scheduleIdx: index("monitored_domain_schedule_idx").on(e.schedule) })), li = pgEnum("alert_status", ["pending", "sent", "suppressed", "acknowledged", "resolved"]), pi = pgEnum("shared_report_visibility", ["private", "tenant", "shared"]), fi = pgEnum("shared_report_status", ["generating", "ready", "expired", "error"]), _e$1 = pgTable("alerts", { id: uuid("id").primaryKey().defaultRandom(), monitoredDomainId: uuid("monitored_domain_id").notNull().references(() => me$1.id, { onDelete: "cascade" }), title: varchar("title", { length: 200 }).notNull(), description: text("description").notNull(), severity: dr("severity").notNull(), triggeredByFindingId: uuid("triggered_by_finding_id").references(() => X.id), status: li("status").notNull().default("pending"), dedupKey: varchar("dedup_key", { length: 200 }), acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }), acknowledgedBy: varchar("acknowledged_by", { length: 100 }), resolvedAt: timestamp("resolved_at", { withTimezone: true }), resolutionNote: text("resolution_note"), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ monitoredIdx: index("alert_monitored_idx").on(e.monitoredDomainId), statusIdx: index("alert_status_idx").on(e.status), tenantIdx: index("alert_tenant_idx").on(e.tenantId), dedupIdx: index("alert_dedup_idx").on(e.dedupKey), createdIdx: index("alert_created_idx").on(e.createdAt) })), $e = pgTable("shared_reports", { id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull(), createdBy: varchar("created_by", { length: 100 }).notNull(), title: varchar("title", { length: 200 }).notNull(), visibility: pi("visibility").notNull().default("shared"), status: fi("status").notNull().default("generating"), shareToken: varchar("share_token", { length: 128 }), expiresAt: timestamp("expires_at", { withTimezone: true }), summary: jsonb("summary").notNull(), alertSummary: jsonb("alert_summary").notNull().$type(), metadata: jsonb("metadata").$type(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ tenantIdx: index("shared_report_tenant_idx").on(e.tenantId), statusIdx: index("shared_report_status_idx").on(e.status), visibilityIdx: index("shared_report_visibility_idx").on(e.visibility), shareTokenIdx: uniqueIndex("shared_report_share_token_idx").on(e.shareToken), createdIdx: index("shared_report_created_idx").on(e.createdAt) })), mi = pgEnum("fleet_report_status", ["pending", "processing", "completed", "failed"]), Fo = pgTable("fleet_reports", { id: uuid("id").primaryKey().defaultRandom(), tenantId: uuid("tenant_id").notNull(), createdBy: varchar("created_by", { length: 100 }).notNull(), status: mi("status").notNull().default("pending"), inventory: jsonb("inventory").notNull().$type(), checks: jsonb("checks").notNull().$type(), format: varchar("format", { length: 20 }).notNull().default("summary"), summary: jsonb("summary").$type(), domainResults: jsonb("domain_results").$type(), errorMessage: text("error_message"), startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, (e) => ({ tenantIdx: index("fleet_report_tenant_idx").on(e.tenantId), statusIdx: index("fleet_report_status_idx").on(e.status), createdIdx: index("fleet_report_created_idx").on(e.createdAt) })), hi = pgEnum("probe_type", ["smtp_starttls", "mta_sts", "tls_cert", "http"]), gi = pgEnum("probe_status", ["success", "timeout", "refused", "ssrf_blocked", "allowlist_denied", "parse_error", "error"]), $o = pgTable("probe_observations", { id: uuid("id").primaryKey().defaultRandom(), snapshotId: uuid("snapshot_id").notNull().references(() => K$1.id, { onDelete: "cascade" }), probeType: hi("probe_type").notNull(), status: gi("status").notNull(), hostname: varchar("hostname", { length: 253 }).notNull(), port: integer("port"), success: boolean("success").notNull(), errorMessage: text("error_message"), probedAt: timestamp("probed_at", { withTimezone: true }).notNull().defaultNow(), responseTimeMs: integer("response_time_ms"), probeData: jsonb("probe_data").$type() }, (e) => ({ snapshotIdx: index("probe_observation_snapshot_idx").on(e.snapshotId), probeTypeIdx: index("probe_observation_type_idx").on(e.probeType), hostnameIdx: index("probe_observation_hostname_idx").on(e.hostname), statusIdx: index("probe_observation_status_idx").on(e.status), successIdx: index("probe_observation_success_idx").on(e.success) })), yi = pgTable("users", { id: uuid("id").primaryKey().defaultRandom(), email: varchar("email", { length: 255 }).notNull().unique(), passwordHash: text("password_hash").notNull(), name: varchar("name", { length: 255 }), tenantId: uuid("tenant_id").notNull(), createdAt: timestamp("created_at").defaultNow().notNull(), updatedAt: timestamp("updated_at").defaultNow().notNull() }), Ge = pgTable("sessions", { id: uuid("id").primaryKey().defaultRandom(), token: varchar("token", { length: 255 }).notNull().unique(), userEmail: varchar("user_email", { length: 255 }).notNull(), tenantId: uuid("tenant_id").notNull(), expiresAt: timestamp("expires_at").notNull(), createdAt: timestamp("created_at").defaultNow().notNull() }), He = Object.freeze(Object.defineProperty({ __proto__: null, adjudicationEnum: ni, alertStatusEnum: li, alerts: _e$1, auditActionEnum: ci, auditEvents: mt$1, baselineStatusEnum: si, blastRadiusEnum: ur, collectionStatusEnum: di, confidenceEnum: oi, dkimSelectors: Te, domainNotes: ke, domainTags: Ie, domains: z$1, fieldComparisonStatusEnum: Bo, findings: X, fleetReportStatusEnum: mi, fleetReports: Fo, legacyAccessLogs: Ce, legacyToolTypeEnum: ri, mailEvidence: re$1, mailProviderEnum: ar, mismatchReports: ft$1, monitoredDomains: me$1, monitoringScheduleEnum: ui, observations: Xe, probeObservations: $o, probeStatusEnum: gi, probeTypeEnum: hi, providerBaselines: Re, recordSets: de, remediationPriorityEnum: Js, remediationRequests: pe$1, remediationStatusEnum: Zs, resultStateEnum: ii, riskPostureEnum: cr, rulesetVersions: ue$1, savedFilters: Fe, selectorConfidenceEnum: or, selectorProvenanceEnum: ei, sessions: Ge, severityEnum: dr, shadowComparisons: fe$1, shadowStatusEnum: ti, sharedReportStatusEnum: fi, sharedReportVisibilityEnum: pi, sharedReports: $e, snapshots: K$1, suggestions: ge, templateOverrides: Me, users: yi, vantageTypeEnum: ai, zoneManagementEnum: lr }, Symbol.toStringTag, { value: "Module" }));
function wi(e, t) {
  var _a2;
  const n = (_a2 = e.env) == null ? void 0 : _a2[t];
  return typeof n == "string" ? n : process.env[t];
}
function vi(e) {
  if (!e) return {};
  const t = {}, n = e.split(";");
  for (const r of n) {
    const s = r.trim();
    if (!s) continue;
    const i = s.indexOf("=");
    if (i === -1) continue;
    const o = s.slice(0, i).trim(), a = s.slice(i + 1).trim();
    o && (t[o] = a);
  }
  return t;
}
function Gn(e) {
  const t = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, n = /^[a-zA-Z0-9_.-]{1,64}$/;
  return t.test(e) || n.test(e);
}
async function Ii(e) {
  const t = e.get("db");
  if (!t) return null;
  const r = vi(e.req.header("Cookie")).dns_ops_session;
  if (!r) return null;
  try {
    const s = await t.getDrizzle().query.sessions.findFirst({ where: and(eq(Ge.token, r), gt$2(Ge.expiresAt, /* @__PURE__ */ new Date())) });
    return s ? { tenantId: s.tenantId, actorId: s.userEmail, actorEmail: s.userEmail } : null;
  } catch {
    return null;
  }
}
function _i(e) {
  var _a2;
  const t = e.req.header("CF-Access-Authenticated-User-Email"), n = e.req.header("CF-Access-Authenticated-User-Id");
  if (!t || !n || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  const s = (_a2 = t.split("@")[1]) == null ? void 0 : _a2.toLowerCase();
  return s ? { tenantId: s, actorId: n, actorEmail: t } : null;
}
function bi(e) {
  const n = vi(e.req.header("Cookie")).dns_ops_session;
  if (!n) return null;
  const r = decodeURIComponent(n), s = r.indexOf(":");
  if (s === -1) return null;
  const i = r.slice(0, s), o = r.slice(s + 1);
  return !i || !o || !Gn(o) ? null : { tenantId: o, actorId: i, actorEmail: i };
}
function Si(e) {
  const t = e.req.header("X-API-Key");
  if (!t) return null;
  const n = t.split(":");
  if (n.length < 3) return null;
  const [r, s, i] = n, o = wi(e, "API_KEY_SECRET");
  return !o || i !== o || !r || !s || !Gn(r) || !Gn(s) ? null : { tenantId: r, actorId: s };
}
function Ai(e) {
  return null;
}
const Uo = createMiddleware(async (e, t) => {
  let n = await Ii(e);
  if (n || (n = _i(e) || bi(e) || Si(e) || Ai()), n) {
    let r;
    try {
      r = Ti(n.tenantId) ? n.tenantId : await Qt$1(n.tenantId);
    } catch {
      return e.json({ error: "Unauthorized", message: "Invalid tenant context." }, 401);
    }
    e.set("tenantId", r), e.set("actorId", n.actorId), n.actorEmail && e.set("actorEmail", n.actorEmail);
  }
  return t();
}), Vo = createMiddleware(async (e, t) => {
  let n = await Ii(e);
  if (n || (n = _i(e) || bi(e) || Si(e) || Ai()), !n) return e.json({ error: "Unauthorized", message: "Authentication required." }, 401);
  let r;
  try {
    r = Ti(n.tenantId) ? n.tenantId : await Qt$1(n.tenantId);
  } catch {
    return e.json({ error: "Unauthorized", message: "Invalid tenant context." }, 401);
  }
  return e.set("tenantId", r), e.set("actorId", n.actorId), n.actorEmail && e.set("actorEmail", n.actorEmail), t();
});
createMiddleware(async (e, t) => {
  const n = e.req.header("X-Internal-Secret"), r = wi(e, "INTERNAL_SECRET");
  if (r && n === r) {
    const o = await Qt$1("system");
    e.set("tenantId", o), e.set("actorId", "internal-service"), await t();
    return;
  }
  const s = e.req.header("CF-Access-Authenticated-User-Email"), i = e.req.header("CF-Access-Authenticated-User-Id");
  if (s && i && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    const a = s.split("@")[1];
    if (a) {
      const u = await Qt$1(a);
      e.set("tenantId", u), e.set("actorId", i), e.set("actorEmail", s), await t();
      return;
    }
  }
  return e.json({ error: "Forbidden", message: "Internal access only." }, 403);
});
function Ti(e) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e);
}
const $ = createMiddleware(async (e, t) => {
  const n = e.get("tenantId"), r = e.get("actorId");
  return n ? r ? t() : e.json({ error: "Unauthorized", message: "Actor context required. Authentication may have failed or was not provided." }, 401) : e.json({ error: "Unauthorized", message: "Tenant context required. Authentication may have failed or was not provided." }, 401);
}), G = createMiddleware(async (e, t) => {
  const n = e.get("tenantId"), r = e.get("actorId");
  return n ? !r || r === "unknown" || r === "system" ? e.json({ error: "Forbidden", message: "Valid actor identity required for write operations." }, 403) : t() : e.json({ error: "Unauthorized", message: "Tenant context required for write operations." }, 401);
}), Ue = createMiddleware(async (e, t) => {
  const n = e.get("tenantId"), r = e.get("actorId"), s = e.get("actorEmail");
  if (!n || !r) return e.json({ error: "Unauthorized", message: "Authentication required for admin operations." }, 401);
  const i = e.req.header("X-Internal-Secret"), o = process.env.INTERNAL_SECRET;
  return o && i === o || e.req.header("CF-Access-Authenticated-User-Email") || s ? t() : e.json({ error: "Forbidden", message: "Admin access required for this operation." }, 403);
});
createMiddleware(async (e, t) => {
  const n = e.get("tenantId");
  return n ? (e.set("tenantId", n), t()) : e.json({ error: "Unauthorized", message: "Tenant context required." }, 401);
});
var ln = { exports: {} }, pn = { exports: {} }, ut$1 = {}, fn = {}, Nr;
function Ri() {
  if (Nr) return fn;
  Nr = 1, fn.parse = function(n, r) {
    return new e(n, r).parse();
  };
  class e {
    constructor(r, s) {
      this.source = r, this.transform = s || t, this.position = 0, this.entries = [], this.recorded = [], this.dimension = 0;
    }
    isEof() {
      return this.position >= this.source.length;
    }
    nextCharacter() {
      var r = this.source[this.position++];
      return r === "\\" ? { value: this.source[this.position++], escaped: true } : { value: r, escaped: false };
    }
    record(r) {
      this.recorded.push(r);
    }
    newEntry(r) {
      var s;
      (this.recorded.length > 0 || r) && (s = this.recorded.join(""), s === "NULL" && !r && (s = null), s !== null && (s = this.transform(s)), this.entries.push(s), this.recorded = []);
    }
    consumeDimensions() {
      if (this.source[0] === "[") for (; !this.isEof(); ) {
        var r = this.nextCharacter();
        if (r.value === "=") break;
      }
    }
    parse(r) {
      var s, i, o;
      for (this.consumeDimensions(); !this.isEof(); ) if (s = this.nextCharacter(), s.value === "{" && !o) this.dimension++, this.dimension > 1 && (i = new e(this.source.substr(this.position - 1), this.transform), this.entries.push(i.parse(true)), this.position += i.position - 2);
      else if (s.value === "}" && !o) {
        if (this.dimension--, !this.dimension && (this.newEntry(), r)) return this.entries;
      } else s.value === '"' && !s.escaped ? (o && this.newEntry(true), o = !o) : s.value === "," && !o ? this.newEntry() : this.record(s.value);
      if (this.dimension !== 0) throw new Error("array dimension not balanced");
      return this.entries;
    }
  }
  function t(n) {
    return n;
  }
  return fn;
}
var mn, Cr;
function Ei() {
  if (Cr) return mn;
  Cr = 1;
  var e = Ri();
  return mn = { create: function(t, n) {
    return { parse: function() {
      return e.parse(t, n);
    } };
  } }, mn;
}
var hn, kr;
function zo() {
  if (kr) return hn;
  kr = 1;
  var e = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/, t = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/, n = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/, r = /^-?infinity$/;
  hn = function(d) {
    if (r.test(d)) return Number(d.replace("i", "I"));
    var c = e.exec(d);
    if (!c) return s(d) || null;
    var p = !!c[8], l = parseInt(c[1], 10);
    p && (l = o(l));
    var f = parseInt(c[2], 10) - 1, h = c[3], y = parseInt(c[4], 10), v = parseInt(c[5], 10), m = parseInt(c[6], 10), w = c[7];
    w = w ? 1e3 * parseFloat(w) : 0;
    var S, A = i(d);
    return A != null ? (S = new Date(Date.UTC(l, f, h, y, v, m, w)), a(l) && S.setUTCFullYear(l), A !== 0 && S.setTime(S.getTime() - A)) : (S = new Date(l, f, h, y, v, m, w), a(l) && S.setFullYear(l)), S;
  };
  function s(u) {
    var d = t.exec(u);
    if (d) {
      var c = parseInt(d[1], 10), p = !!d[4];
      p && (c = o(c));
      var l = parseInt(d[2], 10) - 1, f = d[3], h = new Date(c, l, f);
      return a(c) && h.setFullYear(c), h;
    }
  }
  function i(u) {
    if (u.endsWith("+00")) return 0;
    var d = n.exec(u.split(" ")[1]);
    if (d) {
      var c = d[1];
      if (c === "Z") return 0;
      var p = c === "-" ? -1 : 1, l = parseInt(d[2], 10) * 3600 + parseInt(d[3] || 0, 10) * 60 + parseInt(d[4] || 0, 10);
      return l * p * 1e3;
    }
  }
  function o(u) {
    return -(u - 1);
  }
  function a(u) {
    return u >= 0 && u < 100;
  }
  return hn;
}
var gn, Mr;
function Xo() {
  if (Mr) return gn;
  Mr = 1, gn = t;
  var e = Object.prototype.hasOwnProperty;
  function t(n) {
    for (var r = 1; r < arguments.length; r++) {
      var s = arguments[r];
      for (var i in s) e.call(s, i) && (n[i] = s[i]);
    }
    return n;
  }
  return gn;
}
var yn, xr;
function Qo() {
  if (xr) return yn;
  xr = 1;
  var e = Xo();
  yn = t;
  function t(v) {
    if (!(this instanceof t)) return new t(v);
    e(this, y(v));
  }
  var n = ["seconds", "minutes", "hours", "days", "months", "years"];
  t.prototype.toPostgres = function() {
    var v = n.filter(this.hasOwnProperty, this);
    return this.milliseconds && v.indexOf("seconds") < 0 && v.push("seconds"), v.length === 0 ? "0" : v.map(function(m) {
      var w = this[m] || 0;
      return m === "seconds" && this.milliseconds && (w = (w + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "")), w + " " + m;
    }, this).join(" ");
  };
  var r = { years: "Y", months: "M", days: "D", hours: "H", minutes: "M", seconds: "S" }, s = ["years", "months", "days"], i = ["hours", "minutes", "seconds"];
  t.prototype.toISOString = t.prototype.toISO = function() {
    var v = s.map(w, this).join(""), m = i.map(w, this).join("");
    return "P" + v + "T" + m;
    function w(S) {
      var A = this[S] || 0;
      return S === "seconds" && this.milliseconds && (A = (A + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "")), A + r[S];
    }
  };
  var o = "([+-]?\\d+)", a = o + "\\s+years?", u = o + "\\s+mons?", d = o + "\\s+days?", c = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?", p = new RegExp([a, u, d, c].map(function(v) {
    return "(" + v + ")?";
  }).join("\\s*")), l = { years: 2, months: 4, days: 6, hours: 9, minutes: 10, seconds: 11, milliseconds: 12 }, f = ["hours", "minutes", "seconds", "milliseconds"];
  function h(v) {
    var m = v + "000000".slice(v.length);
    return parseInt(m, 10) / 1e3;
  }
  function y(v) {
    if (!v) return {};
    var m = p.exec(v), w = m[8] === "-";
    return Object.keys(l).reduce(function(S, A) {
      var q = l[A], R = m[q];
      return !R || (R = A === "milliseconds" ? h(R) : parseInt(R, 10), !R) || (w && ~f.indexOf(A) && (R *= -1), S[A] = R), S;
    }, {});
  }
  return yn;
}
var wn, jr;
function Ko() {
  if (jr) return wn;
  jr = 1;
  var e = Buffer.from || Buffer;
  return wn = function(n) {
    if (/^\\x/.test(n)) return e(n.substr(2), "hex");
    for (var r = "", s = 0; s < n.length; ) if (n[s] !== "\\") r += n[s], ++s;
    else if (/[0-7]{3}/.test(n.substr(s + 1, 3))) r += String.fromCharCode(parseInt(n.substr(s + 1, 3), 8)), s += 4;
    else {
      for (var i = 1; s + i < n.length && n[s + i] === "\\"; ) i++;
      for (var o = 0; o < Math.floor(i / 2); ++o) r += "\\";
      s += Math.floor(i / 2) * 2;
    }
    return e(r, "binary");
  }, wn;
}
var vn, Lr;
function Wo() {
  if (Lr) return vn;
  Lr = 1;
  var e = Ri(), t = Ei(), n = zo(), r = Qo(), s = Ko();
  function i(g) {
    return function(I) {
      return I === null ? I : g(I);
    };
  }
  function o(g) {
    return g === null ? g : g === "TRUE" || g === "t" || g === "true" || g === "y" || g === "yes" || g === "on" || g === "1";
  }
  function a(g) {
    return g ? e.parse(g, o) : null;
  }
  function u(g) {
    return parseInt(g, 10);
  }
  function d(g) {
    return g ? e.parse(g, i(u)) : null;
  }
  function c(g) {
    return g ? e.parse(g, i(function(b) {
      return w(b).trim();
    })) : null;
  }
  var p = function(g) {
    if (!g) return null;
    var b = t.create(g, function(I) {
      return I !== null && (I = A(I)), I;
    });
    return b.parse();
  }, l = function(g) {
    if (!g) return null;
    var b = t.create(g, function(I) {
      return I !== null && (I = parseFloat(I)), I;
    });
    return b.parse();
  }, f = function(g) {
    if (!g) return null;
    var b = t.create(g);
    return b.parse();
  }, h = function(g) {
    if (!g) return null;
    var b = t.create(g, function(I) {
      return I !== null && (I = n(I)), I;
    });
    return b.parse();
  }, y = function(g) {
    if (!g) return null;
    var b = t.create(g, function(I) {
      return I !== null && (I = r(I)), I;
    });
    return b.parse();
  }, v = function(g) {
    return g ? e.parse(g, i(s)) : null;
  }, m = function(g) {
    return parseInt(g, 10);
  }, w = function(g) {
    var b = String(g);
    return /^\d+$/.test(b) ? b : g;
  }, S = function(g) {
    return g ? e.parse(g, i(JSON.parse)) : null;
  }, A = function(g) {
    return g[0] !== "(" ? null : (g = g.substring(1, g.length - 1).split(","), { x: parseFloat(g[0]), y: parseFloat(g[1]) });
  }, q = function(g) {
    if (g[0] !== "<" && g[1] !== "(") return null;
    for (var b = "(", I = "", E = false, x = 2; x < g.length - 1; x++) {
      if (E || (b += g[x]), g[x] === ")") {
        E = true;
        continue;
      } else if (!E) continue;
      g[x] !== "," && (I += g[x]);
    }
    var k = A(b);
    return k.radius = parseFloat(I), k;
  }, R = function(g) {
    g(20, w), g(21, m), g(23, m), g(26, m), g(700, parseFloat), g(701, parseFloat), g(16, o), g(1082, n), g(1114, n), g(1184, n), g(600, A), g(651, f), g(718, q), g(1e3, a), g(1001, v), g(1005, d), g(1007, d), g(1028, d), g(1016, c), g(1017, p), g(1021, l), g(1022, l), g(1231, l), g(1014, f), g(1015, f), g(1008, f), g(1009, f), g(1040, f), g(1041, f), g(1115, h), g(1182, h), g(1185, h), g(1186, r), g(1187, y), g(17, s), g(114, JSON.parse.bind(JSON)), g(3802, JSON.parse.bind(JSON)), g(199, S), g(3807, S), g(3907, f), g(2951, f), g(791, f), g(1183, f), g(1270, f);
  };
  return vn = { init: R }, vn;
}
var In, Pr;
function Go() {
  if (Pr) return In;
  Pr = 1;
  var e = 1e6;
  function t(n) {
    var r = n.readInt32BE(0), s = n.readUInt32BE(4), i = "";
    r < 0 && (r = ~r + (s === 0), s = ~s + 1 >>> 0, i = "-");
    var o = "", a, u, d, c, p, l;
    {
      if (a = r % e, r = r / e >>> 0, u = 4294967296 * a + s, s = u / e >>> 0, d = "" + (u - e * s), s === 0 && r === 0) return i + d + o;
      for (c = "", p = 6 - d.length, l = 0; l < p; l++) c += "0";
      o = c + d + o;
    }
    {
      if (a = r % e, r = r / e >>> 0, u = 4294967296 * a + s, s = u / e >>> 0, d = "" + (u - e * s), s === 0 && r === 0) return i + d + o;
      for (c = "", p = 6 - d.length, l = 0; l < p; l++) c += "0";
      o = c + d + o;
    }
    {
      if (a = r % e, r = r / e >>> 0, u = 4294967296 * a + s, s = u / e >>> 0, d = "" + (u - e * s), s === 0 && r === 0) return i + d + o;
      for (c = "", p = 6 - d.length, l = 0; l < p; l++) c += "0";
      o = c + d + o;
    }
    return a = r % e, u = 4294967296 * a + s, d = "" + u % e, i + d + o;
  }
  return In = t, In;
}
var _n, Or;
function Ho() {
  if (Or) return _n;
  Or = 1;
  var e = Go(), t = function(f, h, y, v, m) {
    y = y || 0, v = v || false, m = m || function(E, x, k) {
      return E * Math.pow(2, k) + x;
    };
    var w = y >> 3, S = function(E) {
      return v ? ~E & 255 : E;
    }, A = 255, q = 8 - y % 8;
    h < q && (A = 255 << 8 - h & 255, q = h), y && (A = A >> y % 8);
    var R = 0;
    y % 8 + h >= 8 && (R = m(0, S(f[w]) & A, q));
    for (var g = h + y >> 3, b = w + 1; b < g; b++) R = m(R, S(f[b]), 8);
    var I = (h + y) % 8;
    return I > 0 && (R = m(R, S(f[g]) >> 8 - I, I)), R;
  }, n = function(f, h, y) {
    var v = Math.pow(2, y - 1) - 1, m = t(f, 1), w = t(f, y, 1);
    if (w === 0) return 0;
    var S = 1, A = function(R, g, b) {
      R === 0 && (R = 1);
      for (var I = 1; I <= b; I++) S /= 2, (g & 1 << b - I) > 0 && (R += S);
      return R;
    }, q = t(f, h, y + 1, false, A);
    return w == Math.pow(2, y + 1) - 1 ? q === 0 ? m === 0 ? 1 / 0 : -1 / 0 : NaN : (m === 0 ? 1 : -1) * Math.pow(2, w - v) * q;
  }, r = function(f) {
    return t(f, 1) == 1 ? -1 * (t(f, 15, 1, true) + 1) : t(f, 15, 1);
  }, s = function(f) {
    return t(f, 1) == 1 ? -1 * (t(f, 31, 1, true) + 1) : t(f, 31, 1);
  }, i = function(f) {
    return n(f, 23, 8);
  }, o = function(f) {
    return n(f, 52, 11);
  }, a = function(f) {
    var h = t(f, 16, 32);
    if (h == 49152) return NaN;
    for (var y = Math.pow(1e4, t(f, 16, 16)), v = 0, m = t(f, 16), w = 0; w < m; w++) v += t(f, 16, 64 + 16 * w) * y, y /= 1e4;
    var S = Math.pow(10, t(f, 16, 48));
    return (h === 0 ? 1 : -1) * Math.round(v * S) / S;
  }, u = function(f, h) {
    var y = t(h, 1), v = t(h, 63, 1), m = new Date((y === 0 ? 1 : -1) * v / 1e3 + 9466848e5);
    return f || m.setTime(m.getTime() + m.getTimezoneOffset() * 6e4), m.usec = v % 1e3, m.getMicroSeconds = function() {
      return this.usec;
    }, m.setMicroSeconds = function(w) {
      this.usec = w;
    }, m.getUTCMicroSeconds = function() {
      return this.usec;
    }, m;
  }, d = function(f) {
    var h = t(f, 32);
    t(f, 32, 32);
    for (var y = t(f, 32, 64), v = 96, m = [], w = 0; w < h; w++) m[w] = t(f, 32, v), v += 32, v += 32;
    var S = function(q) {
      var R = t(f, 32, v);
      if (v += 32, R == 4294967295) return null;
      var g;
      if (q == 23 || q == 20) return g = t(f, R * 8, v), v += R * 8, g;
      if (q == 25) return g = f.toString(this.encoding, v >> 3, (v += R << 3) >> 3), g;
      console.log("ERROR: ElementType not implemented: " + q);
    }, A = function(q, R) {
      var g = [], b;
      if (q.length > 1) {
        var I = q.shift();
        for (b = 0; b < I; b++) g[b] = A(q, R);
        q.unshift(I);
      } else for (b = 0; b < q[0]; b++) g[b] = S(R);
      return g;
    };
    return A(m, y);
  }, c = function(f) {
    return f.toString("utf8");
  }, p = function(f) {
    return f === null ? null : t(f, 8) > 0;
  }, l = function(f) {
    f(20, e), f(21, r), f(23, s), f(26, s), f(1700, a), f(700, i), f(701, o), f(16, p), f(1114, u.bind(null, false)), f(1184, u.bind(null, true)), f(1e3, d), f(1007, d), f(1016, d), f(1008, d), f(1009, d), f(25, c);
  };
  return _n = { init: l }, _n;
}
var bn, Br;
function Yo() {
  return Br || (Br = 1, bn = { BOOL: 16, BYTEA: 17, CHAR: 18, INT8: 20, INT2: 21, INT4: 23, REGPROC: 24, TEXT: 25, OID: 26, TID: 27, XID: 28, CID: 29, JSON: 114, XML: 142, PG_NODE_TREE: 194, SMGR: 210, PATH: 602, POLYGON: 604, CIDR: 650, FLOAT4: 700, FLOAT8: 701, ABSTIME: 702, RELTIME: 703, TINTERVAL: 704, CIRCLE: 718, MACADDR8: 774, MONEY: 790, MACADDR: 829, INET: 869, ACLITEM: 1033, BPCHAR: 1042, VARCHAR: 1043, DATE: 1082, TIME: 1083, TIMESTAMP: 1114, TIMESTAMPTZ: 1184, INTERVAL: 1186, TIMETZ: 1266, BIT: 1560, VARBIT: 1562, NUMERIC: 1700, REFCURSOR: 1790, REGPROCEDURE: 2202, REGOPER: 2203, REGOPERATOR: 2204, REGCLASS: 2205, REGTYPE: 2206, UUID: 2950, TXID_SNAPSHOT: 2970, PG_LSN: 3220, PG_NDISTINCT: 3361, PG_DEPENDENCIES: 3402, TSVECTOR: 3614, TSQUERY: 3615, GTSVECTOR: 3642, REGCONFIG: 3734, REGDICTIONARY: 3769, JSONB: 3802, REGNAMESPACE: 4089, REGROLE: 4096 }), bn;
}
var Fr;
function Zt$1() {
  if (Fr) return ut$1;
  Fr = 1;
  var e = Wo(), t = Ho(), n = Ei(), r = Yo();
  ut$1.getTypeParser = o, ut$1.setTypeParser = a, ut$1.arrayParser = n, ut$1.builtins = r;
  var s = { text: {}, binary: {} };
  function i(u) {
    return String(u);
  }
  function o(u, d) {
    return d = d || "text", s[d] && s[d][u] || i;
  }
  function a(u, d, c) {
    typeof d == "function" && (c = d, d = "text"), s[d][u] = c;
  }
  return e.init(function(u, d) {
    s.text[u] = d;
  }), t.init(function(u, d) {
    s.binary[u] = d;
  }), ut$1;
}
var $r;
function Jt$1() {
  return $r || ($r = 1, (function(e) {
    let t;
    try {
      t = process.platform === "win32" ? process.env.USERNAME : process.env.USER;
    } catch {
    }
    e.exports = { host: "localhost", user: t, database: void 0, password: null, connectionString: void 0, port: 5432, rows: 0, binary: false, max: 10, idleTimeoutMillis: 3e4, client_encoding: "", ssl: false, application_name: void 0, fallback_application_name: void 0, options: void 0, parseInputDatesAsUTC: false, statement_timeout: false, lock_timeout: false, idle_in_transaction_session_timeout: false, query_timeout: false, connect_timeout: 0, keepalives: 1, keepalives_idle: 0 };
    const n = Zt$1(), r = n.getTypeParser(20, "text"), s = n.getTypeParser(1016, "text");
    e.exports.__defineSetter__("parseInt8", function(i) {
      n.setTypeParser(20, "text", i ? n.getTypeParser(23, "text") : r), n.setTypeParser(1016, "text", i ? n.getTypeParser(1007, "text") : s);
    });
  })(pn)), pn.exports;
}
var Sn, Ur;
function kt$1() {
  if (Ur) return Sn;
  Ur = 1;
  const e = Jt$1(), t = yt$1, { isDate: n } = t.types || t;
  function r(l) {
    return '"' + l.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  function s(l) {
    let f = "{";
    for (let h = 0; h < l.length; h++) if (h > 0 && (f = f + ","), l[h] === null || typeof l[h] > "u") f = f + "NULL";
    else if (Array.isArray(l[h])) f = f + s(l[h]);
    else if (ArrayBuffer.isView(l[h])) {
      let y = l[h];
      if (!(y instanceof Buffer)) {
        const v = Buffer.from(y.buffer, y.byteOffset, y.byteLength);
        v.length === y.byteLength ? y = v : y = v.slice(y.byteOffset, y.byteOffset + y.byteLength);
      }
      f += "\\\\x" + y.toString("hex");
    } else f += r(i(l[h]));
    return f = f + "}", f;
  }
  const i = function(l, f) {
    if (l == null) return null;
    if (typeof l == "object") {
      if (l instanceof Buffer) return l;
      if (ArrayBuffer.isView(l)) {
        const h = Buffer.from(l.buffer, l.byteOffset, l.byteLength);
        return h.length === l.byteLength ? h : h.slice(l.byteOffset, l.byteOffset + l.byteLength);
      }
      return n(l) ? e.parseInputDatesAsUTC ? u(l) : a(l) : Array.isArray(l) ? s(l) : o(l, f);
    }
    return l.toString();
  };
  function o(l, f) {
    if (l && typeof l.toPostgres == "function") {
      if (f = f || [], f.indexOf(l) !== -1) throw new Error('circular reference detected while preparing "' + l + '" for query');
      return f.push(l), i(l.toPostgres(i), f);
    }
    return JSON.stringify(l);
  }
  function a(l) {
    let f = -l.getTimezoneOffset(), h = l.getFullYear();
    const y = h < 1;
    y && (h = Math.abs(h) + 1);
    let v = String(h).padStart(4, "0") + "-" + String(l.getMonth() + 1).padStart(2, "0") + "-" + String(l.getDate()).padStart(2, "0") + "T" + String(l.getHours()).padStart(2, "0") + ":" + String(l.getMinutes()).padStart(2, "0") + ":" + String(l.getSeconds()).padStart(2, "0") + "." + String(l.getMilliseconds()).padStart(3, "0");
    return f < 0 ? (v += "-", f *= -1) : v += "+", v += String(Math.floor(f / 60)).padStart(2, "0") + ":" + String(f % 60).padStart(2, "0"), y && (v += " BC"), v;
  }
  function u(l) {
    let f = l.getUTCFullYear();
    const h = f < 1;
    h && (f = Math.abs(f) + 1);
    let y = String(f).padStart(4, "0") + "-" + String(l.getUTCMonth() + 1).padStart(2, "0") + "-" + String(l.getUTCDate()).padStart(2, "0") + "T" + String(l.getUTCHours()).padStart(2, "0") + ":" + String(l.getUTCMinutes()).padStart(2, "0") + ":" + String(l.getUTCSeconds()).padStart(2, "0") + "." + String(l.getUTCMilliseconds()).padStart(3, "0");
    return y += "+00:00", h && (y += " BC"), y;
  }
  function d(l, f, h) {
    return l = typeof l == "string" ? { text: l } : l, f && (typeof f == "function" ? l.callback = f : l.values = f), h && (l.callback = h), l;
  }
  return Sn = { prepareValue: function(f) {
    return i(f);
  }, normalizeQueryConfig: d, escapeIdentifier: function(l) {
    return '"' + l.replace(/"/g, '""') + '"';
  }, escapeLiteral: function(l) {
    let f = false, h = "'";
    if (l == null || typeof l != "string") return "''";
    for (let y = 0; y < l.length; y++) {
      const v = l[y];
      v === "'" ? h += v + v : v === "\\" ? (h += v + v, f = true) : h += v;
    }
    return h += "'", f === true && (h = " E" + h), h;
  } }, Sn;
}
var Ft$1 = { exports: {} }, An, Vr;
function Zo() {
  if (Vr) return An;
  Vr = 1;
  const e = require$$1;
  function t(a) {
    return e.createHash("md5").update(a, "utf-8").digest("hex");
  }
  function n(a, u, d) {
    const c = t(u + a);
    return "md5" + t(Buffer.concat([Buffer.from(c), d]));
  }
  function r(a) {
    return e.createHash("sha256").update(a).digest();
  }
  function s(a, u) {
    return a = a.replace(/(\D)-/, "$1"), e.createHash(a).update(u).digest();
  }
  function i(a, u) {
    return e.createHmac("sha256", a).update(u).digest();
  }
  async function o(a, u, d) {
    return e.pbkdf2Sync(a, u, d, 32, "sha256");
  }
  return An = { postgresMd5PasswordHash: n, randomBytes: e.randomBytes, deriveKey: o, sha256: r, hashByName: s, hmacSha256: i, md5: t }, An;
}
var Tn, zr;
function Jo() {
  if (zr) return Tn;
  zr = 1;
  const e = require$$1;
  Tn = { postgresMd5PasswordHash: o, randomBytes: s, deriveKey: c, sha256: a, hashByName: u, hmacSha256: d, md5: i };
  const t = e.webcrypto || globalThis.crypto, n = t.subtle, r = new TextEncoder();
  function s(p) {
    return t.getRandomValues(Buffer.alloc(p));
  }
  async function i(p) {
    try {
      return e.createHash("md5").update(p, "utf-8").digest("hex");
    } catch {
      const f = typeof p == "string" ? r.encode(p) : p, h = await n.digest("MD5", f);
      return Array.from(new Uint8Array(h)).map((y) => y.toString(16).padStart(2, "0")).join("");
    }
  }
  async function o(p, l, f) {
    const h = await i(l + p);
    return "md5" + await i(Buffer.concat([Buffer.from(h), f]));
  }
  async function a(p) {
    return await n.digest("SHA-256", p);
  }
  async function u(p, l) {
    return await n.digest(p, l);
  }
  async function d(p, l) {
    const f = await n.importKey("raw", p, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return await n.sign("HMAC", f, r.encode(l));
  }
  async function c(p, l, f) {
    const h = await n.importKey("raw", r.encode(p), "PBKDF2", false, ["deriveBits"]), y = { name: "PBKDF2", hash: "SHA-256", salt: l, iterations: f };
    return await n.deriveBits(y, h, 256, ["deriveBits"]);
  }
  return Tn;
}
var Xr;
function Di() {
  return Xr || (Xr = 1, parseInt(process.versions && process.versions.node && process.versions.node.split(".")[0]) < 15 ? Ft$1.exports = Zo() : Ft$1.exports = Jo()), Ft$1.exports;
}
var Rn, Qr;
function ea() {
  if (Qr) return Rn;
  Qr = 1;
  function e(i, o) {
    return new Error("SASL channel binding: " + i + " when parsing public certificate " + o.toString("base64"));
  }
  function t(i, o) {
    let a = i[o++];
    if (a < 128) return { length: a, index: o };
    const u = a & 127;
    if (u > 4) throw e("bad length", i);
    a = 0;
    for (let d = 0; d < u; d++) a = a << 8 | i[o++];
    return { length: a, index: o };
  }
  function n(i, o) {
    if (i[o++] !== 6) throw e("non-OID data", i);
    const { length: a, index: u } = t(i, o);
    o = u;
    const d = o + a, c = i[o++];
    let p = (c / 40 >> 0) + "." + c % 40;
    for (; o < d; ) {
      let l = 0;
      for (; o < d; ) {
        const f = i[o++];
        if (l = l << 7 | f & 127, f < 128) break;
      }
      p += "." + l;
    }
    return { oid: p, index: o };
  }
  function r(i, o) {
    if (i[o++] !== 48) throw e("non-sequence data", i);
    return t(i, o);
  }
  function s(i, o) {
    o === void 0 && (o = 0), o = r(i, o).index;
    const { length: a, index: u } = r(i, o);
    o = u + a, o = r(i, o).index;
    const { oid: d, index: c } = n(i, o);
    switch (d) {
      case "1.2.840.113549.1.1.4":
        return "MD5";
      case "1.2.840.113549.1.1.5":
        return "SHA-1";
      case "1.2.840.113549.1.1.11":
        return "SHA-256";
      case "1.2.840.113549.1.1.12":
        return "SHA-384";
      case "1.2.840.113549.1.1.13":
        return "SHA-512";
      case "1.2.840.113549.1.1.14":
        return "SHA-224";
      case "1.2.840.113549.1.1.15":
        return "SHA512-224";
      case "1.2.840.113549.1.1.16":
        return "SHA512-256";
      case "1.2.840.10045.4.1":
        return "SHA-1";
      case "1.2.840.10045.4.3.1":
        return "SHA-224";
      case "1.2.840.10045.4.3.2":
        return "SHA-256";
      case "1.2.840.10045.4.3.3":
        return "SHA-384";
      case "1.2.840.10045.4.3.4":
        return "SHA-512";
      case "1.2.840.113549.1.1.10": {
        if (o = c, o = r(i, o).index, i[o++] !== 160) throw e("non-tag data", i);
        o = t(i, o).index, o = r(i, o).index;
        const { oid: p } = n(i, o);
        switch (p) {
          case "1.2.840.113549.2.5":
            return "MD5";
          case "1.3.14.3.2.26":
            return "SHA-1";
          case "2.16.840.1.101.3.4.2.1":
            return "SHA-256";
          case "2.16.840.1.101.3.4.2.2":
            return "SHA-384";
          case "2.16.840.1.101.3.4.2.3":
            return "SHA-512";
        }
        throw e("unknown hash OID " + p, i);
      }
      case "1.3.101.110":
      case "1.3.101.112":
        return "SHA-512";
      case "1.3.101.111":
      case "1.3.101.113":
        throw e("Ed448 certificate channel binding is not currently supported by Postgres");
    }
    throw e("unknown OID " + d, i);
  }
  return Rn = { signatureAlgorithmHashFromCertificate: s }, Rn;
}
var En, Kr;
function ta() {
  if (Kr) return En;
  Kr = 1;
  const e = Di(), { signatureAlgorithmHashFromCertificate: t } = ea();
  function n(p, l) {
    const f = ["SCRAM-SHA-256"];
    l && f.unshift("SCRAM-SHA-256-PLUS");
    const h = f.find((m) => p.includes(m));
    if (!h) throw new Error("SASL: Only mechanism(s) " + f.join(" and ") + " are supported");
    if (h === "SCRAM-SHA-256-PLUS" && typeof l.getPeerCertificate != "function") throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");
    const y = e.randomBytes(18).toString("base64");
    return { mechanism: h, clientNonce: y, response: (h === "SCRAM-SHA-256-PLUS" ? "p=tls-server-end-point" : l ? "y" : "n") + ",,n=*,r=" + y, message: "SASLInitialResponse" };
  }
  async function r(p, l, f, h) {
    if (p.message !== "SASLInitialResponse") throw new Error("SASL: Last message was not SASLInitialResponse");
    if (typeof l != "string") throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
    if (l === "") throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
    if (typeof f != "string") throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
    const y = u(f);
    if (y.nonce.startsWith(p.clientNonce)) {
      if (y.nonce.length === p.clientNonce.length) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
    } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
    const v = "n=*,r=" + p.clientNonce, m = "r=" + y.nonce + ",s=" + y.salt + ",i=" + y.iteration;
    let w = h ? "eSws" : "biws";
    if (p.mechanism === "SCRAM-SHA-256-PLUS") {
      const _ = h.getPeerCertificate().raw;
      let M = t(_);
      (M === "MD5" || M === "SHA-1") && (M = "SHA-256");
      const N = await e.hashByName(M, _);
      w = Buffer.concat([Buffer.from("p=tls-server-end-point,,"), Buffer.from(N)]).toString("base64");
    }
    const S = "c=" + w + ",r=" + y.nonce, A = v + "," + m + "," + S, q = Buffer.from(y.salt, "base64"), R = await e.deriveKey(l, q, y.iteration), g = await e.hmacSha256(R, "Client Key"), b = await e.sha256(g), I = await e.hmacSha256(b, A), E = c(Buffer.from(g), Buffer.from(I)).toString("base64"), x = await e.hmacSha256(R, "Server Key"), k = await e.hmacSha256(x, A);
    p.message = "SASLResponse", p.serverSignature = Buffer.from(k).toString("base64"), p.response = S + ",p=" + E;
  }
  function s(p, l) {
    if (p.message !== "SASLResponse") throw new Error("SASL: Last message was not SASLResponse");
    if (typeof l != "string") throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
    const { serverSignature: f } = d(l);
    if (f !== p.serverSignature) throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
  }
  function i(p) {
    if (typeof p != "string") throw new TypeError("SASL: text must be a string");
    return p.split("").map((l, f) => p.charCodeAt(f)).every((l) => l >= 33 && l <= 43 || l >= 45 && l <= 126);
  }
  function o(p) {
    return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(p);
  }
  function a(p) {
    if (typeof p != "string") throw new TypeError("SASL: attribute pairs text must be a string");
    return new Map(p.split(",").map((l) => {
      if (!/^.=/.test(l)) throw new Error("SASL: Invalid attribute pair entry");
      const f = l[0], h = l.substring(2);
      return [f, h];
    }));
  }
  function u(p) {
    const l = a(p), f = l.get("r");
    if (f) {
      if (!i(f)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
    } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
    const h = l.get("s");
    if (h) {
      if (!o(h)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
    } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
    const y = l.get("i");
    if (y) {
      if (!/^[1-9][0-9]*$/.test(y)) throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
    } else throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
    const v = parseInt(y, 10);
    return { nonce: f, salt: h, iteration: v };
  }
  function d(p) {
    const f = a(p).get("v");
    if (f) {
      if (!o(f)) throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
    } else throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
    return { serverSignature: f };
  }
  function c(p, l) {
    if (!Buffer.isBuffer(p)) throw new TypeError("first argument must be a Buffer");
    if (!Buffer.isBuffer(l)) throw new TypeError("second argument must be a Buffer");
    if (p.length !== l.length) throw new Error("Buffer lengths must match");
    if (p.length === 0) throw new Error("Buffers cannot be empty");
    return Buffer.from(p.map((f, h) => p[h] ^ l[h]));
  }
  return En = { startSession: n, continueSession: r, finalizeSession: s }, En;
}
var Dn, Wr;
function pr() {
  if (Wr) return Dn;
  Wr = 1;
  const e = Zt$1();
  function t(n) {
    this._types = n || e, this.text = {}, this.binary = {};
  }
  return t.prototype.getOverrides = function(n) {
    switch (n) {
      case "text":
        return this.text;
      case "binary":
        return this.binary;
      default:
        return {};
    }
  }, t.prototype.setTypeParser = function(n, r, s) {
    typeof r == "function" && (s = r, r = "text"), this.getOverrides(r)[n] = s;
  }, t.prototype.getTypeParser = function(n, r) {
    return r = r || "text", this.getOverrides(r)[n] || this._types.getTypeParser(n, r);
  }, Dn = t, Dn;
}
var qn, Gr;
function na() {
  if (Gr) return qn;
  Gr = 1;
  function e(i, o = {}) {
    if (i.charAt(0) === "/") {
      const f = i.split(" ");
      return { host: f[0], database: f[1] };
    }
    const a = {};
    let u, d = false;
    / |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(i) && (i = encodeURI(i).replace(/%25(\d\d)/g, "%$1"));
    try {
      try {
        u = new URL(i, "postgres://base");
      } catch {
        u = new URL(i.replace("@/", "@___DUMMY___/"), "postgres://base"), d = true;
      }
    } catch (f) {
      throw f.input && (f.input = "*****REDACTED*****"), f;
    }
    for (const f of u.searchParams.entries()) a[f[0]] = f[1];
    if (a.user = a.user || decodeURIComponent(u.username), a.password = a.password || decodeURIComponent(u.password), u.protocol == "socket:") return a.host = decodeURI(u.pathname), a.database = u.searchParams.get("db"), a.client_encoding = u.searchParams.get("encoding"), a;
    const c = d ? "" : u.hostname;
    a.host ? c && /^%2f/i.test(c) && (u.pathname = c + u.pathname) : a.host = decodeURIComponent(c), a.port || (a.port = u.port);
    const p = u.pathname.slice(1) || null;
    a.database = p ? decodeURI(p) : null, (a.ssl === "true" || a.ssl === "1") && (a.ssl = true), a.ssl === "0" && (a.ssl = false), (a.sslcert || a.sslkey || a.sslrootcert || a.sslmode) && (a.ssl = {});
    const l = a.sslcert || a.sslkey || a.sslrootcert ? Us : null;
    if (a.sslcert && (a.ssl.cert = l.readFileSync(a.sslcert).toString()), a.sslkey && (a.ssl.key = l.readFileSync(a.sslkey).toString()), a.sslrootcert && (a.ssl.ca = l.readFileSync(a.sslrootcert).toString()), o.useLibpqCompat && a.uselibpqcompat) throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
    if (a.uselibpqcompat === "true" || o.useLibpqCompat) switch (a.sslmode) {
      case "disable": {
        a.ssl = false;
        break;
      }
      case "prefer": {
        a.ssl.rejectUnauthorized = false;
        break;
      }
      case "require": {
        a.sslrootcert ? a.ssl.checkServerIdentity = function() {
        } : a.ssl.rejectUnauthorized = false;
        break;
      }
      case "verify-ca": {
        if (!a.ssl.ca) throw new Error("SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security.");
        a.ssl.checkServerIdentity = function() {
        };
        break;
      }
    }
    else switch (a.sslmode) {
      case "disable": {
        a.ssl = false;
        break;
      }
      case "prefer":
      case "require":
      case "verify-ca":
      case "verify-full": {
        a.sslmode !== "verify-full" && s(a.sslmode);
        break;
      }
      case "no-verify": {
        a.ssl.rejectUnauthorized = false;
        break;
      }
    }
    return a;
  }
  function t(i) {
    return Object.entries(i).reduce((a, [u, d]) => (d != null && (a[u] = d), a), {});
  }
  function n(i) {
    return Object.entries(i).reduce((a, [u, d]) => {
      if (u === "ssl") {
        const c = d;
        typeof c == "boolean" && (a[u] = c), typeof c == "object" && (a[u] = t(c));
      } else if (d != null) if (u === "port") {
        if (d !== "") {
          const c = parseInt(d, 10);
          if (isNaN(c)) throw new Error(`Invalid ${u}: ${d}`);
          a[u] = c;
        }
      } else a[u] = d;
      return a;
    }, {});
  }
  function r(i) {
    return n(e(i));
  }
  function s(i) {
    !s.warned && typeof process < "u" && process.emitWarning && (s.warned = true, process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${i}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`));
  }
  return qn = e, e.parse = e, e.toClientConfig = n, e.parseIntoClientConfig = r, qn;
}
var Nn, Hr;
function qi() {
  if (Hr) return Nn;
  Hr = 1;
  const e = Yi, t = Jt$1(), n = na().parse, r = function(u, d, c) {
    return d[u] ? d[u] : (c === void 0 ? c = process.env["PG" + u.toUpperCase()] : c === false || (c = process.env[c]), c || t[u]);
  }, s = function() {
    switch (process.env.PGSSLMODE) {
      case "disable":
        return false;
      case "prefer":
      case "require":
      case "verify-ca":
      case "verify-full":
        return true;
      case "no-verify":
        return { rejectUnauthorized: false };
    }
    return t.ssl;
  }, i = function(u) {
    return "'" + ("" + u).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }, o = function(u, d, c) {
    const p = d[c];
    p != null && u.push(c + "=" + i(p));
  };
  class a {
    constructor(d) {
      d = typeof d == "string" ? n(d) : d || {}, d.connectionString && (d = Object.assign({}, d, n(d.connectionString))), this.user = r("user", d), this.database = r("database", d), this.database === void 0 && (this.database = this.user), this.port = parseInt(r("port", d), 10), this.host = r("host", d), Object.defineProperty(this, "password", { configurable: true, enumerable: false, writable: true, value: r("password", d) }), this.binary = r("binary", d), this.options = r("options", d), this.ssl = typeof d.ssl > "u" ? s() : d.ssl, typeof this.ssl == "string" && this.ssl === "true" && (this.ssl = true), this.ssl === "no-verify" && (this.ssl = { rejectUnauthorized: false }), this.ssl && this.ssl.key && Object.defineProperty(this.ssl, "key", { enumerable: false }), this.client_encoding = r("client_encoding", d), this.replication = r("replication", d), this.isDomainSocket = !(this.host || "").indexOf("/"), this.application_name = r("application_name", d, "PGAPPNAME"), this.fallback_application_name = r("fallback_application_name", d, false), this.statement_timeout = r("statement_timeout", d, false), this.lock_timeout = r("lock_timeout", d, false), this.idle_in_transaction_session_timeout = r("idle_in_transaction_session_timeout", d, false), this.query_timeout = r("query_timeout", d, false), d.connectionTimeoutMillis === void 0 ? this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0 : this.connect_timeout = Math.floor(d.connectionTimeoutMillis / 1e3), d.keepAlive === false ? this.keepalives = 0 : d.keepAlive === true && (this.keepalives = 1), typeof d.keepAliveInitialDelayMillis == "number" && (this.keepalives_idle = Math.floor(d.keepAliveInitialDelayMillis / 1e3));
    }
    getLibpqConnectionString(d) {
      const c = [];
      o(c, this, "user"), o(c, this, "password"), o(c, this, "port"), o(c, this, "application_name"), o(c, this, "fallback_application_name"), o(c, this, "connect_timeout"), o(c, this, "options");
      const p = typeof this.ssl == "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
      if (o(c, p, "sslmode"), o(c, p, "sslca"), o(c, p, "sslkey"), o(c, p, "sslcert"), o(c, p, "sslrootcert"), this.database && c.push("dbname=" + i(this.database)), this.replication && c.push("replication=" + i(this.replication)), this.host && c.push("host=" + i(this.host)), this.isDomainSocket) return d(null, c.join(" "));
      this.client_encoding && c.push("client_encoding=" + i(this.client_encoding)), e.lookup(this.host, function(l, f) {
        return l ? d(l, null) : (c.push("hostaddr=" + i(f)), d(null, c.join(" ")));
      });
    }
  }
  return Nn = a, Nn;
}
var Cn, Yr;
function Ni() {
  if (Yr) return Cn;
  Yr = 1;
  const e = Zt$1(), t = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
  class n {
    constructor(s, i) {
      this.command = null, this.rowCount = null, this.oid = null, this.rows = [], this.fields = [], this._parsers = void 0, this._types = i, this.RowCtor = null, this.rowAsArray = s === "array", this.rowAsArray && (this.parseRow = this._parseRowAsArray), this._prebuiltEmptyResultObject = null;
    }
    addCommandComplete(s) {
      let i;
      s.text ? i = t.exec(s.text) : i = t.exec(s.command), i && (this.command = i[1], i[3] ? (this.oid = parseInt(i[2], 10), this.rowCount = parseInt(i[3], 10)) : i[2] && (this.rowCount = parseInt(i[2], 10)));
    }
    _parseRowAsArray(s) {
      const i = new Array(s.length);
      for (let o = 0, a = s.length; o < a; o++) {
        const u = s[o];
        u !== null ? i[o] = this._parsers[o](u) : i[o] = null;
      }
      return i;
    }
    parseRow(s) {
      const i = { ...this._prebuiltEmptyResultObject };
      for (let o = 0, a = s.length; o < a; o++) {
        const u = s[o], d = this.fields[o].name;
        if (u !== null) {
          const c = this.fields[o].format === "binary" ? Buffer.from(u) : u;
          i[d] = this._parsers[o](c);
        } else i[d] = null;
      }
      return i;
    }
    addRow(s) {
      this.rows.push(s);
    }
    addFields(s) {
      this.fields = s, this.fields.length && (this._parsers = new Array(s.length));
      const i = {};
      for (let o = 0; o < s.length; o++) {
        const a = s[o];
        i[a.name] = null, this._types ? this._parsers[o] = this._types.getTypeParser(a.dataTypeID, a.format || "text") : this._parsers[o] = e.getTypeParser(a.dataTypeID, a.format || "text");
      }
      this._prebuiltEmptyResultObject = { ...i };
    }
  }
  return Cn = n, Cn;
}
var kn, Zr;
function ra() {
  if (Zr) return kn;
  Zr = 1;
  const { EventEmitter: e } = wt$1, t = Ni(), n = kt$1();
  class r extends e {
    constructor(i, o, a) {
      super(), i = n.normalizeQueryConfig(i, o, a), this.text = i.text, this.values = i.values, this.rows = i.rows, this.types = i.types, this.name = i.name, this.queryMode = i.queryMode, this.binary = i.binary, this.portal = i.portal || "", this.callback = i.callback, this._rowMode = i.rowMode, process.domain && i.callback && (this.callback = process.domain.bind(i.callback)), this._result = new t(this._rowMode, this.types), this._results = this._result, this._canceledDueToError = false;
    }
    requiresPreparation() {
      return this.queryMode === "extended" || this.name || this.rows ? true : !this.text || !this.values ? false : this.values.length > 0;
    }
    _checkForMultirow() {
      this._result.command && (Array.isArray(this._results) || (this._results = [this._result]), this._result = new t(this._rowMode, this._result._types), this._results.push(this._result));
    }
    handleRowDescription(i) {
      this._checkForMultirow(), this._result.addFields(i.fields), this._accumulateRows = this.callback || !this.listeners("row").length;
    }
    handleDataRow(i) {
      let o;
      if (!this._canceledDueToError) {
        try {
          o = this._result.parseRow(i.fields);
        } catch (a) {
          this._canceledDueToError = a;
          return;
        }
        this.emit("row", o, this._result), this._accumulateRows && this._result.addRow(o);
      }
    }
    handleCommandComplete(i, o) {
      this._checkForMultirow(), this._result.addCommandComplete(i), this.rows && o.sync();
    }
    handleEmptyQuery(i) {
      this.rows && i.sync();
    }
    handleError(i, o) {
      if (this._canceledDueToError && (i = this._canceledDueToError, this._canceledDueToError = false), this.callback) return this.callback(i);
      this.emit("error", i);
    }
    handleReadyForQuery(i) {
      if (this._canceledDueToError) return this.handleError(this._canceledDueToError, i);
      if (this.callback) try {
        this.callback(null, this._results);
      } catch (o) {
        process.nextTick(() => {
          throw o;
        });
      }
      this.emit("end", this._results);
    }
    submit(i) {
      if (typeof this.text != "string" && typeof this.name != "string") return new Error("A query must have either text or a name. Supplying neither is unsupported.");
      const o = i.parsedStatements[this.name];
      if (this.text && o && this.text !== o) return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
      if (this.values && !Array.isArray(this.values)) return new Error("Query values must be an array");
      if (this.requiresPreparation()) {
        i.stream.cork && i.stream.cork();
        try {
          this.prepare(i);
        } finally {
          i.stream.uncork && i.stream.uncork();
        }
      } else i.query(this.text);
      return null;
    }
    hasBeenParsed(i) {
      return this.name && i.parsedStatements[this.name];
    }
    handlePortalSuspended(i) {
      this._getRows(i, this.rows);
    }
    _getRows(i, o) {
      i.execute({ portal: this.portal, rows: o }), o ? i.flush() : i.sync();
    }
    prepare(i) {
      this.hasBeenParsed(i) || i.parse({ text: this.text, name: this.name, types: this.types });
      try {
        i.bind({ portal: this.portal, statement: this.name, values: this.values, binary: this.binary, valueMapper: n.prepareValue });
      } catch (o) {
        this.handleError(o, i);
        return;
      }
      i.describe({ type: "P", name: this.portal || "" }), this._getRows(i, this.rows);
    }
    handleCopyInResponse(i) {
      i.sendCopyFail("No source stream defined");
    }
    handleCopyData(i, o) {
    }
  }
  return kn = r, kn;
}
var Mn = {}, F$1 = {}, Jr;
function Ci() {
  if (Jr) return F$1;
  Jr = 1, Object.defineProperty(F$1, "__esModule", { value: true }), F$1.NoticeMessage = F$1.DataRowMessage = F$1.CommandCompleteMessage = F$1.ReadyForQueryMessage = F$1.NotificationResponseMessage = F$1.BackendKeyDataMessage = F$1.AuthenticationMD5Password = F$1.ParameterStatusMessage = F$1.ParameterDescriptionMessage = F$1.RowDescriptionMessage = F$1.Field = F$1.CopyResponse = F$1.CopyDataMessage = F$1.DatabaseError = F$1.copyDone = F$1.emptyQuery = F$1.replicationStart = F$1.portalSuspended = F$1.noData = F$1.closeComplete = F$1.bindComplete = F$1.parseComplete = void 0, F$1.parseComplete = { name: "parseComplete", length: 5 }, F$1.bindComplete = { name: "bindComplete", length: 5 }, F$1.closeComplete = { name: "closeComplete", length: 5 }, F$1.noData = { name: "noData", length: 5 }, F$1.portalSuspended = { name: "portalSuspended", length: 5 }, F$1.replicationStart = { name: "replicationStart", length: 4 }, F$1.emptyQuery = { name: "emptyQuery", length: 4 }, F$1.copyDone = { name: "copyDone", length: 4 };
  class e extends Error {
    constructor(y, v, m) {
      super(y), this.length = v, this.name = m;
    }
  }
  F$1.DatabaseError = e;
  class t {
    constructor(y, v) {
      this.length = y, this.chunk = v, this.name = "copyData";
    }
  }
  F$1.CopyDataMessage = t;
  class n {
    constructor(y, v, m, w) {
      this.length = y, this.name = v, this.binary = m, this.columnTypes = new Array(w);
    }
  }
  F$1.CopyResponse = n;
  class r {
    constructor(y, v, m, w, S, A, q) {
      this.name = y, this.tableID = v, this.columnID = m, this.dataTypeID = w, this.dataTypeSize = S, this.dataTypeModifier = A, this.format = q;
    }
  }
  F$1.Field = r;
  class s {
    constructor(y, v) {
      this.length = y, this.fieldCount = v, this.name = "rowDescription", this.fields = new Array(this.fieldCount);
    }
  }
  F$1.RowDescriptionMessage = s;
  class i {
    constructor(y, v) {
      this.length = y, this.parameterCount = v, this.name = "parameterDescription", this.dataTypeIDs = new Array(this.parameterCount);
    }
  }
  F$1.ParameterDescriptionMessage = i;
  class o {
    constructor(y, v, m) {
      this.length = y, this.parameterName = v, this.parameterValue = m, this.name = "parameterStatus";
    }
  }
  F$1.ParameterStatusMessage = o;
  class a {
    constructor(y, v) {
      this.length = y, this.salt = v, this.name = "authenticationMD5Password";
    }
  }
  F$1.AuthenticationMD5Password = a;
  class u {
    constructor(y, v, m) {
      this.length = y, this.processID = v, this.secretKey = m, this.name = "backendKeyData";
    }
  }
  F$1.BackendKeyDataMessage = u;
  class d {
    constructor(y, v, m, w) {
      this.length = y, this.processId = v, this.channel = m, this.payload = w, this.name = "notification";
    }
  }
  F$1.NotificationResponseMessage = d;
  class c {
    constructor(y, v) {
      this.length = y, this.status = v, this.name = "readyForQuery";
    }
  }
  F$1.ReadyForQueryMessage = c;
  class p {
    constructor(y, v) {
      this.length = y, this.text = v, this.name = "commandComplete";
    }
  }
  F$1.CommandCompleteMessage = p;
  class l {
    constructor(y, v) {
      this.length = y, this.fields = v, this.name = "dataRow", this.fieldCount = v.length;
    }
  }
  F$1.DataRowMessage = l;
  class f {
    constructor(y, v) {
      this.length = y, this.message = v, this.name = "notice";
    }
  }
  return F$1.NoticeMessage = f, F$1;
}
var Et$1 = {}, Dt$1 = {}, es;
function sa() {
  if (es) return Dt$1;
  es = 1, Object.defineProperty(Dt$1, "__esModule", { value: true }), Dt$1.Writer = void 0;
  class e {
    constructor(n = 256) {
      this.size = n, this.offset = 5, this.headerPosition = 0, this.buffer = Buffer.allocUnsafe(n);
    }
    ensure(n) {
      if (this.buffer.length - this.offset < n) {
        const s = this.buffer, i = s.length + (s.length >> 1) + n;
        this.buffer = Buffer.allocUnsafe(i), s.copy(this.buffer);
      }
    }
    addInt32(n) {
      return this.ensure(4), this.buffer[this.offset++] = n >>> 24 & 255, this.buffer[this.offset++] = n >>> 16 & 255, this.buffer[this.offset++] = n >>> 8 & 255, this.buffer[this.offset++] = n >>> 0 & 255, this;
    }
    addInt16(n) {
      return this.ensure(2), this.buffer[this.offset++] = n >>> 8 & 255, this.buffer[this.offset++] = n >>> 0 & 255, this;
    }
    addCString(n) {
      if (!n) this.ensure(1);
      else {
        const r = Buffer.byteLength(n);
        this.ensure(r + 1), this.buffer.write(n, this.offset, "utf-8"), this.offset += r;
      }
      return this.buffer[this.offset++] = 0, this;
    }
    addString(n = "") {
      const r = Buffer.byteLength(n);
      return this.ensure(r), this.buffer.write(n, this.offset), this.offset += r, this;
    }
    add(n) {
      return this.ensure(n.length), n.copy(this.buffer, this.offset), this.offset += n.length, this;
    }
    join(n) {
      if (n) {
        this.buffer[this.headerPosition] = n;
        const r = this.offset - (this.headerPosition + 1);
        this.buffer.writeInt32BE(r, this.headerPosition + 1);
      }
      return this.buffer.slice(n ? 0 : 5, this.offset);
    }
    flush(n) {
      const r = this.join(n);
      return this.offset = 5, this.headerPosition = 0, this.buffer = Buffer.allocUnsafe(this.size), r;
    }
  }
  return Dt$1.Writer = e, Dt$1;
}
var ts;
function ia() {
  if (ts) return Et$1;
  ts = 1, Object.defineProperty(Et$1, "__esModule", { value: true }), Et$1.serialize = void 0;
  const e = sa(), t = new e.Writer(), n = (_) => {
    t.addInt16(3).addInt16(0);
    for (const j of Object.keys(_)) t.addCString(j).addCString(_[j]);
    t.addCString("client_encoding").addCString("UTF8");
    const M = t.addCString("").flush(), N = M.length + 4;
    return new e.Writer().addInt32(N).add(M).flush();
  }, r = () => {
    const _ = Buffer.allocUnsafe(8);
    return _.writeInt32BE(8, 0), _.writeInt32BE(80877103, 4), _;
  }, s = (_) => t.addCString(_).flush(112), i = function(_, M) {
    return t.addCString(_).addInt32(Buffer.byteLength(M)).addString(M), t.flush(112);
  }, o = function(_) {
    return t.addString(_).flush(112);
  }, a = (_) => t.addCString(_).flush(81), u = [], d = (_) => {
    const M = _.name || "";
    M.length > 63 && (console.error("Warning! Postgres only supports 63 characters for query names."), console.error("You supplied %s (%s)", M, M.length), console.error("This can cause conflicts and silent errors executing queries"));
    const N = _.types || u, j = N.length, U = t.addCString(M).addCString(_.text).addInt16(j);
    for (let V = 0; V < j; V++) U.addInt32(N[V]);
    return t.flush(80);
  }, c = new e.Writer(), p = function(_, M) {
    for (let N = 0; N < _.length; N++) {
      const j = M ? M(_[N], N) : _[N];
      j == null ? (t.addInt16(0), c.addInt32(-1)) : j instanceof Buffer ? (t.addInt16(1), c.addInt32(j.length), c.add(j)) : (t.addInt16(0), c.addInt32(Buffer.byteLength(j)), c.addString(j));
    }
  }, l = (_ = {}) => {
    const M = _.portal || "", N = _.statement || "", j = _.binary || false, U = _.values || u, V = U.length;
    return t.addCString(M).addCString(N), t.addInt16(V), p(U, _.valueMapper), t.addInt16(V), t.add(c.flush()), t.addInt16(1), t.addInt16(j ? 1 : 0), t.flush(66);
  }, f = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]), h = (_) => {
    if (!_ || !_.portal && !_.rows) return f;
    const M = _.portal || "", N = _.rows || 0, j = Buffer.byteLength(M), U = 4 + j + 1 + 4, V = Buffer.allocUnsafe(1 + U);
    return V[0] = 69, V.writeInt32BE(U, 1), V.write(M, 5, "utf-8"), V[j + 5] = 0, V.writeUInt32BE(N, V.length - 4), V;
  }, y = (_, M) => {
    const N = Buffer.allocUnsafe(16);
    return N.writeInt32BE(16, 0), N.writeInt16BE(1234, 4), N.writeInt16BE(5678, 6), N.writeInt32BE(_, 8), N.writeInt32BE(M, 12), N;
  }, v = (_, M) => {
    const j = 4 + Buffer.byteLength(M) + 1, U = Buffer.allocUnsafe(1 + j);
    return U[0] = _, U.writeInt32BE(j, 1), U.write(M, 5, "utf-8"), U[j] = 0, U;
  }, m = t.addCString("P").flush(68), w = t.addCString("S").flush(68), S = (_) => _.name ? v(68, `${_.type}${_.name || ""}`) : _.type === "P" ? m : w, A = (_) => {
    const M = `${_.type}${_.name || ""}`;
    return v(67, M);
  }, q = (_) => t.add(_).flush(100), R = (_) => v(102, _), g = (_) => Buffer.from([_, 0, 0, 0, 4]), b = g(72), I = g(83), E = g(88), x = g(99), k = { startup: n, password: s, requestSsl: r, sendSASLInitialResponseMessage: i, sendSCRAMClientFinalMessage: o, query: a, parse: d, bind: l, execute: h, describe: S, close: A, flush: () => b, sync: () => I, end: () => E, copyData: q, copyDone: () => x, copyFail: R, cancel: y };
  return Et$1.serialize = k, Et$1;
}
var qt$1 = {}, Nt$1 = {}, ns;
function oa() {
  if (ns) return Nt$1;
  ns = 1, Object.defineProperty(Nt$1, "__esModule", { value: true }), Nt$1.BufferReader = void 0;
  class e {
    constructor(n = 0) {
      this.offset = n, this.buffer = Buffer.allocUnsafe(0), this.encoding = "utf-8";
    }
    setBuffer(n, r) {
      this.offset = n, this.buffer = r;
    }
    int16() {
      const n = this.buffer.readInt16BE(this.offset);
      return this.offset += 2, n;
    }
    byte() {
      const n = this.buffer[this.offset];
      return this.offset++, n;
    }
    int32() {
      const n = this.buffer.readInt32BE(this.offset);
      return this.offset += 4, n;
    }
    uint32() {
      const n = this.buffer.readUInt32BE(this.offset);
      return this.offset += 4, n;
    }
    string(n) {
      const r = this.buffer.toString(this.encoding, this.offset, this.offset + n);
      return this.offset += n, r;
    }
    cstring() {
      const n = this.offset;
      let r = n;
      for (; this.buffer[r++] !== 0; ) ;
      return this.offset = r, this.buffer.toString(this.encoding, n, r - 1);
    }
    bytes(n) {
      const r = this.buffer.slice(this.offset, this.offset + n);
      return this.offset += n, r;
    }
  }
  return Nt$1.BufferReader = e, Nt$1;
}
var rs;
function aa() {
  if (rs) return qt$1;
  rs = 1, Object.defineProperty(qt$1, "__esModule", { value: true }), qt$1.Parser = void 0;
  const e = Ci(), t = oa(), n = 1, s = n + 4, i = -1, o = Buffer.allocUnsafe(0);
  class a {
    constructor(b) {
      if (this.buffer = o, this.bufferLength = 0, this.bufferOffset = 0, this.reader = new t.BufferReader(), (b == null ? void 0 : b.mode) === "binary") throw new Error("Binary mode not supported yet");
      this.mode = (b == null ? void 0 : b.mode) || "text";
    }
    parse(b, I) {
      this.mergeBuffer(b);
      const E = this.bufferOffset + this.bufferLength;
      let x = this.bufferOffset;
      for (; x + s <= E; ) {
        const k = this.buffer[x], _ = this.buffer.readUInt32BE(x + n), M = n + _;
        if (M + x <= E) {
          const N = this.handlePacket(x + s, k, _, this.buffer);
          I(N), x += M;
        } else break;
      }
      x === E ? (this.buffer = o, this.bufferLength = 0, this.bufferOffset = 0) : (this.bufferLength = E - x, this.bufferOffset = x);
    }
    mergeBuffer(b) {
      if (this.bufferLength > 0) {
        const I = this.bufferLength + b.byteLength;
        if (I + this.bufferOffset > this.buffer.byteLength) {
          let x;
          if (I <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) x = this.buffer;
          else {
            let k = this.buffer.byteLength * 2;
            for (; I >= k; ) k *= 2;
            x = Buffer.allocUnsafe(k);
          }
          this.buffer.copy(x, 0, this.bufferOffset, this.bufferOffset + this.bufferLength), this.buffer = x, this.bufferOffset = 0;
        }
        b.copy(this.buffer, this.bufferOffset + this.bufferLength), this.bufferLength = I;
      } else this.buffer = b, this.bufferOffset = 0, this.bufferLength = b.byteLength;
    }
    handlePacket(b, I, E, x) {
      const { reader: k } = this;
      k.setBuffer(b, x);
      let _;
      switch (I) {
        case 50:
          _ = e.bindComplete;
          break;
        case 49:
          _ = e.parseComplete;
          break;
        case 51:
          _ = e.closeComplete;
          break;
        case 110:
          _ = e.noData;
          break;
        case 115:
          _ = e.portalSuspended;
          break;
        case 99:
          _ = e.copyDone;
          break;
        case 87:
          _ = e.replicationStart;
          break;
        case 73:
          _ = e.emptyQuery;
          break;
        case 68:
          _ = w(k);
          break;
        case 67:
          _ = d(k);
          break;
        case 90:
          _ = u(k);
          break;
        case 65:
          _ = h(k);
          break;
        case 82:
          _ = q(k, E);
          break;
        case 83:
          _ = S(k);
          break;
        case 75:
          _ = A(k);
          break;
        case 69:
          _ = R(k, "error");
          break;
        case 78:
          _ = R(k, "notice");
          break;
        case 84:
          _ = y(k);
          break;
        case 116:
          _ = m(k);
          break;
        case 71:
          _ = p(k);
          break;
        case 72:
          _ = l(k);
          break;
        case 100:
          _ = c(k, E);
          break;
        default:
          return new e.DatabaseError("received invalid response: " + I.toString(16), E, "error");
      }
      return k.setBuffer(0, o), _.length = E, _;
    }
  }
  qt$1.Parser = a;
  const u = (g) => {
    const b = g.string(1);
    return new e.ReadyForQueryMessage(i, b);
  }, d = (g) => {
    const b = g.cstring();
    return new e.CommandCompleteMessage(i, b);
  }, c = (g, b) => {
    const I = g.bytes(b - 4);
    return new e.CopyDataMessage(i, I);
  }, p = (g) => f(g, "copyInResponse"), l = (g) => f(g, "copyOutResponse"), f = (g, b) => {
    const I = g.byte() !== 0, E = g.int16(), x = new e.CopyResponse(i, b, I, E);
    for (let k = 0; k < E; k++) x.columnTypes[k] = g.int16();
    return x;
  }, h = (g) => {
    const b = g.int32(), I = g.cstring(), E = g.cstring();
    return new e.NotificationResponseMessage(i, b, I, E);
  }, y = (g) => {
    const b = g.int16(), I = new e.RowDescriptionMessage(i, b);
    for (let E = 0; E < b; E++) I.fields[E] = v(g);
    return I;
  }, v = (g) => {
    const b = g.cstring(), I = g.uint32(), E = g.int16(), x = g.uint32(), k = g.int16(), _ = g.int32(), M = g.int16() === 0 ? "text" : "binary";
    return new e.Field(b, I, E, x, k, _, M);
  }, m = (g) => {
    const b = g.int16(), I = new e.ParameterDescriptionMessage(i, b);
    for (let E = 0; E < b; E++) I.dataTypeIDs[E] = g.int32();
    return I;
  }, w = (g) => {
    const b = g.int16(), I = new Array(b);
    for (let E = 0; E < b; E++) {
      const x = g.int32();
      I[E] = x === -1 ? null : g.string(x);
    }
    return new e.DataRowMessage(i, I);
  }, S = (g) => {
    const b = g.cstring(), I = g.cstring();
    return new e.ParameterStatusMessage(i, b, I);
  }, A = (g) => {
    const b = g.int32(), I = g.int32();
    return new e.BackendKeyDataMessage(i, b, I);
  }, q = (g, b) => {
    const I = g.int32(), E = { name: "authenticationOk", length: b };
    switch (I) {
      case 0:
        break;
      case 3:
        E.length === 8 && (E.name = "authenticationCleartextPassword");
        break;
      case 5:
        if (E.length === 12) {
          E.name = "authenticationMD5Password";
          const x = g.bytes(4);
          return new e.AuthenticationMD5Password(i, x);
        }
        break;
      case 10:
        {
          E.name = "authenticationSASL", E.mechanisms = [];
          let x;
          do
            x = g.cstring(), x && E.mechanisms.push(x);
          while (x);
        }
        break;
      case 11:
        E.name = "authenticationSASLContinue", E.data = g.string(b - 8);
        break;
      case 12:
        E.name = "authenticationSASLFinal", E.data = g.string(b - 8);
        break;
      default:
        throw new Error("Unknown authenticationOk message type " + I);
    }
    return E;
  }, R = (g, b) => {
    const I = {};
    let E = g.string(1);
    for (; E !== "\0"; ) I[E] = g.cstring(), E = g.string(1);
    const x = I.M, k = b === "notice" ? new e.NoticeMessage(i, x) : new e.DatabaseError(x, i, b);
    return k.severity = I.S, k.code = I.C, k.detail = I.D, k.hint = I.H, k.position = I.P, k.internalPosition = I.p, k.internalQuery = I.q, k.where = I.W, k.schema = I.s, k.table = I.t, k.column = I.c, k.dataType = I.d, k.constraint = I.n, k.file = I.F, k.line = I.L, k.routine = I.R, k;
  };
  return qt$1;
}
var ss;
function ki() {
  return ss || (ss = 1, (function(e) {
    Object.defineProperty(e, "__esModule", { value: true }), e.DatabaseError = e.serialize = e.parse = void 0;
    const t = Ci();
    Object.defineProperty(e, "DatabaseError", { enumerable: true, get: function() {
      return t.DatabaseError;
    } });
    const n = ia();
    Object.defineProperty(e, "serialize", { enumerable: true, get: function() {
      return n.serialize;
    } });
    const r = aa();
    function s(i, o) {
      const a = new r.Parser();
      return i.on("data", (u) => a.parse(u, o)), new Promise((u) => i.on("end", () => u()));
    }
    e.parse = s;
  })(Mn)), Mn;
}
var $t$1 = {}, is;
function da() {
  return is || (is = 1, Object.defineProperty($t$1, "__esModule", { value: true }), $t$1.default = {}), $t$1;
}
var xn, os;
function ca() {
  if (os) return xn;
  os = 1;
  const { getStream: e, getSecureStream: t } = i();
  xn = { getStream: e, getSecureStream: t };
  function n() {
    function o(u) {
      const d = Vs;
      return new d.Socket();
    }
    function a(u) {
      return require$$4.connect(u);
    }
    return { getStream: o, getSecureStream: a };
  }
  function r() {
    function o(u) {
      const { CloudflareSocket: d } = da();
      return new d(u);
    }
    function a(u) {
      return u.socket.startTls(u), u.socket;
    }
    return { getStream: o, getSecureStream: a };
  }
  function s() {
    if (typeof navigator == "object" && navigator !== null && typeof navigator.userAgent == "string") return navigator.userAgent === "Cloudflare-Workers";
    if (typeof Response == "function") {
      const o = new Response(null, { cf: { thing: true } });
      if (typeof o.cf == "object" && o.cf !== null && o.cf.thing) return true;
    }
    return false;
  }
  function i() {
    return s() ? r() : n();
  }
  return xn;
}
var jn, as;
function Mi() {
  if (as) return jn;
  as = 1;
  const e = wt$1.EventEmitter, { parse: t, serialize: n } = ki(), { getStream: r, getSecureStream: s } = ca(), i = n.flush(), o = n.sync(), a = n.end();
  class u extends e {
    constructor(c) {
      super(), c = c || {}, this.stream = c.stream || r(c.ssl), typeof this.stream == "function" && (this.stream = this.stream(c)), this._keepAlive = c.keepAlive, this._keepAliveInitialDelayMillis = c.keepAliveInitialDelayMillis, this.parsedStatements = {}, this.ssl = c.ssl || false, this._ending = false, this._emitMessage = false;
      const p = this;
      this.on("newListener", function(l) {
        l === "message" && (p._emitMessage = true);
      });
    }
    connect(c, p) {
      const l = this;
      this._connecting = true, this.stream.setNoDelay(true), this.stream.connect(c, p), this.stream.once("connect", function() {
        l._keepAlive && l.stream.setKeepAlive(true, l._keepAliveInitialDelayMillis), l.emit("connect");
      });
      const f = function(h) {
        l._ending && (h.code === "ECONNRESET" || h.code === "EPIPE") || l.emit("error", h);
      };
      if (this.stream.on("error", f), this.stream.on("close", function() {
        l.emit("end");
      }), !this.ssl) return this.attachListeners(this.stream);
      this.stream.once("data", function(h) {
        switch (h.toString("utf8")) {
          case "S":
            break;
          case "N":
            return l.stream.end(), l.emit("error", new Error("The server does not support SSL connections"));
          default:
            return l.stream.end(), l.emit("error", new Error("There was an error establishing an SSL connection"));
        }
        const v = { socket: l.stream };
        l.ssl !== true && (Object.assign(v, l.ssl), "key" in l.ssl && (v.key = l.ssl.key));
        const m = Vs;
        m.isIP && m.isIP(p) === 0 && (v.servername = p);
        try {
          l.stream = s(v);
        } catch (w) {
          return l.emit("error", w);
        }
        l.attachListeners(l.stream), l.stream.on("error", f), l.emit("sslconnect");
      });
    }
    attachListeners(c) {
      t(c, (p) => {
        const l = p.name === "error" ? "errorMessage" : p.name;
        this._emitMessage && this.emit("message", p), this.emit(l, p);
      });
    }
    requestSsl() {
      this.stream.write(n.requestSsl());
    }
    startup(c) {
      this.stream.write(n.startup(c));
    }
    cancel(c, p) {
      this._send(n.cancel(c, p));
    }
    password(c) {
      this._send(n.password(c));
    }
    sendSASLInitialResponseMessage(c, p) {
      this._send(n.sendSASLInitialResponseMessage(c, p));
    }
    sendSCRAMClientFinalMessage(c) {
      this._send(n.sendSCRAMClientFinalMessage(c));
    }
    _send(c) {
      return this.stream.writable ? this.stream.write(c) : false;
    }
    query(c) {
      this._send(n.query(c));
    }
    parse(c) {
      this._send(n.parse(c));
    }
    bind(c) {
      this._send(n.bind(c));
    }
    execute(c) {
      this._send(n.execute(c));
    }
    flush() {
      this.stream.writable && this.stream.write(i);
    }
    sync() {
      this._ending = true, this._send(o);
    }
    ref() {
      this.stream.ref();
    }
    unref() {
      this.stream.unref();
    }
    end() {
      if (this._ending = true, !this._connecting || !this.stream.writable) {
        this.stream.end();
        return;
      }
      return this.stream.write(a, () => {
        this.stream.end();
      });
    }
    close(c) {
      this._send(n.close(c));
    }
    describe(c) {
      this._send(n.describe(c));
    }
    sendCopyFromChunk(c) {
      this._send(n.copyData(c));
    }
    endCopyFrom() {
      this._send(n.copyDone());
    }
    sendCopyFail(c) {
      this._send(n.copyFail(c));
    }
  }
  return jn = u, jn;
}
var Ut$1 = { exports: {} }, Ln = { exports: {} }, Pn, ds;
function ua() {
  if (ds) return Pn;
  ds = 1;
  const { Transform: e } = require$$0$2, { StringDecoder: t } = eo, n = /* @__PURE__ */ Symbol("last"), r = /* @__PURE__ */ Symbol("decoder");
  function s(d, c, p) {
    let l;
    if (this.overflow) {
      if (l = this[r].write(d).split(this.matcher), l.length === 1) return p();
      l.shift(), this.overflow = false;
    } else this[n] += this[r].write(d), l = this[n].split(this.matcher);
    this[n] = l.pop();
    for (let f = 0; f < l.length; f++) try {
      o(this, this.mapper(l[f]));
    } catch (h) {
      return p(h);
    }
    if (this.overflow = this[n].length > this.maxLength, this.overflow && !this.skipOverflow) {
      p(new Error("maximum buffer reached"));
      return;
    }
    p();
  }
  function i(d) {
    if (this[n] += this[r].end(), this[n]) try {
      o(this, this.mapper(this[n]));
    } catch (c) {
      return d(c);
    }
    d();
  }
  function o(d, c) {
    c !== void 0 && d.push(c);
  }
  function a(d) {
    return d;
  }
  function u(d, c, p) {
    switch (d = d || /\r?\n/, c = c || a, p = p || {}, arguments.length) {
      case 1:
        typeof d == "function" ? (c = d, d = /\r?\n/) : typeof d == "object" && !(d instanceof RegExp) && !d[Symbol.split] && (p = d, d = /\r?\n/);
        break;
      case 2:
        typeof d == "function" ? (p = c, c = d, d = /\r?\n/) : typeof c == "object" && (p = c, c = a);
    }
    p = Object.assign({}, p), p.autoDestroy = true, p.transform = s, p.flush = i, p.readableObjectMode = true;
    const l = new e(p);
    return l[n] = "", l[r] = new t("utf8"), l.matcher = d, l.mapper = c, l.maxLength = p.maxLength, l.skipOverflow = p.skipOverflow || false, l.overflow = false, l._destroy = function(f, h) {
      this._writableState.errorEmitted = false, h(f);
    }, l;
  }
  return Pn = u, Pn;
}
var cs;
function la() {
  return cs || (cs = 1, (function(e) {
    var t = Ji, n = require$$0$2.Stream, r = ua(), s = yt$1, i = 5432, o = process.platform === "win32", a = process.stderr, u = 56, d = 7, c = 61440, p = 32768;
    function l(A) {
      return (A & c) == p;
    }
    var f = ["host", "port", "database", "user", "password"], h = f.length, y = f[h - 1];
    function v() {
      var A = a instanceof n && a.writable === true;
      if (A) {
        var q = Array.prototype.slice.call(arguments).concat(`
`);
        a.write(s.format.apply(s, q));
      }
    }
    Object.defineProperty(e.exports, "isWin", { get: function() {
      return o;
    }, set: function(A) {
      o = A;
    } }), e.exports.warnTo = function(A) {
      var q = a;
      return a = A, q;
    }, e.exports.getFileName = function(A) {
      var q = A || process.env, R = q.PGPASSFILE || (o ? t.join(q.APPDATA || "./", "postgresql", "pgpass.conf") : t.join(q.HOME || "./", ".pgpass"));
      return R;
    }, e.exports.usePgPass = function(A, q) {
      return Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD") ? false : o ? true : (q = q || "<unkn>", l(A.mode) ? A.mode & (u | d) ? (v('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', q), false) : true : (v('WARNING: password file "%s" is not a plain file', q), false));
    };
    var m = e.exports.match = function(A, q) {
      return f.slice(0, -1).reduce(function(R, g, b) {
        return b == 1 && Number(A[g] || i) === Number(q[g]) ? R && true : R && (q[g] === "*" || q[g] === A[g]);
      }, true);
    };
    e.exports.getPassword = function(A, q, R) {
      var g, b = q.pipe(r());
      function I(k) {
        var _ = w(k);
        _ && S(_) && m(A, _) && (g = _[y], b.end());
      }
      var E = function() {
        q.destroy(), R(g);
      }, x = function(k) {
        q.destroy(), v("WARNING: error on reading file: %s", k), R(void 0);
      };
      q.on("error", x), b.on("data", I).on("end", E).on("error", x);
    };
    var w = e.exports.parseLine = function(A) {
      if (A.length < 11 || A.match(/^\s+#/)) return null;
      for (var q = "", R = "", g = 0, b = 0, I = {}, E = false, x = function(_, M, N) {
        var j = A.substring(M, N);
        Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE") || (j = j.replace(/\\([:\\])/g, "$1")), I[f[_]] = j;
      }, k = 0; k < A.length - 1; k += 1) {
        if (q = A.charAt(k + 1), R = A.charAt(k), E = g == h - 1, E) {
          x(g, b);
          break;
        }
        k >= 0 && q == ":" && R !== "\\" && (x(g, b, k + 1), b = k + 2, g += 1);
      }
      return I = Object.keys(I).length === h ? I : null, I;
    }, S = e.exports.isValidEntry = function(A) {
      for (var q = { 0: function(E) {
        return E.length > 0;
      }, 1: function(E) {
        return E === "*" ? true : (E = Number(E), isFinite(E) && E > 0 && E < 9007199254740992 && Math.floor(E) === E);
      }, 2: function(E) {
        return E.length > 0;
      }, 3: function(E) {
        return E.length > 0;
      }, 4: function(E) {
        return E.length > 0;
      } }, R = 0; R < f.length; R += 1) {
        var g = q[R], b = A[f[R]] || "", I = g(b);
        if (!I) return false;
      }
      return true;
    };
  })(Ln)), Ln.exports;
}
var us;
function pa() {
  if (us) return Ut$1.exports;
  us = 1;
  var e = Us, t = la();
  return Ut$1.exports = function(n, r) {
    var s = t.getFileName();
    e.stat(s, function(i, o) {
      if (i || !t.usePgPass(o, s)) return r(void 0);
      var a = e.createReadStream(s);
      t.getPassword(n, a, r);
    });
  }, Ut$1.exports.warnTo = t.warnTo, Ut$1.exports;
}
var On, ls;
function fa() {
  if (ls) return On;
  ls = 1;
  const e = wt$1.EventEmitter, t = kt$1(), n = yt$1, r = ta(), s = pr(), i = qi(), o = ra(), a = Jt$1(), u = Mi(), d = Di(), c = n.deprecate(() => {
  }, "Client.activeQuery is deprecated and will be removed in pg@9.0"), p = n.deprecate(() => {
  }, "Client.queryQueue is deprecated and will be removed in pg@9.0."), l = n.deprecate(() => {
  }, "pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code."), f = n.deprecate(() => {
  }, "Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0."), h = n.deprecate(() => {
  }, "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead.");
  class y extends e {
    constructor(m) {
      super(), this.connectionParameters = new i(m), this.user = this.connectionParameters.user, this.database = this.connectionParameters.database, this.port = this.connectionParameters.port, this.host = this.connectionParameters.host, Object.defineProperty(this, "password", { configurable: true, enumerable: false, writable: true, value: this.connectionParameters.password }), this.replication = this.connectionParameters.replication;
      const w = m || {};
      w.Promise && f(), this._Promise = w.Promise || rr.Promise, this._types = new s(w.types), this._ending = false, this._ended = false, this._connecting = false, this._connected = false, this._connectionError = false, this._queryable = true, this._activeQuery = null, this.enableChannelBinding = !!w.enableChannelBinding, this.connection = w.connection || new u({ stream: w.stream, ssl: this.connectionParameters.ssl, keepAlive: w.keepAlive || false, keepAliveInitialDelayMillis: w.keepAliveInitialDelayMillis || 0, encoding: this.connectionParameters.client_encoding || "utf8" }), this._queryQueue = [], this.binary = w.binary || a.binary, this.processID = null, this.secretKey = null, this.ssl = this.connectionParameters.ssl || false, this.ssl && this.ssl.key && Object.defineProperty(this.ssl, "key", { enumerable: false }), this._connectionTimeoutMillis = w.connectionTimeoutMillis || 0;
    }
    get activeQuery() {
      return c(), this._activeQuery;
    }
    set activeQuery(m) {
      c(), this._activeQuery = m;
    }
    _getActiveQuery() {
      return this._activeQuery;
    }
    _errorAllQueries(m) {
      const w = (A) => {
        process.nextTick(() => {
          A.handleError(m, this.connection);
        });
      }, S = this._getActiveQuery();
      S && (w(S), this._activeQuery = null), this._queryQueue.forEach(w), this._queryQueue.length = 0;
    }
    _connect(m) {
      const w = this, S = this.connection;
      if (this._connectionCallback = m, this._connecting || this._connected) {
        const A = new Error("Client has already been connected. You cannot reuse a client.");
        process.nextTick(() => {
          m(A);
        });
        return;
      }
      this._connecting = true, this._connectionTimeoutMillis > 0 && (this.connectionTimeoutHandle = setTimeout(() => {
        S._ending = true, S.stream.destroy(new Error("timeout expired"));
      }, this._connectionTimeoutMillis), this.connectionTimeoutHandle.unref && this.connectionTimeoutHandle.unref()), this.host && this.host.indexOf("/") === 0 ? S.connect(this.host + "/.s.PGSQL." + this.port) : S.connect(this.port, this.host), S.on("connect", function() {
        w.ssl ? S.requestSsl() : S.startup(w.getStartupConf());
      }), S.on("sslconnect", function() {
        S.startup(w.getStartupConf());
      }), this._attachListeners(S), S.once("end", () => {
        const A = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
        clearTimeout(this.connectionTimeoutHandle), this._errorAllQueries(A), this._ended = true, this._ending || (this._connecting && !this._connectionError ? this._connectionCallback ? this._connectionCallback(A) : this._handleErrorEvent(A) : this._connectionError || this._handleErrorEvent(A)), process.nextTick(() => {
          this.emit("end");
        });
      });
    }
    connect(m) {
      if (m) {
        this._connect(m);
        return;
      }
      return new this._Promise((w, S) => {
        this._connect((A) => {
          A ? S(A) : w(this);
        });
      });
    }
    _attachListeners(m) {
      m.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this)), m.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this)), m.on("authenticationSASL", this._handleAuthSASL.bind(this)), m.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this)), m.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this)), m.on("backendKeyData", this._handleBackendKeyData.bind(this)), m.on("error", this._handleErrorEvent.bind(this)), m.on("errorMessage", this._handleErrorMessage.bind(this)), m.on("readyForQuery", this._handleReadyForQuery.bind(this)), m.on("notice", this._handleNotice.bind(this)), m.on("rowDescription", this._handleRowDescription.bind(this)), m.on("dataRow", this._handleDataRow.bind(this)), m.on("portalSuspended", this._handlePortalSuspended.bind(this)), m.on("emptyQuery", this._handleEmptyQuery.bind(this)), m.on("commandComplete", this._handleCommandComplete.bind(this)), m.on("parseComplete", this._handleParseComplete.bind(this)), m.on("copyInResponse", this._handleCopyInResponse.bind(this)), m.on("copyData", this._handleCopyData.bind(this)), m.on("notification", this._handleNotification.bind(this));
    }
    _getPassword(m) {
      const w = this.connection;
      if (typeof this.password == "function") this._Promise.resolve().then(() => this.password(this.connectionParameters)).then((S) => {
        if (S !== void 0) {
          if (typeof S != "string") {
            w.emit("error", new TypeError("Password must be a string"));
            return;
          }
          this.connectionParameters.password = this.password = S;
        } else this.connectionParameters.password = this.password = null;
        m();
      }).catch((S) => {
        w.emit("error", S);
      });
      else if (this.password !== null) m();
      else try {
        pa()(this.connectionParameters, (A) => {
          A !== void 0 && (l(), this.connectionParameters.password = this.password = A), m();
        });
      } catch (S) {
        this.emit("error", S);
      }
    }
    _handleAuthCleartextPassword(m) {
      this._getPassword(() => {
        this.connection.password(this.password);
      });
    }
    _handleAuthMD5Password(m) {
      this._getPassword(async () => {
        try {
          const w = await d.postgresMd5PasswordHash(this.user, this.password, m.salt);
          this.connection.password(w);
        } catch (w) {
          this.emit("error", w);
        }
      });
    }
    _handleAuthSASL(m) {
      this._getPassword(() => {
        try {
          this.saslSession = r.startSession(m.mechanisms, this.enableChannelBinding && this.connection.stream), this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
        } catch (w) {
          this.connection.emit("error", w);
        }
      });
    }
    async _handleAuthSASLContinue(m) {
      try {
        await r.continueSession(this.saslSession, this.password, m.data, this.enableChannelBinding && this.connection.stream), this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
      } catch (w) {
        this.connection.emit("error", w);
      }
    }
    _handleAuthSASLFinal(m) {
      try {
        r.finalizeSession(this.saslSession, m.data), this.saslSession = null;
      } catch (w) {
        this.connection.emit("error", w);
      }
    }
    _handleBackendKeyData(m) {
      this.processID = m.processID, this.secretKey = m.secretKey;
    }
    _handleReadyForQuery(m) {
      this._connecting && (this._connecting = false, this._connected = true, clearTimeout(this.connectionTimeoutHandle), this._connectionCallback && (this._connectionCallback(null, this), this._connectionCallback = null), this.emit("connect"));
      const w = this._getActiveQuery();
      this._activeQuery = null, this.readyForQuery = true, w && w.handleReadyForQuery(this.connection), this._pulseQueryQueue();
    }
    _handleErrorWhileConnecting(m) {
      if (!this._connectionError) {
        if (this._connectionError = true, clearTimeout(this.connectionTimeoutHandle), this._connectionCallback) return this._connectionCallback(m);
        this.emit("error", m);
      }
    }
    _handleErrorEvent(m) {
      if (this._connecting) return this._handleErrorWhileConnecting(m);
      this._queryable = false, this._errorAllQueries(m), this.emit("error", m);
    }
    _handleErrorMessage(m) {
      if (this._connecting) return this._handleErrorWhileConnecting(m);
      const w = this._getActiveQuery();
      if (!w) {
        this._handleErrorEvent(m);
        return;
      }
      this._activeQuery = null, w.handleError(m, this.connection);
    }
    _handleRowDescription(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected rowDescription message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleRowDescription(m);
    }
    _handleDataRow(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected dataRow message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleDataRow(m);
    }
    _handlePortalSuspended(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected portalSuspended message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handlePortalSuspended(this.connection);
    }
    _handleEmptyQuery(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected emptyQuery message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleEmptyQuery(this.connection);
    }
    _handleCommandComplete(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected commandComplete message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleCommandComplete(m, this.connection);
    }
    _handleParseComplete() {
      const m = this._getActiveQuery();
      if (m == null) {
        const w = new Error("Received unexpected parseComplete message from backend.");
        this._handleErrorEvent(w);
        return;
      }
      m.name && (this.connection.parsedStatements[m.name] = m.text);
    }
    _handleCopyInResponse(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected copyInResponse message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleCopyInResponse(this.connection);
    }
    _handleCopyData(m) {
      const w = this._getActiveQuery();
      if (w == null) {
        const S = new Error("Received unexpected copyData message from backend.");
        this._handleErrorEvent(S);
        return;
      }
      w.handleCopyData(m, this.connection);
    }
    _handleNotification(m) {
      this.emit("notification", m);
    }
    _handleNotice(m) {
      this.emit("notice", m);
    }
    getStartupConf() {
      const m = this.connectionParameters, w = { user: m.user, database: m.database }, S = m.application_name || m.fallback_application_name;
      return S && (w.application_name = S), m.replication && (w.replication = "" + m.replication), m.statement_timeout && (w.statement_timeout = String(parseInt(m.statement_timeout, 10))), m.lock_timeout && (w.lock_timeout = String(parseInt(m.lock_timeout, 10))), m.idle_in_transaction_session_timeout && (w.idle_in_transaction_session_timeout = String(parseInt(m.idle_in_transaction_session_timeout, 10))), m.options && (w.options = m.options), w;
    }
    cancel(m, w) {
      if (m.activeQuery === w) {
        const S = this.connection;
        this.host && this.host.indexOf("/") === 0 ? S.connect(this.host + "/.s.PGSQL." + this.port) : S.connect(this.port, this.host), S.on("connect", function() {
          S.cancel(m.processID, m.secretKey);
        });
      } else m._queryQueue.indexOf(w) !== -1 && m._queryQueue.splice(m._queryQueue.indexOf(w), 1);
    }
    setTypeParser(m, w, S) {
      return this._types.setTypeParser(m, w, S);
    }
    getTypeParser(m, w) {
      return this._types.getTypeParser(m, w);
    }
    escapeIdentifier(m) {
      return t.escapeIdentifier(m);
    }
    escapeLiteral(m) {
      return t.escapeLiteral(m);
    }
    _pulseQueryQueue() {
      if (this.readyForQuery === true) {
        this._activeQuery = this._queryQueue.shift();
        const m = this._getActiveQuery();
        if (m) {
          this.readyForQuery = false, this.hasExecuted = true;
          const w = m.submit(this.connection);
          w && process.nextTick(() => {
            m.handleError(w, this.connection), this.readyForQuery = true, this._pulseQueryQueue();
          });
        } else this.hasExecuted && (this._activeQuery = null, this.emit("drain"));
      }
    }
    query(m, w, S) {
      let A, q, R, g, b;
      if (m == null) throw new TypeError("Client was passed a null or undefined query");
      return typeof m.submit == "function" ? (R = m.query_timeout || this.connectionParameters.query_timeout, q = A = m, A.callback || (typeof w == "function" ? A.callback = w : S && (A.callback = S))) : (R = m.query_timeout || this.connectionParameters.query_timeout, A = new o(m, w, S), A.callback || (q = new this._Promise((I, E) => {
        A.callback = (x, k) => x ? E(x) : I(k);
      }).catch((I) => {
        throw Error.captureStackTrace(I), I;
      }))), R && (b = A.callback || (() => {
      }), g = setTimeout(() => {
        const I = new Error("Query read timeout");
        process.nextTick(() => {
          A.handleError(I, this.connection);
        }), b(I), A.callback = () => {
        };
        const E = this._queryQueue.indexOf(A);
        E > -1 && this._queryQueue.splice(E, 1), this._pulseQueryQueue();
      }, R), A.callback = (I, E) => {
        clearTimeout(g), b(I, E);
      }), this.binary && !A.binary && (A.binary = true), A._result && !A._result._types && (A._result._types = this._types), this._queryable ? this._ending ? (process.nextTick(() => {
        A.handleError(new Error("Client was closed and is not queryable"), this.connection);
      }), q) : (this._queryQueue.length > 0 && h(), this._queryQueue.push(A), this._pulseQueryQueue(), q) : (process.nextTick(() => {
        A.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
      }), q);
    }
    ref() {
      this.connection.ref();
    }
    unref() {
      this.connection.unref();
    }
    end(m) {
      if (this._ending = true, !this.connection._connecting || this._ended) if (m) m();
      else return this._Promise.resolve();
      if (this._getActiveQuery() || !this._queryable ? this.connection.stream.destroy() : this.connection.end(), m) this.connection.once("end", m);
      else return new this._Promise((w) => {
        this.connection.once("end", w);
      });
    }
    get queryQueue() {
      return p(), this._queryQueue;
    }
  }
  return y.Query = o, On = y, On;
}
var Bn, ps;
function ma() {
  if (ps) return Bn;
  ps = 1;
  const e = wt$1.EventEmitter, t = function() {
  }, n = (d, c) => {
    const p = d.findIndex(c);
    return p === -1 ? void 0 : d.splice(p, 1)[0];
  };
  class r {
    constructor(c, p, l) {
      this.client = c, this.idleListener = p, this.timeoutId = l;
    }
  }
  class s {
    constructor(c) {
      this.callback = c;
    }
  }
  function i() {
    throw new Error("Release called on client which has already been released to the pool.");
  }
  function o(d, c) {
    if (c) return { callback: c, result: void 0 };
    let p, l;
    const f = function(y, v) {
      y ? p(y) : l(v);
    }, h = new d(function(y, v) {
      l = y, p = v;
    }).catch((y) => {
      throw Error.captureStackTrace(y), y;
    });
    return { callback: f, result: h };
  }
  function a(d, c) {
    return function p(l) {
      l.client = c, c.removeListener("error", p), c.on("error", () => {
        d.log("additional client error after disconnection due to error", l);
      }), d._remove(c), d.emit("error", l, c);
    };
  }
  class u extends e {
    constructor(c, p) {
      super(), this.options = Object.assign({}, c), c != null && "password" in c && Object.defineProperty(this.options, "password", { configurable: true, enumerable: false, writable: true, value: c.password }), c != null && c.ssl && c.ssl.key && Object.defineProperty(this.options.ssl, "key", { enumerable: false }), this.options.max = this.options.max || this.options.poolSize || 10, this.options.min = this.options.min || 0, this.options.maxUses = this.options.maxUses || 1 / 0, this.options.allowExitOnIdle = this.options.allowExitOnIdle || false, this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0, this.log = this.options.log || function() {
      }, this.Client = this.options.Client || p || xi().Client, this.Promise = this.options.Promise || rr.Promise, typeof this.options.idleTimeoutMillis > "u" && (this.options.idleTimeoutMillis = 1e4), this._clients = [], this._idle = [], this._expired = /* @__PURE__ */ new WeakSet(), this._pendingQueue = [], this._endCallback = void 0, this.ending = false, this.ended = false;
    }
    _promiseTry(c) {
      const p = this.Promise;
      return typeof p.try == "function" ? p.try(c) : new p((l) => l(c()));
    }
    _isFull() {
      return this._clients.length >= this.options.max;
    }
    _isAboveMin() {
      return this._clients.length > this.options.min;
    }
    _pulseQueue() {
      if (this.log("pulse queue"), this.ended) {
        this.log("pulse queue ended");
        return;
      }
      if (this.ending) {
        this.log("pulse queue on ending"), this._idle.length && this._idle.slice().map((p) => {
          this._remove(p.client);
        }), this._clients.length || (this.ended = true, this._endCallback());
        return;
      }
      if (!this._pendingQueue.length) {
        this.log("no queued requests");
        return;
      }
      if (!this._idle.length && this._isFull()) return;
      const c = this._pendingQueue.shift();
      if (this._idle.length) {
        const p = this._idle.pop();
        clearTimeout(p.timeoutId);
        const l = p.client;
        l.ref && l.ref();
        const f = p.idleListener;
        return this._acquireClient(l, c, f, false);
      }
      if (!this._isFull()) return this.newClient(c);
      throw new Error("unexpected condition");
    }
    _remove(c, p) {
      const l = n(this._idle, (h) => h.client === c);
      l !== void 0 && clearTimeout(l.timeoutId), this._clients = this._clients.filter((h) => h !== c);
      const f = this;
      c.end(() => {
        f.emit("remove", c), typeof p == "function" && p();
      });
    }
    connect(c) {
      if (this.ending) {
        const f = new Error("Cannot use a pool after calling end on the pool");
        return c ? c(f) : this.Promise.reject(f);
      }
      const p = o(this.Promise, c), l = p.result;
      if (this._isFull() || this._idle.length) {
        if (this._idle.length && process.nextTick(() => this._pulseQueue()), !this.options.connectionTimeoutMillis) return this._pendingQueue.push(new s(p.callback)), l;
        const f = (v, m, w) => {
          clearTimeout(y), p.callback(v, m, w);
        }, h = new s(f), y = setTimeout(() => {
          n(this._pendingQueue, (v) => v.callback === f), h.timedOut = true, p.callback(new Error("timeout exceeded when trying to connect"));
        }, this.options.connectionTimeoutMillis);
        return y.unref && y.unref(), this._pendingQueue.push(h), l;
      }
      return this.newClient(new s(p.callback)), l;
    }
    newClient(c) {
      const p = new this.Client(this.options);
      this._clients.push(p);
      const l = a(this, p);
      this.log("checking client timeout");
      let f, h = false;
      this.options.connectionTimeoutMillis && (f = setTimeout(() => {
        p.connection ? (this.log("ending client due to timeout"), h = true, p.connection.stream.destroy()) : p.isConnected() || (this.log("ending client due to timeout"), h = true, p.end());
      }, this.options.connectionTimeoutMillis)), this.log("connecting new client"), p.connect((y) => {
        if (f && clearTimeout(f), p.on("error", l), y) this.log("client failed to connect", y), this._clients = this._clients.filter((v) => v !== p), h && (y = new Error("Connection terminated due to connection timeout", { cause: y })), this._pulseQueue(), c.timedOut || c.callback(y, void 0, t);
        else {
          if (this.log("new client connected"), this.options.onConnect) {
            this._promiseTry(() => this.options.onConnect(p)).then(() => {
              this._afterConnect(p, c, l);
            }, (v) => {
              this._clients = this._clients.filter((m) => m !== p), p.end(() => {
                this._pulseQueue(), c.timedOut || c.callback(v, void 0, t);
              });
            });
            return;
          }
          return this._afterConnect(p, c, l);
        }
      });
    }
    _afterConnect(c, p, l) {
      if (this.options.maxLifetimeSeconds !== 0) {
        const f = setTimeout(() => {
          this.log("ending client due to expired lifetime"), this._expired.add(c), this._idle.findIndex((y) => y.client === c) !== -1 && this._acquireClient(c, new s((y, v, m) => m()), l, false);
        }, this.options.maxLifetimeSeconds * 1e3);
        f.unref(), c.once("end", () => clearTimeout(f));
      }
      return this._acquireClient(c, p, l, true);
    }
    _acquireClient(c, p, l, f) {
      f && this.emit("connect", c), this.emit("acquire", c), c.release = this._releaseOnce(c, l), c.removeListener("error", l), p.timedOut ? f && this.options.verify ? this.options.verify(c, c.release) : c.release() : f && this.options.verify ? this.options.verify(c, (h) => {
        if (h) return c.release(h), p.callback(h, void 0, t);
        p.callback(void 0, c, c.release);
      }) : p.callback(void 0, c, c.release);
    }
    _releaseOnce(c, p) {
      let l = false;
      return (f) => {
        l && i(), l = true, this._release(c, p, f);
      };
    }
    _release(c, p, l) {
      if (c.on("error", p), c._poolUseCount = (c._poolUseCount || 0) + 1, this.emit("release", l, c), l || this.ending || !c._queryable || c._ending || c._poolUseCount >= this.options.maxUses) return c._poolUseCount >= this.options.maxUses && this.log("remove expended client"), this._remove(c, this._pulseQueue.bind(this));
      if (this._expired.has(c)) return this.log("remove expired client"), this._expired.delete(c), this._remove(c, this._pulseQueue.bind(this));
      let h;
      this.options.idleTimeoutMillis && this._isAboveMin() && (h = setTimeout(() => {
        this._isAboveMin() && (this.log("remove idle client"), this._remove(c, this._pulseQueue.bind(this)));
      }, this.options.idleTimeoutMillis), this.options.allowExitOnIdle && h.unref()), this.options.allowExitOnIdle && c.unref(), this._idle.push(new r(c, p, h)), this._pulseQueue();
    }
    query(c, p, l) {
      if (typeof c == "function") {
        const h = o(this.Promise, c);
        return setImmediate(function() {
          return h.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
        }), h.result;
      }
      typeof p == "function" && (l = p, p = void 0);
      const f = o(this.Promise, l);
      return l = f.callback, this.connect((h, y) => {
        if (h) return l(h);
        let v = false;
        const m = (w) => {
          v || (v = true, y.release(w), l(w));
        };
        y.once("error", m), this.log("dispatching query");
        try {
          y.query(c, p, (w, S) => {
            if (this.log("query dispatched"), y.removeListener("error", m), !v) return v = true, y.release(w), w ? l(w) : l(void 0, S);
          });
        } catch (w) {
          return y.release(w), l(w);
        }
      }), f.result;
    }
    end(c) {
      if (this.log("ending"), this.ending) {
        const l = new Error("Called end on pool more than once");
        return c ? c(l) : this.Promise.reject(l);
      }
      this.ending = true;
      const p = o(this.Promise, c);
      return this._endCallback = p.callback, this._pulseQueue(), p.result;
    }
    get waitingCount() {
      return this._pendingQueue.length;
    }
    get idleCount() {
      return this._idle.length;
    }
    get expiredCount() {
      return this._clients.reduce((c, p) => c + (this._expired.has(p) ? 1 : 0), 0);
    }
    get totalCount() {
      return this._clients.length;
    }
  }
  return Bn = u, Bn;
}
var Fn = { exports: {} };
const ha = {}, ga = Object.freeze(Object.defineProperty({ __proto__: null, default: ha }, Symbol.toStringTag, { value: "Module" })), ya = oo(ga);
var $n = { exports: {} }, fs;
function wa() {
  if (fs) return $n.exports;
  fs = 1;
  const e = wt$1.EventEmitter, t = yt$1, n = kt$1(), r = $n.exports = function(i, o, a) {
    e.call(this), i = n.normalizeQueryConfig(i, o, a), this.text = i.text, this.values = i.values, this.name = i.name, this.queryMode = i.queryMode, this.callback = i.callback, this.state = "new", this._arrayMode = i.rowMode === "array", this._emitRowEvents = false, this.on("newListener", function(u) {
      u === "row" && (this._emitRowEvents = true);
    }.bind(this));
  };
  t.inherits(r, e);
  const s = { sqlState: "code", statementPosition: "position", messagePrimary: "message", context: "where", schemaName: "schema", tableName: "table", columnName: "column", dataTypeName: "dataType", constraintName: "constraint", sourceFile: "file", sourceLine: "line", sourceFunction: "routine" };
  return r.prototype.handleError = function(i) {
    const o = this.native.pq.resultErrorFields();
    if (o) for (const a in o) {
      const u = s[a] || a;
      i[u] = o[a];
    }
    this.callback ? this.callback(i) : this.emit("error", i), this.state = "error";
  }, r.prototype.then = function(i, o) {
    return this._getPromise().then(i, o);
  }, r.prototype.catch = function(i) {
    return this._getPromise().catch(i);
  }, r.prototype._getPromise = function() {
    return this._promise ? this._promise : (this._promise = new Promise(function(i, o) {
      this._once("end", i), this._once("error", o);
    }.bind(this)), this._promise);
  }, r.prototype.submit = function(i) {
    this.state = "running";
    const o = this;
    this.native = i.native, i.native.arrayMode = this._arrayMode;
    let a = function(u, d, c) {
      if (i.native.arrayMode = false, setImmediate(function() {
        o.emit("_done");
      }), u) return o.handleError(u);
      o._emitRowEvents && (c.length > 1 ? d.forEach((p, l) => {
        p.forEach((f) => {
          o.emit("row", f, c[l]);
        });
      }) : d.forEach(function(p) {
        o.emit("row", p, c);
      })), o.state = "end", o.emit("end", c), o.callback && o.callback(null, c);
    };
    if (process.domain && (a = process.domain.bind(a)), this.name) {
      this.name.length > 63 && (console.error("Warning! Postgres only supports 63 characters for query names."), console.error("You supplied %s (%s)", this.name, this.name.length), console.error("This can cause conflicts and silent errors executing queries"));
      const u = (this.values || []).map(n.prepareValue);
      if (i.namedQueries[this.name]) {
        if (this.text && i.namedQueries[this.name] !== this.text) {
          const d = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
          return a(d);
        }
        return i.native.execute(this.name, u, a);
      }
      return i.native.prepare(this.name, this.text, u.length, function(d) {
        return d ? a(d) : (i.namedQueries[o.name] = o.text, o.native.execute(o.name, u, a));
      });
    } else if (this.values) {
      if (!Array.isArray(this.values)) {
        const d = new Error("Query values must be an array");
        return a(d);
      }
      const u = this.values.map(n.prepareValue);
      i.native.query(this.text, u, a);
    } else this.queryMode === "extended" ? i.native.query(this.text, [], a) : i.native.query(this.text, a);
  }, $n.exports;
}
var ms;
function va() {
  if (ms) return Fn.exports;
  ms = 1;
  const e = yt$1;
  var t;
  try {
    t = ya;
  } catch (d) {
    throw d;
  }
  const n = pr(), r = wt$1.EventEmitter, s = yt$1, i = qi(), o = wa(), a = e.deprecate(() => {
  }, "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."), u = Fn.exports = function(d) {
    r.call(this), d = d || {}, this._Promise = d.Promise || rr.Promise, this._types = new n(d.types), this.native = new t({ types: this._types }), this._queryQueue = [], this._ending = false, this._connecting = false, this._connected = false, this._queryable = true;
    const c = this.connectionParameters = new i(d);
    d.nativeConnectionString && (c.nativeConnectionString = d.nativeConnectionString), this.user = c.user, Object.defineProperty(this, "password", { configurable: true, enumerable: false, writable: true, value: c.password }), this.database = c.database, this.host = c.host, this.port = c.port, this.namedQueries = {};
  };
  return u.Query = o, s.inherits(u, r), u.prototype._errorAllQueries = function(d) {
    const c = (p) => {
      process.nextTick(() => {
        p.native = this.native, p.handleError(d);
      });
    };
    this._hasActiveQuery() && (c(this._activeQuery), this._activeQuery = null), this._queryQueue.forEach(c), this._queryQueue.length = 0;
  }, u.prototype._connect = function(d) {
    const c = this;
    if (this._connecting) {
      process.nextTick(() => d(new Error("Client has already been connected. You cannot reuse a client.")));
      return;
    }
    this._connecting = true, this.connectionParameters.getLibpqConnectionString(function(p, l) {
      if (c.connectionParameters.nativeConnectionString && (l = c.connectionParameters.nativeConnectionString), p) return d(p);
      c.native.connect(l, function(f) {
        if (f) return c.native.end(), d(f);
        c._connected = true, c.native.on("error", function(h) {
          c._queryable = false, c._errorAllQueries(h), c.emit("error", h);
        }), c.native.on("notification", function(h) {
          c.emit("notification", { channel: h.relname, payload: h.extra });
        }), c.emit("connect"), c._pulseQueryQueue(true), d(null, this);
      });
    });
  }, u.prototype.connect = function(d) {
    if (d) {
      this._connect(d);
      return;
    }
    return new this._Promise((c, p) => {
      this._connect((l) => {
        l ? p(l) : c(this);
      });
    });
  }, u.prototype.query = function(d, c, p) {
    let l, f, h, y, v;
    if (d == null) throw new TypeError("Client was passed a null or undefined query");
    if (typeof d.submit == "function") h = d.query_timeout || this.connectionParameters.query_timeout, f = l = d, typeof c == "function" && (d.callback = c);
    else if (h = d.query_timeout || this.connectionParameters.query_timeout, l = new o(d, c, p), !l.callback) {
      let m, w;
      f = new this._Promise((S, A) => {
        m = S, w = A;
      }).catch((S) => {
        throw Error.captureStackTrace(S), S;
      }), l.callback = (S, A) => S ? w(S) : m(A);
    }
    return h && (v = l.callback || (() => {
    }), y = setTimeout(() => {
      const m = new Error("Query read timeout");
      process.nextTick(() => {
        l.handleError(m, this.connection);
      }), v(m), l.callback = () => {
      };
      const w = this._queryQueue.indexOf(l);
      w > -1 && this._queryQueue.splice(w, 1), this._pulseQueryQueue();
    }, h), l.callback = (m, w) => {
      clearTimeout(y), v(m, w);
    }), this._queryable ? this._ending ? (l.native = this.native, process.nextTick(() => {
      l.handleError(new Error("Client was closed and is not queryable"));
    }), f) : (this._queryQueue.length > 0 && a(), this._queryQueue.push(l), this._pulseQueryQueue(), f) : (l.native = this.native, process.nextTick(() => {
      l.handleError(new Error("Client has encountered a connection error and is not queryable"));
    }), f);
  }, u.prototype.end = function(d) {
    const c = this;
    this._ending = true, this._connected || this.once("connect", this.end.bind(this, d));
    let p;
    return d || (p = new this._Promise(function(l, f) {
      d = (h) => h ? f(h) : l();
    })), this.native.end(function() {
      c._connected = false, c._errorAllQueries(new Error("Connection terminated")), process.nextTick(() => {
        c.emit("end"), d && d();
      });
    }), p;
  }, u.prototype._hasActiveQuery = function() {
    return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
  }, u.prototype._pulseQueryQueue = function(d) {
    if (!this._connected || this._hasActiveQuery()) return;
    const c = this._queryQueue.shift();
    if (!c) {
      d || this.emit("drain");
      return;
    }
    this._activeQuery = c, c.submit(this);
    const p = this;
    c.once("_done", function() {
      p._pulseQueryQueue();
    });
  }, u.prototype.cancel = function(d) {
    this._activeQuery === d ? this.native.cancel(function() {
    }) : this._queryQueue.indexOf(d) !== -1 && this._queryQueue.splice(this._queryQueue.indexOf(d), 1);
  }, u.prototype.ref = function() {
  }, u.prototype.unref = function() {
  }, u.prototype.setTypeParser = function(d, c, p) {
    return this._types.setTypeParser(d, c, p);
  }, u.prototype.getTypeParser = function(d, c) {
    return this._types.getTypeParser(d, c);
  }, u.prototype.isConnected = function() {
    return this._connected;
  }, Fn.exports;
}
var Un, hs;
function gs() {
  return hs || (hs = 1, Un = va()), Un;
}
var ys;
function xi() {
  return ys || (ys = 1, (function(e) {
    const t = fa(), n = Jt$1(), r = Mi(), s = Ni(), i = kt$1(), o = ma(), a = pr(), { DatabaseError: u } = ki(), { escapeIdentifier: d, escapeLiteral: c } = kt$1(), p = (y) => class extends o {
      constructor(m) {
        super(m, y);
      }
    }, l = function(y) {
      this.defaults = n, this.Client = y, this.Query = this.Client.Query, this.Pool = p(this.Client), this._pools = [], this.Connection = r, this.types = Zt$1(), this.DatabaseError = u, this.TypeOverrides = a, this.escapeIdentifier = d, this.escapeLiteral = c, this.Result = s, this.utils = i;
    };
    let f = t, h = false;
    try {
      h = !!process.env.NODE_PG_FORCE_NATIVE;
    } catch {
    }
    h && (f = gs()), e.exports = new l(f), Object.defineProperty(e.exports, "native", { configurable: true, enumerable: false, get() {
      let y = null;
      try {
        y = new l(gs());
      } catch (v) {
        if (v.code !== "MODULE_NOT_FOUND") throw v;
      }
      return Object.defineProperty(e.exports, "native", { value: y }), y;
    } });
  })(ln)), ln.exports;
}
var Ia = xi();
const qe = Qs(Ia);
qe.Client;
const en = qe.Pool;
qe.Connection;
qe.types;
qe.Query;
qe.DatabaseError;
qe.escapeIdentifier;
qe.escapeLiteral;
qe.Result;
qe.TypeOverrides;
qe.defaults;
let fr$1 = class fr {
  constructor(t, n) {
    __publicField(this, "db");
    __publicField(this, "type");
    this.db = t, this.type = n;
  }
  getDrizzle() {
    return this.db;
  }
  async execute(t) {
    return this.db.execute(t);
  }
  async select(t) {
    return await this.db.select().from(t);
  }
  async selectWhere(t, n) {
    return await this.db.select().from(t).where(n);
  }
  async selectOne(t, n) {
    return (await this.db.select().from(t).where(n).limit(1))[0];
  }
  async insert(t, n) {
    return (await this.db.insert(t).values(n).returning())[0];
  }
  async insertMany(t, n) {
    return await this.db.insert(t).values(n).returning();
  }
  async update(t, n, r) {
    return await this.db.update(t).set(n).where(r).returning();
  }
  async updateOne(t, n, r) {
    return (await this.db.update(t).set(n).where(r).returning())[0];
  }
  async delete(t, n) {
    return await this.db.delete(t).where(n).returning();
  }
  async deleteOne(t, n) {
    return (await this.db.delete(t).where(n).returning())[0];
  }
  async transaction(t) {
    return await this.db.transaction(async (r) => {
      const s = new fr(r, this.type);
      return await t(s);
    });
  }
};
function Kt$1(e, t) {
  return new fr$1(e, t);
}
function oc(e) {
  if (e.d1Binding) return drizzle(e.d1Binding, { schema: He });
  if (!e.connectionString) throw new Error("Either d1Binding or connectionString must be provided");
  const t = new en({ connectionString: e.connectionString, ssl: tn(e.connectionString) });
  return drizzle$1(t, { schema: He });
}
function tn(e, t) {
  var _a2;
  try {
    const r = new URL(e).searchParams.get("sslmode");
    if (r === "disable") return false;
    if (r === "require") return { rejectUnauthorized: false };
    if (r === "verify-ca" || r === "verify-full") return { rejectUnauthorized: true };
  } catch {
  }
  return process.env.DB_TLS_REJECT_UNAUTHORIZED === "false" ? { rejectUnauthorized: false } : process.env.DB_TLS_REJECT_UNAUTHORIZED === "true" ? { rejectUnauthorized: true } : { rejectUnauthorized: (_a2 = t == null ? void 0 : t.strictDefault) != null ? _a2 : false };
}
function ac(e) {
  const t = new en({ connectionString: e, ssl: tn(e, { strictDefault: true }) });
  return drizzle$1(t, { schema: He });
}
function dc(e) {
  return drizzle(e, { schema: He });
}
function cc(e) {
  if (e.d1Binding) {
    const r = drizzle(e.d1Binding, { schema: He });
    return Kt$1(r, "d1");
  }
  if (!e.connectionString) throw new Error("Either d1Binding or connectionString must be provided");
  const t = new en({ connectionString: e.connectionString, ssl: tn(e.connectionString) }), n = drizzle$1(t, { schema: He });
  return Kt$1(n, "postgres");
}
function _a(e) {
  const t = new en({ connectionString: e, ssl: tn(e, { strictDefault: true }) }), n = drizzle$1(t, { schema: He });
  return Kt$1(n, "postgres");
}
function uc(e) {
  const t = drizzle(e, { schema: He });
  return Kt$1(t, "d1");
}
class te {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return this.db.selectOne(z$1, eq(z$1.id, t));
  }
  async findByName(t) {
    return this.db.selectOne(z$1, eq(z$1.normalizedName, t.toLowerCase()));
  }
  async findByNameAndTenant(t, n) {
    return (await this.db.select(z$1)).find((s) => s.normalizedName === t.toLowerCase() && s.tenantId === n);
  }
  async findByExactName(t) {
    return this.db.selectOne(z$1, eq(z$1.name, t.toLowerCase()));
  }
  async findByNameForTenant(t, n) {
    const r = await this.findByName(t);
    if (!(!r || !r.tenantId)) return r.tenantId === n ? r : void 0;
  }
  async searchByName(t, n = 20) {
    return (await this.db.select(z$1)).filter((s) => s.normalizedName.includes(t.toLowerCase())).slice(0, n);
  }
  async findAll(t = {}, n = {}) {
    let r = await this.db.select(z$1);
    if (t.tenantId && (r = r.filter((o) => o.tenantId === t.tenantId)), t.zoneManagement && (r = r.filter((o) => o.zoneManagement === t.zoneManagement)), t.search) {
      const o = t.search.toLowerCase();
      r = r.filter((a) => a.normalizedName.includes(o) || a.name.toLowerCase().includes(o));
    }
    const s = n.offset || 0, i = n.limit || r.length;
    return r.slice(s, s + i);
  }
  async findByZoneManagement(t, n = 100) {
    return (await this.db.selectWhere(z$1, eq(z$1.zoneManagement, t))).slice(0, n);
  }
  async create(t) {
    return await this.db.insert(z$1, { ...t, normalizedName: t.normalizedName || t.name.toLowerCase() });
  }
  async findOrCreate(t) {
    const n = t.normalizedName || t.name.toLowerCase(), r = { ...t, normalizedName: n }, i = await this.db.getDrizzle().insert(z$1).values(r).onConflictDoNothing({ target: [z$1.normalizedName, z$1.tenantId] }).returning();
    if (i.length > 0) return i[0];
    if (t.tenantId) {
      const o = await this.findByNameAndTenant(n, t.tenantId);
      if (o) return o;
      const a = await this.findByName(n);
      if (a) return a;
    } else {
      const o = await this.findByName(n);
      if (o) return o;
    }
    throw new Error(`Domain ${t.name} not found after conflict resolution`);
  }
  async update(t, n) {
    return this.db.updateOne(z$1, { ...n }, eq(z$1.id, t));
  }
  async updateZoneManagement(t, n) {
    return this.update(t, { zoneManagement: n });
  }
  async list(t = {}) {
    const { limit: n = 100, offset: r = 0 } = t;
    return (await this.db.select(z$1)).slice(r, r + n);
  }
  async count(t = {}) {
    let n = await this.db.select(z$1);
    return t.tenantId && (n = n.filter((r) => r.tenantId === t.tenantId)), t.zoneManagement && (n = n.filter((r) => r.zoneManagement === t.zoneManagement)), n.length;
  }
  async delete(t) {
    return this.db.deleteOne(z$1, eq(z$1.id, t));
  }
}
const ba = TaggedError("DbError")();
let ye$1 = class ye extends ba {
  static notFound(t, n) {
    return new ye({ message: `${t} not found: ${n}`, code: "NOT_FOUND", table: t, identifier: n });
  }
  static tenantIsolation(t, n, r) {
    return new ye({ message: `Cross-tenant access denied for ${t}`, code: "TENANT_ISOLATION", table: t, tenantId: n, resourceTenantId: r });
  }
  static alreadyExists(t, n) {
    return new ye({ message: `${t} already exists: ${n}`, code: "ALREADY_EXISTS", table: t, identifier: n });
  }
};
function lc(e) {
  return e instanceof ye$1;
}
async function pc(e, t) {
  try {
    const n = await e();
    return Result.ok(n);
  } catch (n) {
    const r = t != null ? t : ((s) => new ye$1({ message: s instanceof Error ? s.message : String(s), code: "QUERY_FAILED" }));
    return Result.err(r(n));
  }
}
function Sa(e, t, n) {
  const r = e instanceof Error ? e.message : String(e);
  return r.includes("connection") || r.includes("ECONNREFUSED") ? new ye$1({ message: r, code: "CONNECTION_ERROR", table: t, identifier: n }) : r.includes("timeout") || r.includes("ETIMEDOUT") ? new ye$1({ message: r, code: "TIMEOUT", table: t, identifier: n }) : r.includes("unique constraint") || r.includes("duplicate") ? new ye$1({ message: r, code: "ALREADY_EXISTS", table: t, identifier: n }) : new ye$1({ message: r, code: "QUERY_FAILED", table: t, identifier: n });
}
async function fc(e, t, n) {
  try {
    const r = await e();
    return r == null ? Result.err(ye$1.notFound(t, n)) : Result.ok(r);
  } catch (r) {
    return Result.err(Sa(r, t, n));
  }
}
function mc(e, t, n, r) {
  return e ? t ? t !== n ? Result.err(ye$1.tenantIsolation(r, n, t)) : Result.ok(e) : Result.ok(e) : Result.err(new ye$1({ message: `${r} not found`, code: "NOT_FOUND", table: r }));
}
function hc(e) {
  const [t, n] = Result.partition(e);
  return { ok: t, err: n };
}
function gc(e, t) {
  return Result.unwrapOr(e, t);
}
function yc(e) {
  var _a2;
  return new qo({ message: e.message, resourceType: e.table, identifier: (_a2 = e.identifier) != null ? _a2 : "" });
}
function wc(e) {
  return new Co({ message: e.message, tenantId: e.tenantId, resourceTenantId: e.resourceTenantId });
}
class Ve {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return await this.db.selectOne(X, eq(X.id, t)) || null;
  }
  async findBySnapshotId(t) {
    return this.db.selectWhere(X, eq(X.snapshotId, t));
  }
  async findBySnapshotIdAndSeverity(t, n) {
    return (await this.findBySnapshotId(t)).filter((s) => n.includes(s.severity));
  }
  async findByRuleId(t, n) {
    return (n ? await this.findBySnapshotId(n) : await this.db.select(X)).filter((s) => s.ruleId === t);
  }
  async findByType(t, n) {
    return (n ? await this.findBySnapshotId(n) : await this.db.select(X)).filter((s) => s.type === t);
  }
  async create(t) {
    return this.db.insert(X, t);
  }
  async createMany(t) {
    return t.length === 0 ? [] : this.db.insertMany(X, t);
  }
  async markAcknowledged(t, n) {
    return await this.findById(t) ? (await this.db.update(X, { acknowledgedAt: /* @__PURE__ */ new Date(), acknowledgedBy: n }, eq(X.id, t)), this.findById(t)) : null;
  }
  async markFalsePositive(t, n) {
    return await this.findById(t) ? (await this.db.update(X, { falsePositive: true, acknowledgedAt: /* @__PURE__ */ new Date(), acknowledgedBy: n }, eq(X.id, t)), this.findById(t)) : null;
  }
  async deleteBySnapshotId(t) {
    const n = await this.findBySnapshotId(t);
    return n.length === 0 ? 0 : (await this.db.delete(X, eq(X.snapshotId, t)), n.length);
  }
  async countBySeverity(t) {
    const n = await this.findBySnapshotId(t), r = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const s of n) r[s.severity] = (r[s.severity] || 0) + 1;
    return r;
  }
  async hasFindings(t) {
    return (await this.findBySnapshotId(t)).length > 0;
  }
  async findBySnapshotIdAndRulesetVersionId(t, n) {
    return (await this.findBySnapshotId(t)).filter((s) => s.rulesetVersionId === n);
  }
  async hasFindingsForRulesetVersion(t, n) {
    return (await this.findBySnapshotIdAndRulesetVersionId(t, n)).length > 0;
  }
  async deleteBySnapshotIdAndRulesetVersionId(t, n) {
    const r = await this.findBySnapshotIdAndRulesetVersionId(t, n);
    if (r.length === 0) return 0;
    for (const s of r) await this.db.delete(X, eq(X.id, s.id));
    return r.length;
  }
}
class ji {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async create(t) {
    return this.db.insert(Te, t);
  }
  async createMany(t) {
    return t.length === 0 ? [] : this.db.insertMany(Te, t);
  }
  async findBySnapshotId(t) {
    return this.db.selectWhere(Te, eq(Te.snapshotId, t));
  }
  async findByDomain(t) {
    return this.db.selectWhere(Te, eq(Te.domain, t));
  }
  async findByProvider(t) {
    return t ? this.db.selectWhere(Te, eq(Te.provider, t)) : [];
  }
  async findValidBySnapshotId(t) {
    return (await this.findBySnapshotId(t)).filter((r) => r.found === true);
  }
  async deleteBySnapshotId(t) {
    return (await this.db.delete(Te, eq(Te.snapshotId, t))).length;
  }
  async getProvidersForDomain(t) {
    const r = (await this.findByDomain(t)).filter((i) => i.found === true), s = /* @__PURE__ */ new Set();
    for (const i of r) i.provider && i.provider !== "unknown" && s.add(i.provider);
    return Array.from(s);
  }
}
class Aa {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async upsert(t) {
    return await this.findBySnapshotId(t.snapshotId) ? (await this.db.update(re$1, t, eq(re$1.snapshotId, t.snapshotId)))[0] : this.db.insert(re$1, t);
  }
  async findBySnapshotId(t) {
    return this.db.selectOne(re$1, eq(re$1.snapshotId, t));
  }
  async findLatestByDomain(t) {
    const n = await this.db.selectWhere(re$1, eq(re$1.domain, t));
    return n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime()), n[0];
  }
  async findByDomain(t) {
    const n = await this.db.selectWhere(re$1, eq(re$1.domain, t));
    return n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime()), n;
  }
  async findByProvider(t) {
    if (!t) return [];
    const n = await this.db.selectWhere(re$1, eq(re$1.detectedProvider, t));
    return n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime()), n;
  }
  async findWithoutDmarc(t = 100) {
    const n = await this.db.selectWhere(re$1, eq(re$1.hasDmarc, false));
    return n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime()), n.slice(0, t);
  }
  async findWithWeakDmarc(t = 100) {
    const n = await this.db.selectWhere(re$1, eq(re$1.dmarcPolicy, "none"));
    return n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime()), n.slice(0, t);
  }
  async findWithMtaSts() {
    const t = await this.db.selectWhere(re$1, eq(re$1.hasMtaSts, true));
    return t.sort((n, r) => new Date(r.createdAt).getTime() - new Date(n.createdAt).getTime()), t;
  }
  async deleteBySnapshotId(t) {
    return (await this.db.delete(re$1, eq(re$1.snapshotId, t))).length;
  }
  async getScoreDistribution() {
    const t = await this.db.select(re$1), n = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    for (const r of t) {
      const s = Number.parseInt(r.securityScore || "0", 10);
      s <= 20 ? n["0-20"]++ : s <= 40 ? n["21-40"]++ : s <= 60 ? n["41-60"]++ : s <= 80 ? n["61-80"]++ : n["81-100"]++;
    }
    return Object.entries(n).map(([r, s]) => ({ score: r, count: s }));
  }
}
class Le {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return await this.db.selectOne(Xe, eq(Xe.id, t)) || null;
  }
  async findBySnapshotId(t) {
    return (await this.db.selectWhere(Xe, eq(Xe.snapshotId, t))).sort((r, s) => {
      const i = r.queryName.localeCompare(s.queryName);
      return i !== 0 ? i : r.queryType.localeCompare(s.queryType);
    });
  }
  async findByQuery(t, n, r) {
    return (await this.db.select(Xe)).filter((i) => i.snapshotId === t && i.queryName === n && i.queryType === r);
  }
  async create(t) {
    return this.db.insert(Xe, t);
  }
  async createMany(t) {
    return t.length === 0 ? [] : this.db.insertMany(Xe, t);
  }
}
class rt {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async create(t) {
    return this.db.insert(fe$1, t);
  }
  async findById(t, n) {
    const r = await this.db.selectOne(fe$1, eq(fe$1.id, t));
    if (r && !(n && r.tenantId && r.tenantId !== n)) return r;
  }
  async findBySnapshotId(t, n) {
    let r = await this.db.selectWhere(fe$1, eq(fe$1.snapshotId, t));
    return n && (r = r.filter((s) => !s.tenantId || s.tenantId === n)), r;
  }
  async findByDomain(t, n) {
    let r = await this.db.selectWhere(fe$1, eq(fe$1.domain, t));
    return n && (r = r.filter((s) => !s.tenantId || s.tenantId === n)), r.sort((s, i) => new Date(i.comparedAt).getTime() - new Date(s.comparedAt).getTime()), r;
  }
  async findByTenant(t) {
    return (await this.db.select(fe$1)).filter((r) => r.tenantId === t);
  }
  async findMismatches(t) {
    let r = (await this.db.select(fe$1)).filter((s) => s.status === "mismatch" || s.status === "partial-match");
    return t && (r = r.filter((s) => s.tenantId === t)), r;
  }
  async findPendingAdjudications(t) {
    return (await this.findMismatches(t)).filter((r) => !r.adjudication);
  }
  async adjudicate(t, n, r, s) {
    return await this.findById(t) ? (await this.db.update(fe$1, { acknowledgedAt: /* @__PURE__ */ new Date(), acknowledgedBy: n, adjudication: r, adjudicationNotes: s }, eq(fe$1.id, t)))[0] : void 0;
  }
  async getStats(t) {
    let n = await this.db.select(fe$1);
    return t && (n = n.filter((r) => r.tenantId === t)), { total: n.length, matches: n.filter((r) => r.status === "match").length, mismatches: n.filter((r) => r.status === "mismatch").length, partialMatches: n.filter((r) => r.status === "partial-match").length, acknowledged: n.filter((r) => r.acknowledgedAt).length, pending: n.filter((r) => !r.acknowledgedAt && r.status !== "match").length };
  }
  async getRecent(t = 50) {
    const n = await this.db.select(fe$1);
    return n.sort((r, s) => new Date(s.comparedAt).getTime() - new Date(r.comparedAt).getTime()), n.slice(0, t);
  }
}
class nn {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async log(t) {
    return this.db.insert(Ce, t);
  }
  async findByDomain(t) {
    const n = await this.db.selectWhere(Ce, eq(Ce.domain, t));
    return n.sort((r, s) => new Date(s.requestedAt).getTime() - new Date(r.requestedAt).getTime()), n;
  }
  async findByToolType(t) {
    return t ? this.db.selectWhere(Ce, eq(Ce.toolType, t)) : [];
  }
  async findBySnapshotId(t) {
    return this.db.selectWhere(Ce, eq(Ce.snapshotId, t));
  }
  async getRecent(t = 100, n) {
    let r = await this.db.select(Ce);
    return n && (r = r.filter((s) => s.tenantId === n)), r.sort((s, i) => new Date(i.requestedAt).getTime() - new Date(s.requestedAt).getTime()), r.slice(0, t);
  }
  async getStats(t) {
    let n = await this.db.select(Ce);
    t && (n = n.filter((o) => o.tenantId === t));
    const r = {};
    for (const o of n) {
      const a = o.toolType || "unknown";
      r[a] = (r[a] || 0) + 1;
    }
    const s = n.filter((o) => o.responseStatus === "success").length, i = n.filter((o) => new Date(o.requestedAt) > new Date(Date.now() - 1440 * 60 * 1e3)).length;
    return { total: n.length, byToolType: r, successRate: n.length > 0 ? s / n.length * 100 : 0, last24h: i };
  }
}
class mr {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findActive() {
    return this.db.selectWhere(Re, eq(Re.status, "active"));
  }
  async findByProviderKey(t) {
    return this.db.selectOne(Re, eq(Re.providerKey, t));
  }
  async findAll() {
    return this.db.select(Re);
  }
  async create(t) {
    return this.db.insert(Re, t);
  }
  async update(t, n) {
    return (await this.db.update(Re, { ...n, updatedAt: /* @__PURE__ */ new Date() }, eq(Re.id, t)))[0];
  }
  async deprecate(t) {
    return (await this.db.update(Re, { status: "deprecated", updatedAt: /* @__PURE__ */ new Date() }, eq(Re.id, t)))[0];
  }
  async seedDefaults() {
    const t = [{ providerKey: "google-workspace", providerName: "Google Workspace", status: "active", baseline: { dmarc: { expectedPolicy: "quarantine", requiresRua: true }, spf: { requiredIncludes: ["_spf.google.com"] }, dkim: { requiredSelectors: ["google"], keyType: "rsa" }, mx: { expectedHosts: ["aspmx.l.google.com", "alt1.aspmx.l.google.com", "alt2.aspmx.l.google.com"] } }, dkimSelectors: ["google"], mxPatterns: ["*.google.com", "*.googlemail.com"], spfIncludes: ["_spf.google.com"], version: "1.0.0" }, { providerKey: "microsoft-365", providerName: "Microsoft 365", status: "active", baseline: { dmarc: { expectedPolicy: "quarantine", requiresRua: true }, spf: { requiredIncludes: ["spf.protection.outlook.com"] }, dkim: { requiredSelectors: ["selector1", "selector2"], keyType: "rsa" }, mx: { expectedHosts: ["*.mail.protection.outlook.com"] } }, dkimSelectors: ["selector1", "selector2"], mxPatterns: ["*.mail.protection.outlook.com"], spfIncludes: ["spf.protection.outlook.com"], version: "1.0.0" }, { providerKey: "amazon-ses", providerName: "Amazon SES", status: "active", baseline: { dmarc: { expectedPolicy: "none" }, spf: { requiredIncludes: ["amazonses.com"] }, dkim: { keyType: "rsa", keySize: 2048 } }, dkimSelectors: [], mxPatterns: ["*.amazonses.com"], spfIncludes: ["amazonses.com"], version: "1.0.0" }, { providerKey: "sendgrid", providerName: "SendGrid", status: "active", baseline: { spf: { requiredIncludes: ["sendgrid.net"] }, dkim: { requiredSelectors: ["s1", "s2"], keyType: "rsa" } }, dkimSelectors: ["s1", "s2", "smtpapi", "em1234"], mxPatterns: ["*.sendgrid.net"], spfIncludes: ["sendgrid.net"], version: "1.0.0" }, { providerKey: "mailgun", providerName: "Mailgun", status: "active", baseline: { spf: { requiredIncludes: ["mailgun.org"] }, dkim: { keyType: "rsa" } }, dkimSelectors: ["mailo", "mg"], mxPatterns: ["*.mailgun.org"], spfIncludes: ["mailgun.org"], version: "1.0.0" }];
    for (const n of t) await this.findByProviderKey(n.providerKey) || await this.create(n);
  }
}
class Li {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async create(t) {
    return this.db.insert(ft$1, t);
  }
  async findByDomain(t, n) {
    let r = await this.db.selectWhere(ft$1, eq(ft$1.domain, t));
    return n && (r = r.filter((s) => s.tenantId === n)), r.sort((s, i) => new Date(i.generatedAt).getTime() - new Date(s.generatedAt).getTime()), r;
  }
  async findCutoverReady() {
    return this.db.selectWhere(ft$1, eq(ft$1.cutoverReady, true));
  }
  async getLatestForDomain(t) {
    return (await this.findByDomain(t))[0];
  }
  async generateReport(t, n, r, s, i) {
    const a = (await t.findByDomain(n)).filter((w) => {
      const S = new Date(w.comparedAt);
      return S >= r && S <= s;
    }), u = a.filter((w) => w.status === "match").length, d = a.filter((w) => w.status === "mismatch").length, c = a.filter((w) => w.status === "partial-match").length, p = a.filter((w) => w.adjudication).length, l = a.filter((w) => !w.adjudication && w.status !== "match").length, f = { dmarcPresent: 0, dmarcValid: 0, dmarcPolicy: 0, spfPresent: 0, spfValid: 0, dkimPresent: 0, dkimValid: 0 };
    for (const w of a) {
      const S = w.comparisons;
      for (const A of S) if (A.status === "mismatch") {
        const q = A.field.replace(/-/g, "");
        q in f && f[q]++;
      }
    }
    const h = a.length, y = h > 0 ? `${(u / h * 100).toFixed(1)}%` : "0%", v = h >= 10 && u / h >= 0.95, m = { domain: n, periodStart: r, periodEnd: s, totalComparisons: h, matchCount: u, mismatchCount: d, partialMatchCount: c, mismatchBreakdown: f, adjudicatedCount: p, pendingCount: l, matchRate: y, cutoverReady: v, cutoverNotes: v ? "Meets 95% match threshold with sufficient sample size" : `Match rate ${y} does not meet 95% threshold or insufficient samples`, generatedBy: i };
    return this.create(m);
  }
}
class rn {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByDomainId(t) {
    return (await this.db.selectWhere(ke, eq(ke.domainId, t))).sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime());
  }
  async findById(t, n) {
    const r = await this.db.selectOne(ke, eq(ke.id, t));
    if (r && !(n && r.tenantId !== n)) return r;
  }
  async create(t) {
    return this.db.insert(ke, t);
  }
  async update(t, n) {
    return this.db.updateOne(ke, { ...n, updatedAt: /* @__PURE__ */ new Date() }, eq(ke.id, t));
  }
  async delete(t) {
    await this.db.deleteOne(ke, eq(ke.id, t));
  }
}
let Mt$1 = class Mt {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByDomainId(t, n) {
    let r = await this.db.selectWhere(Ie, eq(Ie.domainId, t));
    return n && (r = r.filter((s) => s.tenantId === n)), r.sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime());
  }
  async findByTag(t, n) {
    let r = await this.db.select(Ie);
    return r = r.filter((s) => s.tag === t), n && (r = r.filter((s) => s.tenantId === n)), r;
  }
  async findDomainsByTags(t, n) {
    let r = await this.db.select(Ie);
    return r = r.filter((s) => t.includes(s.tag)), n && (r = r.filter((s) => s.tenantId === n)), [...new Set(r.map((s) => s.domainId))];
  }
  async listByTenant(t) {
    const n = await this.db.select(Ie);
    return [...new Set(n.filter((r) => r.tenantId === t).map((r) => r.tag))].sort();
  }
  async create(t) {
    return this.db.insert(Ie, t);
  }
  async delete(t) {
    await this.db.deleteOne(Ie, eq(Ie.id, t));
  }
  async deleteByDomainAndTag(t, n, r) {
    let s = await this.db.select(Ie);
    s = s.filter((o) => o.domainId === t && o.tag === n), r && (s = s.filter((o) => o.tenantId === r));
    const i = s[0];
    i && await this.db.deleteOne(Ie, eq(Ie.id, i.id));
  }
};
class sn {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByTenant(t, n) {
    let r = await this.db.select(Fe);
    return r = r.filter((s) => s.tenantId === t), n && (r = r.filter((s) => s.createdBy === n || s.isShared)), r.sort((s, i) => new Date(i.updatedAt).getTime() - new Date(s.updatedAt).getTime());
  }
  async findById(t, n) {
    const r = await this.db.selectOne(Fe, eq(Fe.id, t));
    if (r && !(n && r.tenantId !== n)) return r;
  }
  async create(t) {
    return this.db.insert(Fe, t);
  }
  async update(t, n) {
    return this.db.updateOne(Fe, { ...n, updatedAt: /* @__PURE__ */ new Date() }, eq(Fe.id, t));
  }
  async delete(t) {
    await this.db.deleteOne(Fe, eq(Fe.id, t));
  }
}
class ee {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByEntity(t, n) {
    return (await this.db.select(mt$1)).filter((s) => s.entityType === t && s.entityId === n).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime());
  }
  async findByActor(t, n = 100) {
    return (await this.db.select(mt$1)).filter((s) => s.actorId === t).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime()).slice(0, n);
  }
  async findByTenant(t, n = 100) {
    return (await this.db.select(mt$1)).filter((s) => s.tenantId === t).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime()).slice(0, n);
  }
  async create(t) {
    return this.db.insert(mt$1, t);
  }
  async createBatch(t) {
    return t.length === 0 ? [] : this.db.insertMany(mt$1, t);
  }
}
let _t$1 = class _t {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByProvider(t, n) {
    let r = await this.db.select(Me);
    return r = r.filter((s) => s.providerKey === t), n && (r = r.filter((s) => s.tenantId === n)), r;
  }
  async findById(t, n) {
    const r = await this.db.selectOne(Me, eq(Me.id, t));
    if (r && !(n && r.tenantId !== n)) return r;
  }
  async findApplicable(t, n, r, s) {
    let i = await this.db.select(Me);
    return i = i.filter((o) => o.providerKey === t && o.templateKey === n), s && (i = i.filter((o) => o.tenantId === s)), i.find((o) => !o.appliesToDomains || o.appliesToDomains.length === 0 || o.appliesToDomains.includes(r));
  }
  async create(t) {
    return this.db.insert(Me, t);
  }
  async update(t, n) {
    return this.db.updateOne(Me, { ...n, updatedAt: /* @__PURE__ */ new Date() }, eq(Me.id, t));
  }
  async delete(t) {
    await this.db.deleteOne(Me, eq(Me.id, t));
  }
};
class st {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByTenant(t) {
    return (await this.db.selectWhere(me$1, eq(me$1.tenantId, t))).sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime());
  }
  async findActiveBySchedule(t, n) {
    return (await this.db.select(me$1)).filter((s) => !(s.schedule !== t || !s.isActive || n && s.tenantId !== n));
  }
  async findByDomainId(t, n) {
    const r = await this.db.selectWhere(me$1, eq(me$1.domainId, t));
    return (n ? r.filter((i) => i.tenantId === n) : r)[0];
  }
  async create(t) {
    return this.db.insert(me$1, t);
  }
  async update(t, n) {
    return this.db.updateOne(me$1, { ...n, updatedAt: /* @__PURE__ */ new Date() }, eq(me$1.id, t));
  }
  async updateLastCheck(t) {
    await this.db.updateOne(me$1, { lastCheckAt: /* @__PURE__ */ new Date() }, eq(me$1.id, t));
  }
  async delete(t) {
    await this.db.deleteOne(me$1, eq(me$1.id, t));
  }
}
function Ta(e, t) {
  if (e === t) return true;
  switch (t) {
    case "acknowledged":
      return ["pending", "sent", "suppressed"].includes(e);
    case "resolved":
      return ["pending", "sent", "acknowledged", "suppressed"].includes(e);
    case "suppressed":
      return ["pending", "sent", "acknowledged"].includes(e);
    case "sent":
      return e === "pending";
    case "pending":
      return false;
    default:
      return false;
  }
}
let bt$1 = class bt {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findByMonitoredDomain(t) {
    return (await this.db.selectWhere(_e$1, eq(_e$1.monitoredDomainId, t))).sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime());
  }
  async findAll(t, n) {
    let r = await this.db.select(_e$1);
    r = r.filter((i) => i.tenantId === t), n.status && (r = r.filter((i) => i.status === n.status)), n.severity && (r = r.filter((i) => i.severity === n.severity)), r.sort((i, o) => new Date(o.createdAt).getTime() - new Date(i.createdAt).getTime());
    const s = r.length;
    return { alerts: r.slice(n.offset, n.offset + n.limit), total: s };
  }
  async findById(t, n) {
    const r = await this.db.selectOne(_e$1, eq(_e$1.id, t));
    if (!(!r || r.tenantId !== n)) return r;
  }
  async findPending(t) {
    let n = await this.db.selectWhere(_e$1, eq(_e$1.status, "pending"));
    return t && (n = n.filter((r) => r.tenantId === t)), n.sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime());
  }
  async findByDedupKey(t, n) {
    return (await this.db.select(_e$1)).filter((s) => s.dedupKey === t && new Date(s.createdAt) > n);
  }
  async create(t) {
    return this.db.insert(_e$1, t);
  }
  async updateStatus(t, n, r, s) {
    const i = await this.findById(t, n);
    if (!i) return;
    if (!Ta(i.status, r)) throw new Error(`Invalid alert transition: ${i.status} -> ${r}`);
    if (i.status === r) return i;
    const o = { status: r };
    return r === "acknowledged" && (s == null ? void 0 : s.acknowledgedBy) && (o.acknowledgedAt = /* @__PURE__ */ new Date(), o.acknowledgedBy = s.acknowledgedBy), r === "resolved" && (o.resolvedAt = /* @__PURE__ */ new Date(), (s == null ? void 0 : s.resolutionNote) && (o.resolutionNote = s.resolutionNote)), this.db.updateOne(_e$1, o, eq(_e$1.id, t));
  }
  async acknowledge(t, n, r) {
    return this.updateStatus(t, n, "acknowledged", { acknowledgedBy: r });
  }
  async resolve(t, n, r) {
    return this.updateStatus(t, n, "resolved", { resolutionNote: r });
  }
};
class on {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async create(t) {
    return this.db.insert($e, t);
  }
  async findById(t, n) {
    const r = await this.db.selectOne($e, eq($e.id, t));
    if (!(!r || r.tenantId !== n)) return r;
  }
  async findByToken(t) {
    const n = await this.db.select($e), r = /* @__PURE__ */ new Date();
    return n.find((s) => !(s.shareToken !== t || s.visibility !== "shared" || !s.tenantId || s.status !== "ready" || s.expiresAt && new Date(s.expiresAt) <= r));
  }
  async findByTokenRaw(t) {
    return (await this.db.select($e)).find((r) => !(r.shareToken !== t || r.visibility !== "shared" || !r.tenantId));
  }
  async listByTenant(t) {
    return (await this.db.select($e)).filter((r) => r.tenantId === t).sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime());
  }
  async expire(t, n) {
    if (await this.findById(t, n)) return this.db.updateOne($e, { status: "expired", updatedAt: /* @__PURE__ */ new Date() }, eq($e.id, t));
  }
}
let xt$1 = class xt {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return await this.db.selectOne(de, eq(de.id, t)) || null;
  }
  async findBySnapshotId(t) {
    return (await this.db.selectWhere(de, eq(de.snapshotId, t))).sort((r, s) => {
      const i = r.type.localeCompare(s.type);
      return i !== 0 ? i : r.name.localeCompare(s.name);
    });
  }
  async findByNameAndType(t, n, r) {
    return (await this.db.select(de)).find((o) => o.snapshotId === t && o.name === n && o.type === r) || null;
  }
  async create(t) {
    return this.db.insert(de, t);
  }
  async createMany(t) {
    return t.length === 0 ? [] : this.db.insertMany(de, t);
  }
  async update(t, n) {
    return this.db.updateOne(de, n, eq(de.id, t));
  }
};
let lt$1 = class lt {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async create(t) {
    return this.db.insert(pe$1, t);
  }
  async findById(t, n) {
    const r = await this.db.selectOne(pe$1, eq(pe$1.id, t));
    return !r || r.tenantId !== n ? null : r;
  }
  async findByDomain(t, n) {
    return (await this.db.selectWhere(pe$1, eq(pe$1.domain, t))).filter((s) => s.tenantId === n).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime());
  }
  async findBySnapshotId(t, n) {
    return (await this.db.selectWhere(pe$1, eq(pe$1.snapshotId, t))).filter((s) => s.tenantId === n).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime());
  }
  async findByStatus(t, n, r) {
    return (await this.db.selectWhere(pe$1, eq(pe$1.status, t))).filter((i) => i.tenantId === n).sort((i, o) => new Date(o.createdAt).getTime() - new Date(i.createdAt).getTime()).slice(0, r);
  }
  async updateStatus(t, n, r, s) {
    var _a2, _b;
    const i = await this.findById(t, n);
    if (!i) return null;
    const o = { status: r, updatedAt: /* @__PURE__ */ new Date() };
    return (s == null ? void 0 : s.assignedTo) !== void 0 && (o.assignedTo = s.assignedTo), (s == null ? void 0 : s.notes) !== void 0 && (o.notes = s.notes), r === "resolved" && (o.resolvedAt = /* @__PURE__ */ new Date()), r === "closed" && (o.resolvedAt = (_a2 = i.resolvedAt) != null ? _a2 : /* @__PURE__ */ new Date()), (_b = await this.db.updateOne(pe$1, o, eq(pe$1.id, t))) != null ? _b : null;
  }
  async close(t, n, r) {
    return this.updateStatus(t, n, "closed", { notes: r });
  }
  async list(t, n) {
    var _a2, _b, _c2;
    let r = await this.db.select(pe$1);
    r = r.filter((o) => o.tenantId === t), ((_a2 = n == null ? void 0 : n.domains) == null ? void 0 : _a2.length) && (r = r.filter((o) => {
      var _a3;
      return (_a3 = n.domains) == null ? void 0 : _a3.includes(o.domain);
    })), ((_b = n == null ? void 0 : n.statuses) == null ? void 0 : _b.length) && (r = r.filter((o) => {
      var _a3;
      return (_a3 = n.statuses) == null ? void 0 : _a3.includes(o.status);
    })), ((_c2 = n == null ? void 0 : n.priorities) == null ? void 0 : _c2.length) && (r = r.filter((o) => {
      var _a3;
      return (_a3 = n.priorities) == null ? void 0 : _a3.includes(o.priority);
    })), r = r.sort((o, a) => new Date(a.createdAt).getTime() - new Date(o.createdAt).getTime());
    const s = (n == null ? void 0 : n.offset) || 0, i = (n == null ? void 0 : n.limit) || r.length;
    return r.slice(s, s + i);
  }
  async countByStatus(t) {
    const r = (await this.db.select(pe$1)).filter((i) => i.tenantId === t), s = { open: 0, "in-progress": 0, resolved: 0, closed: 0 };
    for (const i of r) s[i.status]++;
    return s;
  }
};
let xe$1 = class xe {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return await this.db.selectOne(ue$1, eq(ue$1.id, t)) || null;
  }
  async findByVersion(t) {
    return await this.db.selectOne(ue$1, eq(ue$1.version, t)) || null;
  }
  async findActive() {
    return await this.db.selectOne(ue$1, eq(ue$1.active, true)) || null;
  }
  async list(t = 10, n = 0) {
    const r = await this.db.select(ue$1);
    return r.sort((s, i) => i.createdAt.getTime() - s.createdAt.getTime()), r.slice(n, n + t);
  }
  async create(t) {
    return t.active && await this.deactivateAll(), this.db.insert(ue$1, t);
  }
  async setActive(t) {
    return await this.findById(t) ? (await this.deactivateAll(), await this.db.update(ue$1, { active: true }, eq(ue$1.id, t)), this.findById(t)) : null;
  }
  async deactivateAll() {
    const t = await this.findActive();
    t && await this.db.update(ue$1, { active: false }, eq(ue$1.id, t.id));
  }
  async versionExists(t) {
    return await this.findByVersion(t) !== null;
  }
  async findLatest() {
    const t = await this.db.select(ue$1);
    return t.length === 0 ? null : (t.sort((n, r) => r.createdAt.getTime() - n.createdAt.getTime()), t[0]);
  }
  async count() {
    return (await this.db.select(ue$1)).length;
  }
  async getOrCreate(t, n) {
    const r = await this.findByVersion(t);
    return r || this.create({ ...n, version: t });
  }
};
let se$1 = class se {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return this.db.selectOne(K$1, eq(K$1.id, t));
  }
  async findByDomain(t, n = 50) {
    return (await this.db.selectWhere(K$1, eq(K$1.domainId, t))).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime()).slice(0, n);
  }
  async findLatestByDomain(t) {
    return (await this.db.selectWhere(K$1, eq(K$1.domainId, t))).sort((r, s) => new Date(s.createdAt).getTime() - new Date(r.createdAt).getTime())[0];
  }
  async findRecentByDomain(t, n = 6e4) {
    const r = await this.findLatestByDomain(t);
    if (!r) return;
    if (Date.now() - new Date(r.createdAt).getTime() < n) return r;
  }
  async findByState(t, n = 100) {
    return (await this.db.selectWhere(K$1, eq(K$1.resultState, t))).sort((s, i) => new Date(i.createdAt).getTime() - new Date(s.createdAt).getTime()).slice(0, n);
  }
  async create(t) {
    return this.db.insert(K$1, t);
  }
  async updateError(t, n) {
    return this.db.updateOne(K$1, { errorMessage: n }, eq(K$1.id, t));
  }
  async updateDuration(t, n) {
    return this.db.updateOne(K$1, { collectionDurationMs: n }, eq(K$1.id, t));
  }
  async list(t = {}) {
    const { limit: n = 100, offset: r = 0 } = t;
    return (await this.db.select(K$1)).sort((i, o) => new Date(o.createdAt).getTime() - new Date(i.createdAt).getTime()).slice(r, r + n);
  }
  async countByDomain(t) {
    return (await this.db.selectWhere(K$1, eq(K$1.domainId, t))).length;
  }
  async updateRulesetVersion(t, n) {
    return this.db.updateOne(K$1, { rulesetVersionId: n }, eq(K$1.id, t));
  }
  async findNeedingBackfill(t, n = {}) {
    const { domainId: r, limit: s = 100, completedOnly: i = true } = n;
    let o = await this.db.select(K$1);
    return r && (o = o.filter((a) => a.domainId === r)), i && (o = o.filter((a) => a.resultState === "complete")), o = o.filter((a) => !a.rulesetVersionId || a.rulesetVersionId !== t), o.sort((a, u) => new Date(u.createdAt).getTime() - new Date(a.createdAt).getTime()), o.slice(0, s);
  }
  async countNeedingBackfill(t, n = {}) {
    const { domainId: r, completedOnly: s = true } = n;
    let i = await this.db.select(K$1);
    r && (i = i.filter((u) => u.domainId === r)), s && (i = i.filter((u) => u.resultState === "complete"));
    const o = i.length, a = i.filter((u) => !u.rulesetVersionId || u.rulesetVersionId !== t).length;
    return { total: o, needsBackfill: a };
  }
};
let St$1 = class St {
  constructor(t) {
    __publicField(this, "db");
    this.db = t;
  }
  async findById(t) {
    return await this.db.selectOne(ge, eq(ge.id, t)) || null;
  }
  async findByFindingId(t) {
    return this.db.selectWhere(ge, eq(ge.findingId, t));
  }
  async findByFindingIds(t) {
    const n = /* @__PURE__ */ new Map();
    for (const r of t) n.set(r, []);
    for (const r of t) {
      const s = await this.findByFindingId(r);
      n.set(r, s);
    }
    return n;
  }
  async create(t) {
    return this.db.insert(ge, t);
  }
  async createMany(t) {
    return t.length === 0 ? [] : this.db.insertMany(ge, t);
  }
  async markApplied(t, n) {
    return await this.findById(t) ? (await this.db.update(ge, { appliedAt: /* @__PURE__ */ new Date(), appliedBy: n }, eq(ge.id, t)), this.findById(t)) : null;
  }
  async markDismissed(t, n, r) {
    return await this.findById(t) ? (await this.db.update(ge, { dismissedAt: /* @__PURE__ */ new Date(), dismissedBy: n, dismissalReason: r || null }, eq(ge.id, t)), this.findById(t)) : null;
  }
  async deleteByFindingId(t) {
    const n = await this.findByFindingId(t);
    return n.length === 0 ? 0 : (await this.db.delete(ge, eq(ge.findingId, t)), n.length);
  }
  async findPendingByFindingId(t) {
    return (await this.findByFindingId(t)).filter((r) => !r.appliedAt && !r.dismissedAt);
  }
  async countByState(t) {
    const n = await this.findByFindingId(t);
    return { pending: n.filter((r) => !r.appliedAt && !r.dismissedAt).length, applied: n.filter((r) => r.appliedAt).length, dismissed: n.filter((r) => r.dismissedAt).length };
  }
};
const Be = vt$1({ service: "migrations" }), ws = join(process.cwd(), "packages", "db", "src", "migrations");
async function Ra(e) {
  var _a2;
  Be.info("[Migration] Running drizzle migrations...");
  try {
    const n = (await readdir$1(ws)).filter((r) => r.endsWith(".sql") && !r.startsWith("meta")).sort();
    Be.info(`[Migration] Found ${n.length} migration files`), await e.execute(sql`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    for (const r of n) {
      if ((_a2 = (await e.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM __drizzle_migrations WHERE name = ${r}
        ) as exists;
      `)).rows[0]) == null ? void 0 : _a2.exists) {
        Be.info(`[Migration] Skipping ${r} (already applied)`);
        continue;
      }
      Be.info(`[Migration] Applying ${r}...`);
      const a = (await readFile$1(join(ws, r), "utf-8")).split("--> statement-breakpoint").map((u) => u.trim()).filter((u) => u.length > 0);
      for (const u of a) try {
        await e.execute(sql.raw(u));
      } catch (d) {
        if (["already exists", "does not exist", "cannot drop", "DuplicateObject", "duplicate_object", "no such table"].some((p) => {
          var _a3;
          return (_a3 = d.message) == null ? void 0 : _a3.includes(p);
        })) {
          Be.warn(`[Migration] Skipping statement: ${d.message}`);
          continue;
        }
        Be.error(`[Migration] Error in ${r}:`, d);
      }
      await e.execute(sql`
        INSERT INTO __drizzle_migrations (name) VALUES (${r});
      `), Be.info(`[Migration] Applied ${r}`);
    }
    Be.info("[Migration] All migrations complete");
  } catch (t) {
    throw Be.error("[Migration] Failed:", t), t;
  }
}
const Vn = vt$1({ service: "schema-repair" });
async function Pi(e) {
  var _a2;
  Vn.info("[SchemaRepair] Checking for missing columns...");
  const t = [{ table: "alerts", column: "title", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Alert'" }, { table: "alerts", column: "description", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''" }, { table: "alerts", column: "status", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'" }, { table: "alerts", column: "dedup_key", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(200)" }, { table: "alerts", column: "triggered_by_finding_id", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS triggered_by_finding_id UUID" }, { table: "alerts", column: "resolved_at", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE" }, { table: "alerts", column: "resolution_note", sql: "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT" }, { table: "shared_reports", column: "title", sql: "ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Report'" }, { table: "shared_reports", column: "description", sql: "ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS description TEXT" }, { table: "findings", column: "type", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS type VARCHAR(100) NOT NULL DEFAULT 'unknown'" }, { table: "findings", column: "title", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS title VARCHAR(200) NOT NULL DEFAULT 'Finding'" }, { table: "findings", column: "description", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''" }, { table: "findings", column: "risk_posture", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_posture VARCHAR(20) NOT NULL DEFAULT 'medium'" }, { table: "findings", column: "blast_radius", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS blast_radius VARCHAR(30) NOT NULL DEFAULT 'none'" }, { table: "findings", column: "review_only", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS review_only BOOLEAN NOT NULL DEFAULT false" }, { table: "findings", column: "rule_id", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_id VARCHAR(100) NOT NULL DEFAULT 'unknown'" }, { table: "findings", column: "rule_version", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_version VARCHAR(50) NOT NULL DEFAULT '1.0.0'" }, { table: "findings", column: "ruleset_version_id", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS ruleset_version_id UUID" }, { table: "findings", column: "acknowledged_at", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE" }, { table: "findings", column: "acknowledged_by", sql: "ALTER TABLE findings ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(100)" }, { table: "snapshots", column: "metadata", sql: "ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'" }, { table: "observations", column: "success", sql: "ALTER TABLE observations ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true" }, { table: "observations", column: "vantage_type", sql: "ALTER TABLE observations ADD COLUMN IF NOT EXISTS vantage_type VARCHAR(20)" }, { table: "observations", column: "vantage_id", sql: "ALTER TABLE observations ADD COLUMN IF NOT EXISTS vantage_id UUID" }, { table: "record_sets", column: "metadata", sql: "ALTER TABLE record_sets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'" }, { table: "suggestions", column: "effort", sql: "ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS effort VARCHAR(20) DEFAULT 'medium'" }, { table: "suggestions", column: "priority", sql: "ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50" }, { table: "suggestions", column: "resolved", sql: "ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false" }, { table: "suggestions", column: "finding_id", sql: "ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS finding_id UUID" }, { table: "monitored_domains", column: "alert_channels", sql: "ALTER TABLE monitored_domains ADD COLUMN IF NOT EXISTS alert_channels JSONB DEFAULT '{}'" }, { table: "fleet_reports", column: "config", sql: "ALTER TABLE fleet_reports ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'" }, { table: "probe_observations", column: "metadata", sql: "ALTER TABLE probe_observations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'" }, { table: "ruleset_versions", column: "created_by", sql: "ALTER TABLE ruleset_versions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'" }, { table: "saved_filters", column: "created_by", sql: "ALTER TABLE saved_filters ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'" }, { table: "template_overrides", column: "created_by", sql: "ALTER TABLE template_overrides ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'" }, { table: "shared_reports", column: "created_by", sql: "ALTER TABLE shared_reports ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT 'system'" }, { table: "audit_events", column: "target_type", sql: "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_type VARCHAR(50)" }, { table: "audit_events", column: "target_id", sql: "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS target_id UUID" }, { table: "audit_events", column: "metadata", sql: "ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'" }, { table: "domain_notes", column: "updated_at", sql: "ALTER TABLE domain_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()" }, { table: "domain_tags", column: "updated_at", sql: "ALTER TABLE domain_tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()" }, { table: "users", column: "updated_at", sql: "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()" }], n = await e.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `), r = new Set((n.rows || []).filter((i) => i.table_name && i.column_name).map((i) => `${i.table_name}.${i.column_name}`));
  let s = 0;
  for (const { table: i, column: o, sql: a } of t) if (!r.has(`${i}.${o}`)) try {
    await e.execute(sql.raw(a)), s++;
  } catch (u) {
    ((_a2 = u.message) == null ? void 0 : _a2.includes("already exists")) || Vn.warn(`[SchemaRepair] Note: ${u.message}`);
  }
  Vn.info(`[SchemaRepair] Applied ${s} column fixes`);
}
const Ea = Object.freeze(Object.defineProperty({ __proto__: null, repairSchema: Pi }, Symbol.toStringTag, { value: "Module" })), Vt$1 = vt$1({ service: "dns-ops-web", version: "1.0.0", minLevel: "info" });
let zn = null, vs = null, Is = false, _s = false;
function Da(e) {
  return typeof (e == null ? void 0 : e.ASSETS) < "u" || !!(e == null ? void 0 : e.HYPERDRIVE);
}
function qa(e) {
  return (!zn || vs !== e) && (zn = _a(e), vs = e), zn;
}
const Na = createMiddleware(async (e, t) => {
  const { databaseUrl: n, isDevelopment: r } = ir(e.env);
  if (r && !n) return Vt$1.error("DATABASE_URL is required in development mode", void 0, { hint: "Set DATABASE_URL environment variable", code: "DB_CONFIG_MISSING" }), e.req.path.startsWith("/api/") ? e.json({ error: "Database configuration error", message: "DATABASE_URL is required in development mode", code: "DB_CONFIG_MISSING" }, 503) : await t();
  if (!n && Da(e.env) && (Is || (Is = true, Vt$1.warn("No database connection available", { code: "DB_UNAVAILABLE" })), e.req.path.startsWith("/api/") && e.req.path !== "/api/health")) return e.json({ error: "Database unavailable", message: "Database connection not configured", code: "DB_UNAVAILABLE" }, 503);
  if (n) {
    const s = qa(n);
    e.set("db", s), _s || (_s = true, (async () => {
      try {
        await Ra(s);
      } catch (i) {
        Vt$1.error("Background migration failed:", i);
      }
      try {
        await Pi(s);
      } catch (i) {
        Vt$1.error("Background schema repair failed:", i);
      }
    })());
  }
  return await t();
}), Hn = { INFRA_CONFIG_MISSING: "INFRA_CONFIG_MISSING" };
let Xn;
function P() {
  var _a2;
  if (!Xn) {
    const e = typeof process < "u" && ((_a2 = process.env) == null ? void 0 : _a2.NODE_ENV) === "development";
    Xn = vt$1({ service: "dns-ops-web", version: "0.1.0", minLevel: e ? "debug" : "info", pretty: e });
  }
  return Xn;
}
function Ca(e) {
  P().info("Product event: search", { eventType: "product_search", ...e });
}
function bs(e) {
  P().info("Product event: mail_check", { eventType: "product_mail_check", ...e });
}
function Oi(e) {
  P().info("Product event: diff", { eventType: "product_diff", ...e });
}
function ka(e) {
  P().info("Product event: legacy_open", { eventType: "product_legacy_open", ...e });
}
function Ma(e) {
  P().info("Product event: report", { eventType: "product_report", ...e });
}
function hr(e) {
  P().info("Product event: alert", { eventType: "product_alert", ...e });
}
const xa = 3, Yn = 3e4;
class ja {
  constructor() {
    __publicField(this, "state", "closed");
    __publicField(this, "consecutiveFailures", 0);
    __publicField(this, "lastFailureAt", 0);
    __publicField(this, "halfOpenProbeInFlight", false);
  }
  getState() {
    return this.state === "open" && Date.now() - this.lastFailureAt >= Yn && (this.state = "half-open"), this.state;
  }
  allowRequest() {
    const t = this.getState();
    return t === "closed" ? true : t === "half-open" ? this.halfOpenProbeInFlight ? false : (this.halfOpenProbeInFlight = true, true) : false;
  }
  recordSuccess() {
    this.consecutiveFailures = 0, this.state = "closed", this.halfOpenProbeInFlight = false;
  }
  recordFailure() {
    this.consecutiveFailures++, this.lastFailureAt = Date.now(), this.halfOpenProbeInFlight = false, this.consecutiveFailures >= xa && (this.state = "open");
  }
  getInfo() {
    return { state: this.getState(), consecutiveFailures: this.consecutiveFailures, lastFailureAt: this.lastFailureAt };
  }
  reset() {
    this.state = "closed", this.consecutiveFailures = 0, this.lastFailureAt = 0, this.halfOpenProbeInFlight = false;
  }
}
const et = new ja();
function La(e, t) {
  const n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const { collectorUrl: s, internalSecret: i, isProduction: o } = ir(e.env), a = {};
  return i ? (a["X-Internal-Secret"] = i, a["X-Tenant-Id"] = n, a["X-Actor-Id"] = r, { collectorUrl: s, headers: a }) : o ? e.json({ error: "Collector integration is not configured" }, 503) : (a["X-Dev-Tenant"] = n, a["X-Dev-Actor"] = r, { collectorUrl: s, headers: a });
}
async function gr(e, t) {
  if (!et.allowRequest()) {
    const i = et.getInfo();
    return P().warn("[CollectorProxy] Circuit open \u2014 rejecting request", { path: t.path, requestId: e.req.header("X-Request-ID") || crypto.randomUUID(), tenantId: e.get("tenantId"), ...i }), e.json({ error: "Collector service temporarily unavailable", message: `Circuit breaker is ${i.state} after ${i.consecutiveFailures} consecutive failures. Retrying in ${Math.max(0, Math.ceil((Yn - (Date.now() - i.lastFailureAt)) / 1e3))}s.`, retryAfterSeconds: Math.max(0, Math.ceil((Yn - (Date.now() - i.lastFailureAt)) / 1e3)) }, 503);
  }
  const n = La(e);
  if (n instanceof Response) return n;
  const r = `${n.collectorUrl}${t.path}`, s = e.req.header("X-Request-ID") || crypto.randomUUID();
  try {
    const i = { "Content-Type": "application/json", "X-Request-ID": s, ...n.headers, ...t.headers }, o = await fetch(r, { method: t.method, headers: i, body: t.body });
    if (o.status >= 500) {
      et.recordFailure();
      const u = await o.json().catch(() => ({ error: "Collector error" }));
      return e.json({ error: u.error || "Collector request failed", message: u.message }, o.status);
    }
    if (et.recordSuccess(), !o.ok) {
      const u = await o.json().catch(() => ({ error: "Request failed" }));
      return e.json(u, o.status);
    }
    const a = await o.json();
    return { ok: true, status: o.status, json: a };
  } catch (i) {
    et.recordFailure();
    const o = et.getInfo();
    return P().error("[CollectorProxy] Network error: collector unreachable", i instanceof Error ? i : new Error(String(i)), { path: t.path, method: t.method, requestId: e.req.header("X-Request-ID") || crypto.randomUUID(), tenantId: e.get("tenantId"), circuitState: o.state, consecutiveFailures: o.consecutiveFailures }), e.json({ error: "Failed to connect to collector service", message: i instanceof Error ? i.message : "Unknown error", circuitState: o.state }, 503);
  }
}
function Bi(e, t, n, r, s, i) {
  const o = Pa(n, r), a = Oa(n, r), u = Ba(s, i), d = Fa(e, t), c = $a(e.rulesetVersion, t.rulesetVersion), p = [...o, ...u], l = { totalChanges: p.filter((h) => h.type !== "unchanged").length, additions: p.filter((h) => h.type === "added").length, deletions: p.filter((h) => h.type === "removed").length, modifications: p.filter((h) => h.type === "modified").length, unchanged: p.filter((h) => h.type === "unchanged").length }, f = { totalChanges: u.filter((h) => h.type !== "unchanged").length, added: u.filter((h) => h.type === "added").length, removed: u.filter((h) => h.type === "removed").length, modified: u.filter((h) => h.type === "modified").length, unchanged: u.filter((h) => h.type === "unchanged").length, severityChanges: u.filter((h) => {
    var _a2;
    return (_a2 = h.changes) == null ? void 0 : _a2.severity;
  }).length };
  return { snapshotA: { id: e.id, createdAt: e.createdAt, rulesetVersion: e.rulesetVersion }, snapshotB: { id: t.id, createdAt: t.createdAt, rulesetVersion: t.rulesetVersion }, comparison: { recordChanges: o, ttlChanges: a, findingChanges: u, scopeChanges: d, rulesetChange: c }, summary: l, findingsSummary: f };
}
function Pa(e, t) {
  const n = [], r = (o) => `${o.name}|${o.type}`, s = new Map(e.map((o) => [r(o), o])), i = new Map(t.map((o) => [r(o), o]));
  for (const [o, a] of s) {
    const u = i.get(o);
    if (!u) n.push({ type: "removed", name: a.name, recordType: a.type, valuesA: a.values });
    else {
      const d = new Set(a.values), c = new Set(u.values), p = [...c].filter((f) => !d.has(f)), l = [...d].filter((f) => !c.has(f));
      p.length === 0 && l.length === 0 ? n.push({ type: "unchanged", name: a.name, recordType: a.type, valuesA: a.values, valuesB: u.values }) : n.push({ type: "modified", name: a.name, recordType: a.type, valuesA: a.values, valuesB: u.values, diff: { added: p, removed: l } });
    }
  }
  for (const [o, a] of i) s.has(o) || n.push({ type: "added", name: a.name, recordType: a.type, valuesB: a.values });
  return n;
}
function Oa(e, t) {
  const n = [], r = (o) => `${o.name}|${o.type}`, s = new Map(e.map((o) => [r(o), o])), i = new Map(t.map((o) => [r(o), o]));
  for (const [o, a] of s) {
    const u = i.get(o);
    u && a.ttl !== u.ttl && n.push({ name: a.name, recordType: a.type, ttlA: a.ttl || 0, ttlB: u.ttl || 0, change: u.ttl && a.ttl ? Math.round((u.ttl - a.ttl) / a.ttl * 100) : 0 });
  }
  return n;
}
function Ba(e, t) {
  var _a2, _b, _c2, _d2, _e2, _f, _g, _h;
  const n = [], r = (o) => `${o.type}|${o.ruleId}`, s = new Map(e.map((o) => [r(o), o])), i = new Map(t.map((o) => [r(o), o]));
  for (const [o, a] of s) {
    const u = i.get(o);
    if (!u) n.push({ type: "removed", findingType: a.type, title: a.title, severityA: a.severity, confidenceA: a.confidence, ruleId: a.ruleId, ruleVersionA: a.ruleVersion, evidenceCountA: (_b = (_a2 = a.evidence) == null ? void 0 : _a2.length) != null ? _b : 0 });
    else {
      const d = {};
      a.severity !== u.severity && (d.severity = { from: a.severity, to: u.severity }), a.confidence !== u.confidence && (d.confidence = { from: a.confidence, to: u.confidence }), a.ruleVersion !== u.ruleVersion && (d.ruleVersion = { from: a.ruleVersion, to: u.ruleVersion });
      const c = (_d2 = (_c2 = a.evidence) == null ? void 0 : _c2.length) != null ? _d2 : 0, p = (_f = (_e2 = u.evidence) == null ? void 0 : _e2.length) != null ? _f : 0;
      if (c !== p && (d.evidenceCount = { from: c, to: p }), Object.keys(d).length > 0) {
        const f = [];
        d.severity && f.push(`severity: ${d.severity.from} \u2192 ${d.severity.to}`), d.confidence && f.push(`confidence: ${d.confidence.from} \u2192 ${d.confidence.to}`), d.ruleVersion && f.push(`rule version: ${d.ruleVersion.from} \u2192 ${d.ruleVersion.to}`), d.evidenceCount && f.push(`evidence: ${d.evidenceCount.from} \u2192 ${d.evidenceCount.to}`), n.push({ type: "modified", findingType: a.type, title: u.title, severityA: a.severity, severityB: u.severity, confidenceA: a.confidence, confidenceB: u.confidence, ruleId: a.ruleId, ruleVersionA: a.ruleVersion, ruleVersionB: u.ruleVersion, evidenceCountA: c, evidenceCountB: p, description: f.join("; "), changes: d });
      } else n.push({ type: "unchanged", findingType: a.type, title: a.title, severityA: a.severity, confidenceA: a.confidence, ruleId: a.ruleId, ruleVersionA: a.ruleVersion, evidenceCountA: c });
    }
  }
  for (const [o, a] of i) s.has(o) || n.push({ type: "added", findingType: a.type, title: a.title, severityB: a.severity, confidenceB: a.confidence, ruleId: a.ruleId, ruleVersionB: a.ruleVersion, evidenceCountB: (_h = (_g = a.evidence) == null ? void 0 : _g.length) != null ? _h : 0 });
  return n;
}
function Fa(e, t) {
  const n = t.queriedNames.filter((u) => !e.queriedNames.includes(u)), r = e.queriedNames.filter((u) => !t.queriedNames.includes(u)), s = t.queriedTypes.filter((u) => !e.queriedTypes.includes(u)), i = e.queriedTypes.filter((u) => !t.queriedTypes.includes(u)), o = t.vantages.filter((u) => !e.vantages.includes(u)), a = e.vantages.filter((u) => !t.vantages.includes(u));
  return n.length === 0 && r.length === 0 && s.length === 0 && i.length === 0 && o.length === 0 && a.length === 0 ? null : { type: "scope-changed", namesAdded: n, namesRemoved: r, typesAdded: s, typesRemoved: i, vantagesAdded: o, vantagesRemoved: a, message: "Query scope changed between snapshots" };
}
function $a(e, t) {
  return e === t ? null : { type: "ruleset-changed", versionA: e, versionB: t, message: `Ruleset version changed from ${e} to ${t}` };
}
var Qn, Ss;
function Ua() {
  if (Ss) return Qn;
  Ss = 1;
  const e = 2147483647, t = 36, n = 1, r = 26, s = 38, i = 700, o = 72, a = 128, u = "-", d = /^xn--/, c = /[^\0-\x7F]/, p = /[\x2E\u3002\uFF0E\uFF61]/g, l = { overflow: "Overflow: input needs wider integers to process", "not-basic": "Illegal input >= 0x80 (not a basic code point)", "invalid-input": "Invalid input" }, f = t - n, h = Math.floor, y = String.fromCharCode;
  function v(_) {
    throw new RangeError(l[_]);
  }
  function m(_, M) {
    const N = [];
    let j = _.length;
    for (; j--; ) N[j] = M(_[j]);
    return N;
  }
  function w(_, M) {
    const N = _.split("@");
    let j = "";
    N.length > 1 && (j = N[0] + "@", _ = N[1]), _ = _.replace(p, ".");
    const U = _.split("."), V = m(U, M).join(".");
    return j + V;
  }
  function S(_) {
    const M = [];
    let N = 0;
    const j = _.length;
    for (; N < j; ) {
      const U = _.charCodeAt(N++);
      if (U >= 55296 && U <= 56319 && N < j) {
        const V = _.charCodeAt(N++);
        (V & 64512) == 56320 ? M.push(((U & 1023) << 10) + (V & 1023) + 65536) : (M.push(U), N--);
      } else M.push(U);
    }
    return M;
  }
  const A = (_) => String.fromCodePoint(..._), q = function(_) {
    return _ >= 48 && _ < 58 ? 26 + (_ - 48) : _ >= 65 && _ < 91 ? _ - 65 : _ >= 97 && _ < 123 ? _ - 97 : t;
  }, R = function(_, M) {
    return _ + 22 + 75 * (_ < 26) - ((M != 0) << 5);
  }, g = function(_, M, N) {
    let j = 0;
    for (_ = N ? h(_ / i) : _ >> 1, _ += h(_ / M); _ > f * r >> 1; j += t) _ = h(_ / f);
    return h(j + (f + 1) * _ / (_ + s));
  }, b = function(_) {
    const M = [], N = _.length;
    let j = 0, U = a, V = o, le = _.lastIndexOf(u);
    le < 0 && (le = 0);
    for (let ne = 0; ne < le; ++ne) _.charCodeAt(ne) >= 128 && v("not-basic"), M.push(_.charCodeAt(ne));
    for (let ne = le > 0 ? le + 1 : 0; ne < N; ) {
      const he = j;
      for (let ce = 1, ve = t; ; ve += t) {
        ne >= N && v("invalid-input");
        const Oe = q(_.charCodeAt(ne++));
        Oe >= t && v("invalid-input"), Oe > h((e - j) / ce) && v("overflow"), j += Oe * ce;
        const Je = ve <= V ? n : ve >= V + r ? r : ve - V;
        if (Oe < Je) break;
        const Rt = t - Je;
        ce > h(e / Rt) && v("overflow"), ce *= Rt;
      }
      const Q = M.length + 1;
      V = g(j - he, Q, he == 0), h(j / Q) > e - U && v("overflow"), U += h(j / Q), j %= Q, M.splice(j++, 0, U);
    }
    return String.fromCodePoint(...M);
  }, I = function(_) {
    const M = [];
    _ = S(_);
    const N = _.length;
    let j = a, U = 0, V = o;
    for (const he of _) he < 128 && M.push(y(he));
    const le = M.length;
    let ne = le;
    for (le && M.push(u); ne < N; ) {
      let he = e;
      for (const ce of _) ce >= j && ce < he && (he = ce);
      const Q = ne + 1;
      he - j > h((e - U) / Q) && v("overflow"), U += (he - j) * Q, j = he;
      for (const ce of _) if (ce < j && ++U > e && v("overflow"), ce === j) {
        let ve = U;
        for (let Oe = t; ; Oe += t) {
          const Je = Oe <= V ? n : Oe >= V + r ? r : Oe - V;
          if (ve < Je) break;
          const Rt = ve - Je, _r = t - Je;
          M.push(y(R(Je + Rt % _r, 0))), ve = h(Rt / _r);
        }
        M.push(y(R(ve, 0))), V = g(U, Q, ne === le), U = 0, ++ne;
      }
      ++U, ++j;
    }
    return M.join("");
  };
  return Qn = { version: "2.3.1", ucs2: { decode: S, encode: A }, decode: b, encode: I, toASCII: function(_) {
    return w(_, function(M) {
      return c.test(M) ? "xn--" + I(M) : M;
    });
  }, toUnicode: function(_) {
    return w(_, function(M) {
      return d.test(M) ? b(M.slice(4).toLowerCase()) : M;
    });
  } }, Qn;
}
var Va = Ua();
const Fi = Qs(Va), { toASCII: $i, toUnicode: za } = Fi, Zn = "xn--";
class Ae extends Error {
  constructor(t, n) {
    super(t);
    __publicField(this, "code");
    this.code = n, this.name = "DomainNormalizationError";
  }
}
function Xa(e) {
  return e.startsWith(Zn);
}
function Ui(e) {
  if (!e || typeof e != "string") return false;
  const t = e.trim();
  if (t.length > 253) return false;
  const n = t.replace(/\.$/, "");
  if (n.length === 0 || n.includes("..")) return false;
  const r = n.split(".");
  for (const s of r) {
    if (s.length === 0 || s.length > 63 || s.startsWith("-") || s.endsWith("-")) return false;
    try {
      const i = $i(s);
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(i) && !i.startsWith(Zn)) return false;
    } catch {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(s) && !s.startsWith(Zn)) return false;
    }
  }
  return true;
}
function Qa(e) {
  if (!e || typeof e != "string") throw new Ae("Domain name is required", "EMPTY_DOMAIN");
  const t = e.trim();
  if (t.length === 0) throw new Ae("Domain name cannot be empty", "EMPTY_DOMAIN");
  if (t.length > 253) throw new Ae("Domain name exceeds maximum length of 253 characters", "DOMAIN_TOO_LONG");
  const r = t.toLowerCase().replace(/\.$/, "");
  if (r.includes("..")) throw new Ae("Domain contains consecutive dots", "DOUBLE_DOT");
  const s = r.split("."), i = [], o = [];
  for (const d of s) {
    if (d.length === 0) throw new Ae("Domain contains empty label", "INVALID_FORMAT");
    if (d.length > 63) throw new Ae(`Label "${d.substring(0, 20)}..." exceeds maximum length of 63 characters`, "LABEL_TOO_LONG");
    if (d.startsWith("-")) throw new Ae(`Label "${d}" starts with hyphen`, "INVALID_FORMAT");
    if (d.endsWith("-")) throw new Ae(`Label "${d}" ends with hyphen`, "INVALID_FORMAT");
    if (d.includes(" ")) throw new Ae(`Label "${d}" contains spaces`, "INVALID_CHARACTERS");
    let c, p;
    if (Xa(d)) {
      c = d;
      try {
        p = za(d);
      } catch {
        p = d;
      }
    } else if (/^[\x00-\x7F]+$/.test(d)) {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(d)) throw new Ae(`Label "${d}" contains invalid characters`, "INVALID_CHARACTERS");
      c = d, p = d;
    } else try {
      c = $i(d), p = d;
    } catch (f) {
      throw new Ae(`Failed to convert label "${d}" to punycode: ${f instanceof Error ? f.message : String(f)}`, "INVALID_CHARACTERS");
    }
    i.push(c), o.push(p);
  }
  const a = i.join("."), u = o.join(".");
  return { original: e, unicode: u, punycode: a, normalized: a };
}
const { toASCII: vc, toUnicode: Ic } = Fi;
function Ka(e) {
  if (!e.includes("v=spf1")) return null;
  const t = e.split(/\s+/).filter(Boolean), n = [], r = [];
  for (let s = 0; s < t.length; s++) {
    const i = t[s];
    if (i.startsWith("v=")) continue;
    if (i.includes("=")) {
      const [a, ...u] = i.split("=");
      r.push({ name: a, value: u.join("=") });
      continue;
    }
    const o = Wa(i);
    o && n.push(o);
  }
  return { version: "spf1", mechanisms: n, modifiers: r, raw: e };
}
function Wa(e) {
  let t = "+", n = "pass";
  e.startsWith("-") ? (t = "-", n = "fail", e = e.slice(1)) : e.startsWith("~") ? (t = "~", n = "softfail", e = e.slice(1)) : e.startsWith("?") ? (t = "?", n = "neutral", e = e.slice(1)) : e.startsWith("+") && (e = e.slice(1));
  const r = e.indexOf(":"), s = r >= 0 ? e.slice(0, r) : e, i = r >= 0 ? e.slice(r + 1) : void 0;
  return { type: s, value: i, prefix: t, prefixName: n };
}
function Ga(e) {
  if (!e.includes("v=DMARC1")) return null;
  const t = { version: "DMARC1", raw: e }, n = e.split(/\s*;\s*/).filter(Boolean);
  for (const r of n) {
    const [s, ...i] = r.split("="), o = i.join("=").trim();
    switch (s.trim()) {
      case "v":
        t.version = o;
        break;
      case "p":
        t.policy = o;
        break;
      case "sp":
        t.subdomainPolicy = o;
        break;
      case "pct":
        t.percentage = parseInt(o, 10);
        break;
      case "rua":
        t.rua = o.split(",").map((a) => a.trim());
        break;
      case "ruf":
        t.ruf = o.split(",").map((a) => a.trim());
        break;
      case "fo":
        t.fo = o;
        break;
      case "adkim":
        t.adkim = o;
        break;
      case "aspf":
        t.aspf = o;
        break;
      case "rf":
        t.rf = o;
        break;
      case "ri":
        t.ri = parseInt(o, 10);
        break;
    }
  }
  return t.policy ? t : null;
}
function tt(e, t) {
  return (n) => {
    if (n == null) throw new J(e, "MISSING_FIELD", `${e} is required`);
    if (typeof n != "string") throw new J(e, "INVALID_FORMAT", `${e} must be a string`);
    if ((t == null ? void 0 : t.minLength) && n.length < t.minLength) throw new J(e, "INVALID_FORMAT", `${e} must be at least ${t.minLength} characters`);
    if ((t == null ? void 0 : t.maxLength) && n.length > t.maxLength) throw new J(e, "INVALID_FORMAT", `${e} must be at most ${t.maxLength} characters`);
    if ((t == null ? void 0 : t.pattern) && !t.pattern.test(n)) throw new J(e, "INVALID_FORMAT", t.patternMessage || `${e} has invalid format`);
    return n;
  };
}
function Qe(e, t) {
  return (n) => {
    if (!(n == null || n === "")) return tt(e, t)(n);
  };
}
function Ha(e, t, n) {
  return (r) => {
    if (r == null) throw new J(e, "MISSING_FIELD", `${e} is required`);
    if (!Array.isArray(r)) throw new J(e, "INVALID_FORMAT", `${e} must be an array`);
    return t ? r.map((s, i) => t(s, i)) : r;
  };
}
function ht$1(e, t) {
  return (n) => {
    if (n != null) return Ha(e, t)(n);
  };
}
function Ct$1(e, t, n = true) {
  return (r) => {
    if (r == null) {
      if (n) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    if (typeof r != "string" || !t.includes(r)) throw new J(e, "INVALID_FORMAT", `${e} must be one of: ${t.join(", ")}`);
    return r;
  };
}
function Ya(e, t = true) {
  const n = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return (r) => {
    if (r == null || r === "") {
      if (t) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    if (typeof r != "string" || !n.test(r)) throw new J(e, "INVALID_FORMAT", `${e} must be a valid UUID`);
    return r;
  };
}
function Za(e, t = true) {
  const n = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (r) => {
    if (r == null || r === "") {
      if (t) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    if (typeof r != "string" || !n.test(r)) throw new J(e, "INVALID_FORMAT", `${e} must be a valid email address`);
    return r;
  };
}
function Jn(e, t = true) {
  return (n) => {
    if (n == null || n === "") {
      if (t) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    if (typeof n != "string") throw new J(e, "INVALID_FORMAT", `${e} must be a string`);
    if (!Ui(n)) throw new J(e, "INVALID_FORMAT", `${e} must be a valid domain name`);
    return Qa(n).normalized;
  };
}
function Vi(e, t = true) {
  return (n) => {
    if (n == null) {
      if (t) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    if (typeof n != "boolean") throw new J(e, "INVALID_FORMAT", `${e} must be a boolean`);
    return n;
  };
}
function er(e, t) {
  var _a2;
  const n = (_a2 = t == null ? void 0 : t.required) != null ? _a2 : true;
  return (r) => {
    if (r == null) {
      if (n) throw new J(e, "MISSING_FIELD", `${e} is required`);
      return;
    }
    const s = typeof r == "string" ? parseInt(r, 10) : r;
    if (typeof s != "number" || Number.isNaN(s) || !Number.isInteger(s)) throw new J(e, "INVALID_FORMAT", `${e} must be an integer`);
    if ((t == null ? void 0 : t.min) !== void 0 && s < t.min) throw new J(e, "INVALID_FORMAT", `${e} must be at least ${t.min}`);
    if ((t == null ? void 0 : t.max) !== void 0 && s > t.max) throw new J(e, "INVALID_FORMAT", `${e} must be at most ${t.max}`);
    return s;
  };
}
class J extends Error {
  constructor(t, n, r) {
    super(r), this.field = t, this.code = n, this.name = "FieldValidationError";
  }
}
async function Se$1(e, t) {
  let n;
  try {
    n = await e.req.json();
  } catch {
    return { success: false, error: { code: "INVALID_JSON", message: "Invalid JSON in request body" } };
  }
  if (typeof n != "object" || n === null) return { success: false, error: { code: "INVALID_JSON", message: "Request body must be a JSON object" } };
  const r = {}, s = {};
  for (const [i, o] of Object.entries(t)) try {
    r[i] = o(n[i]);
  } catch (a) {
    a instanceof J ? s[a.field] = a.message : s[i] = `Invalid value for ${i}`;
  }
  if (Object.keys(s).length > 0) {
    const i = Object.entries(s)[0];
    return { success: false, error: { code: "VALIDATION_ERROR", message: i[1], field: i[0], details: s } };
  }
  return { success: true, data: r };
}
function De(e, t) {
  return e.json({ error: t.message, code: t.code, field: t.field, details: t.details }, 400);
}
let Kn;
function Ke() {
  return Kn || (Kn = bo(P())), Kn;
}
function ze(e) {
  var _a2;
  const t = e.req.header("x-forwarded-for"), n = e.req.header("x-real-ip"), r = ((_a2 = t == null ? void 0 : t.split(",")[0]) == null ? void 0 : _a2.trim()) || (n == null ? void 0 : n.trim());
  if (r) return r.slice(0, 45);
}
const Ja = ["pending", "sent", "suppressed", "acknowledged", "resolved"], ed = ["critical", "high", "medium", "low", "info"], td = ["private", "tenant", "shared"], Ne = new Hono();
function nd(e) {
  return !e.includes("/reports/shared/");
}
Ne.use("*", async (e, t) => {
  const n = e.req.path;
  return nd(n) ? $(e, t) : t();
});
function As(e, t) {
  if (!e) return t;
  const n = Number.parseInt(e, 10);
  return Number.isFinite(n) && n >= 0 ? n : t;
}
async function rd(e, t) {
  const n = new st(e), r = new bt$1(e), s = await n.findByTenant(t), i = await r.findPending(t), o = { critical: i.filter((a) => a.severity === "critical").length, high: i.filter((a) => a.severity === "high").length, medium: i.filter((a) => a.severity === "medium").length, low: i.filter((a) => a.severity === "low").length };
  return { summary: { totalMonitored: s.length, activeAlerts: i.length, bySeverity: o }, alertSummary: i.slice(0, 10).map((a) => ({ title: a.title, severity: a.severity, status: a.status, createdAt: a.createdAt })), generatedAlertCount: i.length };
}
Ne.get("/reports/shared/:token", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database unavailable" }, 503);
  const n = e.req.param("token"), s = await new on(t).findByTokenRaw(n);
  return s ? s.status === "expired" ? e.json({ error: "Shared report has expired" }, 410) : s.expiresAt && new Date(s.expiresAt) <= /* @__PURE__ */ new Date() ? e.json({ error: "Shared report has expired" }, 410) : s.status !== "ready" ? e.json({ error: "Shared report is not available" }, 410) : e.json({ report: { id: s.id, title: s.title, visibility: s.visibility, status: s.status, expiresAt: s.expiresAt, createdAt: s.createdAt, summary: s.summary, alertSummary: s.alertSummary } }) : e.json({ error: "Shared report not found" }, 404);
});
Ne.get("/reports", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const s = await new on(t).listByTenant(n);
  return e.json({ reports: s });
});
Ne.post("/reports", G, async (e) => {
  var _a2, _b;
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const s = await Se$1(e, { title: Qe("title", { minLength: 3, maxLength: 200 }), visibility: Ct$1("visibility", td, false), expiresInDays: er("expiresInDays", { min: 1, max: 365, required: false }) });
  if (!s.success) return De(e, s.error);
  const i = await rd(t, n), o = (_a2 = s.data.visibility) != null ? _a2 : "shared", a = (_b = s.data.title) != null ? _b : `Shared alert report ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`, u = s.data.expiresInDays ? new Date(Date.now() + s.data.expiresInDays * 24 * 60 * 60 * 1e3) : void 0, d = o === "shared" ? crypto.randomUUID().replaceAll("-", "") : void 0, c = new on(t), p = new ee(t), l = await c.create({ tenantId: n, createdBy: r, title: a, visibility: o, status: "ready", shareToken: d, expiresAt: u, summary: i.summary, alertSummary: i.alertSummary, metadata: { redacted: true, generatedAlertCount: i.generatedAlertCount } });
  return await p.create({ action: "shared_report_created", entityType: "shared_report", entityId: l.id, actorId: r, tenantId: n, newValue: { title: l.title, visibility: l.visibility, expiresAt: l.expiresAt }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), Ma({ tenantId: n, reportType: "shared", reportId: l.id, action: o === "shared" ? "share" : "generate" }), e.json({ report: l, shareUrl: d ? `/api/alerts/reports/shared/${d}` : void 0 }, 201);
});
Ne.post("/reports/:id/expire", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const i = new on(t), o = await i.findById(s, n);
  if (!o) return e.json({ error: "Shared report not found" }, 404);
  const a = await i.expire(s, n);
  return a ? (await new ee(t).create({ action: "shared_report_expired", entityType: "shared_report", entityId: a.id, actorId: r, tenantId: n, previousValue: { status: o.status }, newValue: { status: a.status }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), e.json({ report: a })) : e.json({ error: "Shared report not found" }, 404);
});
Ne.get("/", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const r = e.req.query("status"), s = e.req.query("severity"), i = Math.min(As(e.req.query("limit"), 50), 100), o = As(e.req.query("offset"), 0);
  if (r && !Ja.includes(r)) return e.json({ error: "Invalid alert status filter" }, 400);
  if (s && !ed.includes(s)) return e.json({ error: "Invalid alert severity filter" }, 400);
  const a = new bt$1(t), { alerts: u, total: d } = await a.findAll(n, { status: r, severity: s, limit: i, offset: o });
  return e.json({ alerts: u, pagination: { total: d, limit: i, offset: o, hasMore: o + u.length < d } });
});
Ne.get("/:id", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("id");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const i = await new bt$1(t).findById(r, n);
  return i ? e.json({ alert: i }) : e.json({ error: "Alert not found" }, 404);
});
Ne.post("/:id/acknowledge", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  try {
    const i = new bt$1(t), o = await i.findById(s, n), a = await i.acknowledge(s, n, r);
    if (!a || !o) return e.json({ error: "Alert not found" }, 404);
    await new ee(t).create({ action: "alert_acknowledged", entityType: "alert", entityId: a.id, actorId: r, tenantId: n, previousValue: { status: o.status }, newValue: { status: a.status, acknowledgedBy: a.acknowledgedBy }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), hr({ tenantId: n, alertId: s, alertType: a.title, action: "acknowledge", severity: a.severity });
    const d = o.createdAt ? Date.now() - new Date(o.createdAt).getTime() : 0;
    return Ke().alerts.acknowledged({ tenantId: n, alertId: s, timeToAckMs: d }), e.json({ alert: a });
  } catch (i) {
    if (i instanceof Error && i.message.startsWith("Invalid alert transition")) return e.json({ error: i.message }, 409);
    throw i;
  }
});
Ne.post("/:id/resolve", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const o = (await e.req.json().catch(() => ({}))).resolutionNote, a = typeof o == "string" && o.slice(0, 5e3).trim() || void 0;
  try {
    const u = new bt$1(t), d = await u.findById(s, n), c = await u.resolve(s, n, a);
    if (!c || !d) return e.json({ error: "Alert not found" }, 404);
    await new ee(t).create({ action: "alert_resolved", entityType: "alert", entityId: c.id, actorId: r, tenantId: n, previousValue: { status: d.status }, newValue: { status: c.status, resolutionNote: c.resolutionNote }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), hr({ tenantId: n, alertId: s, alertType: c.title, action: "resolve", severity: c.severity });
    const l = d.createdAt ? Date.now() - new Date(d.createdAt).getTime() : 0;
    return Ke().alerts.resolved({ tenantId: n, alertId: s, timeToResolveMs: l, resolution: "manual" }), e.json({ alert: c });
  } catch (u) {
    if (u instanceof Error && u.message.startsWith("Invalid alert transition")) return e.json({ error: u.message }, 409);
    throw u;
  }
});
Ne.post("/:id/suppress", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  try {
    const i = new bt$1(t), o = await i.findById(s, n), a = await i.updateStatus(s, n, "suppressed");
    return !a || !o ? e.json({ error: "Alert not found" }, 404) : (await new ee(t).create({ action: "alert_suppressed", entityType: "alert", entityId: a.id, actorId: r, tenantId: n, previousValue: { status: o.status }, newValue: { status: a.status }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), hr({ tenantId: n, alertId: s, alertType: a.title, action: "dismiss", severity: a.severity }), Ke().alerts.suppressed({ tenantId: n, alertId: s }), e.json({ alert: a }));
  } catch (i) {
    if (i instanceof Error && i.message.startsWith("Invalid alert transition")) return e.json({ error: i.message }, 409);
    throw i;
  }
});
const At$1 = new Hono();
async function an(e, t, n) {
  const r = new se$1(t), s = new te(t), i = await r.findById(e);
  if (!i) return null;
  const o = await s.findById(i.domainId);
  return !o || n && o.tenantId && o.tenantId !== n ? null : { snapshot: i, domain: o };
}
At$1.get("/snapshot/:snapshotId/delegation", $, async (e) => {
  var _a2, _b, _c2, _d2;
  const t = e.req.param("snapshotId"), n = e.get("db"), r = e.get("tenantId"), s = await an(t, n, r);
  if (!s) return e.json({ error: "Snapshot not found" }, 404);
  const { snapshot: i } = s;
  try {
    const o = new Le(n);
    if (!((_a2 = i.metadata) == null ? void 0 : _a2.hasDelegationData)) return e.json({ snapshotId: t, message: "No delegation data available for this snapshot", delegation: null });
    const u = await o.findBySnapshotId(t), d = u.filter((l) => l.queryType === "NS" && l.queryName === i.domainName), c = u.filter((l) => (l.queryType === "A" || l.queryType === "AAAA") && l.queryName.includes(".") && !l.queryName.endsWith(i.domainName)), p = { domain: i.domainName, parentZone: (_b = i.metadata) == null ? void 0 : _b.parentZone, nameServers: d.filter((l) => l.status === "success").flatMap((l) => (l.answerSection || []).filter((f) => f.type === "NS").map((f) => ({ name: f.data, source: l.vantageIdentifier }))), glue: c.filter((l) => l.status === "success").map((l) => {
      var _a3, _b2;
      return { name: l.queryName, type: l.queryType, address: (_b2 = (_a3 = l.answerSection) == null ? void 0 : _a3[0]) == null ? void 0 : _b2.data };
    }), hasDivergence: ((_c2 = i.metadata) == null ? void 0 : _c2.hasDivergence) || false, hasDnssec: ((_d2 = i.metadata) == null ? void 0 : _d2.hasDnssec) || false };
    return e.json({ snapshotId: t, delegation: p });
  } catch (o) {
    return P().error("Error fetching delegation", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/delegation", method: "GET", tenantId: e.get("tenantId"), snapshotId: e.req.param("snapshotId") }), e.json({ error: "Failed to fetch delegation data", message: o instanceof Error ? o.message : "Unknown error" }, 500);
  }
});
At$1.get("/domain/:domain/delegation/latest", $, async (e) => {
  const t = e.req.param("domain"), n = e.get("db"), r = e.get("tenantId");
  try {
    const s = new te(n), i = new se$1(n), o = await s.findByName(t);
    if (!o) return e.json({ error: "Domain not found" }, 404);
    if (r && o.tenantId && o.tenantId !== r) return e.json({ error: "Domain not found" }, 404);
    const u = (await i.findByDomain(o.id)).find((d) => {
      var _a2;
      return (_a2 = d.metadata) == null ? void 0 : _a2.hasDelegationData;
    });
    return u ? e.redirect(`/api/snapshot/${u.id}/delegation`) : e.json({ domain: t, message: "No delegation data available for this domain" }, 404);
  } catch (s) {
    return P().error("Error fetching latest delegation:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/delegation/latest", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch delegation data", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
At$1.get("/snapshot/:snapshotId/delegation/issues", $, async (e) => {
  const t = e.req.param("snapshotId"), n = e.get("db"), r = e.get("tenantId"), s = await an(t, n, r);
  if (!s) return e.json({ error: "Snapshot not found" }, 404);
  const { snapshot: i } = s;
  try {
    const a = await new Le(n).findBySnapshotId(t), u = a.filter((h) => h.queryType === "NS" && h.queryName === i.domainName), d = [], c = u.filter((h) => h.status === "success"), p = c.map((h) => (h.answerSection || []).filter((y) => y.type === "NS").map((y) => y.data).sort().join(","));
    [...new Set(p)].length > 1 && d.push({ type: "ns-divergence", severity: "critical", description: "Name servers differ across vantages", details: { vantages: c.map((h) => ({ source: h.vantageIdentifier, ns: (h.answerSection || []).filter((y) => y.type === "NS").map((y) => y.data) })) } });
    const f = i.metadata;
    if (f == null ? void 0 : f.nsServers) {
      for (const h of f.nsServers) if (h.toLowerCase().endsWith(`.${i.domainName.toLowerCase()}`)) {
        const y = a.find((v) => (v.queryType === "A" || v.queryType === "AAAA") && v.queryName.toLowerCase() === h.toLowerCase());
        (!y || y.status !== "success") && d.push({ type: "missing-glue", severity: "high", description: `Missing glue record for ${h}`, details: { nsServer: h } });
      }
    }
    return e.json({ snapshotId: t, domain: i.domainName, issues: d, issueCount: d.length });
  } catch (o) {
    return P().error("Error fetching delegation issues:", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/delegation", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch delegation issues", message: o instanceof Error ? o.message : "Unknown error" }, 500);
  }
});
At$1.get("/snapshot/:snapshotId/delegation/dnssec", $, async (e) => {
  const t = e.req.param("snapshotId"), n = e.get("db"), r = e.get("tenantId"), s = await an(t, n, r);
  if (!s) return e.json({ error: "Snapshot not found" }, 404);
  const { snapshot: i } = s;
  try {
    const a = await new Le(n).findBySnapshotId(t), u = a.filter((R) => R.queryType === "DS" && R.queryName === i.domainName), d = a.filter((R) => R.queryType === "DNSKEY" && R.queryName === i.domainName), c = a.filter((R) => R.queryType === "RRSIG"), p = u.filter((R) => R.status === "success").flatMap((R) => (R.answerSection || []).filter((g) => g.type === "DS").map((g) => {
      const b = g.data.split(" ");
      return { keyTag: b[0] || "", algorithm: b[1] || "", digestType: b[2] || "", digest: b.slice(3).join(" ") || "", source: R.vantageIdentifier, ttl: g.ttl };
    })), l = d.filter((R) => R.status === "success").flatMap((R) => (R.answerSection || []).filter((g) => g.type === "DNSKEY").map((g) => {
      const b = g.data.split(" "), I = parseInt(b[0] || "0", 10);
      return { flags: I, isKSK: (I & 1) !== 0, isZSK: (I & 1) === 0, protocol: b[1] || "", algorithm: b[2] || "", publicKey: b.slice(3).join(" ") || "", source: R.vantageIdentifier, ttl: g.ttl };
    })), f = new Set(c.filter((R) => R.status === "success").flatMap((R) => (R.answerSection || []).filter((g) => g.type === "RRSIG").map((g) => g.data.split(" ")[0] || ""))), h = p.length > 0, y = l.length > 0, v = l.some((R) => R.isKSK), m = l.some((R) => R.isZSK), w = f.size > 0;
    let S = "unsigned", A = "";
    h && y && w ? v && m ? (S = "signed", A = "Zone is properly DNSSEC-signed") : (S = "partially-signed", A = "Zone has DNSSEC records but may be missing KSK or ZSK") : h && !y ? (S = "broken", A = "DS record exists in parent but DNSKEY not found in zone") : y && !h ? (S = "partially-signed", A = "Zone has DNSKEY but no DS in parent (chain incomplete)") : (S = "unsigned", A = "Zone is not DNSSEC-signed");
    const q = { status: S, statusMessage: A, hasDelegationSigner: h, hasDnskey: y, hasKsk: v, hasZsk: m, hasRrsig: w, signedRecordTypes: Array.from(f), dsRecords: p, dnskeyRecords: l, chainSummary: { dsCount: p.length, dnskeyCount: l.length, kskCount: l.filter((R) => R.isKSK).length, zskCount: l.filter((R) => R.isZSK).length, signedTypeCount: f.size } };
    return e.json({ snapshotId: t, domain: i.domainName, dnssec: q });
  } catch (o) {
    return P().error("Error fetching DNSSEC evidence:", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:snapshotId/delegation/dnssec", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch DNSSEC evidence", message: o instanceof Error ? o.message : "Unknown error" }, 500);
  }
});
At$1.get("/snapshot/:snapshotId/delegation/evidence", $, async (e) => {
  var _a2, _b;
  const t = e.req.param("snapshotId"), n = e.get("db"), r = e.get("tenantId"), s = await an(t, n, r);
  if (!s) return e.json({ error: "Snapshot not found" }, 404);
  const { snapshot: i } = s;
  try {
    const a = await new Le(n).findBySnapshotId(t), d = a.filter((m) => m.queryType === "NS" && m.queryName === i.domainName).map((m) => {
      var _a3, _b2, _c2;
      const w = (m.answerSection || []).filter((S) => S.type === "NS").map((S) => ({ name: S.data, ttl: S.ttl }));
      return { vantageType: m.vantageType, vantageIdentifier: m.vantageIdentifier, status: m.status, responseTime: m.responseTimeMs, nsRecords: w, nsCount: w.length, rawResponse: { answerCount: ((_a3 = m.answerSection) == null ? void 0 : _a3.length) || 0, authorityCount: ((_b2 = m.authoritySection) == null ? void 0 : _b2.length) || 0, additionalCount: ((_c2 = m.additionalSection) == null ? void 0 : _c2.length) || 0 } };
    }), c = a.filter((m) => m.vantageType === "authoritative"), p = {};
    for (const m of c) {
      const w = m.vantageIdentifier;
      w && (p[w] || (p[w] = { hostname: w, isResponsive: false, responseDetails: [] }), m.status === "success" && (p[w].isResponsive = true), (_b = p[w].responseDetails) == null ? void 0 : _b.push({ queryName: m.queryName, queryType: m.queryType, status: m.status, responseTime: (_a2 = m.responseTimeMs) != null ? _a2 : 0 }));
    }
    const l = a.filter((m) => (m.queryType === "A" || m.queryType === "AAAA") && m.status === "success").flatMap((m) => (m.answerSection || []).filter((w) => w.type === "A" || w.type === "AAAA").map((w) => ({ hostname: m.queryName, type: w.type, address: w.data, ttl: w.ttl, source: m.vantageIdentifier }))), f = d.filter((m) => m.status === "success").map((m) => m.nsRecords.map((w) => w.name).sort().join(",")), h = new Set(f), y = h.size === 1 ? 100 : Math.round(1 / h.size * 100), v = { domain: i.domainName, vantageEvidence: d, nameserverEvidence: Object.values(p), glueRecords: l, summary: { totalVantages: d.length, successfulVantages: d.filter((m) => m.status === "success").length, consistencyScore: y, isConsistent: h.size <= 1, uniqueNsSetCount: h.size, nameserverCount: Object.keys(p).length, responsiveNameservers: Object.values(p).filter((m) => m.isResponsive).length, glueRecordCount: l.length } };
    return e.json({ snapshotId: t, evidence: v });
  } catch (o) {
    return P().error("Error fetching delegation evidence:", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/delegation", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch delegation evidence", message: o instanceof Error ? o.message : "Unknown error" }, 500);
  }
});
class yr {
  constructor(t) {
    __publicField(this, "ruleset");
    this.ruleset = t;
  }
  evaluate(t) {
    const n = [], r = [];
    for (const s of this.ruleset.rules) if (s.enabled) try {
      const i = s.evaluate(t);
      if (i == null ? void 0 : i.finding) {
        const o = { ...i.finding, id: crypto.randomUUID(), snapshotId: t.snapshotId, createdAt: /* @__PURE__ */ new Date() };
        if (n.push(o), i.suggestions) for (const a of i.suggestions) r.push({ ...a, id: crypto.randomUUID(), findingId: o.id, createdAt: /* @__PURE__ */ new Date() });
      }
    } catch (i) {
      console.error(`Rule ${s.id} failed:`, i);
    }
    return { findings: n, suggestions: r };
  }
  getRulesetVersion() {
    return this.ruleset.version;
  }
  getEnabledRulesCount() {
    return this.ruleset.rules.filter((t) => t.enabled).length;
  }
}
function dn(e, t) {
  return e !== "managed" ? "single-domain" : t === "NS" || t === "SOA" ? "subdomain-tree" : "single-domain";
}
function sd(e, t, n) {
  return e === "critical" || e === "high" || t === "related-domains" || t === "infrastructure" || t === "organization-wide" || n === "low" || n === "heuristic";
}
const id = { id: "dns.auth-failure.v1", name: "Authoritative Lookup Failure", description: "Detects timeouts and failures from authoritative nameservers", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((s) => s.vantageType === "authoritative" && (s.status === "timeout" || s.status === "refused" || s.status === "error"));
  if (t.length === 0) return null;
  const n = ud(t), r = [];
  for (const [s, i] of n) {
    const [o, a] = s.split("|"), u = [...new Set(i.map((l) => l.status))], d = u.includes("timeout") ? "high" : "medium", c = dn(e.zoneManagement, a), p = u.length === i.length ? "certain" : "high";
    r.push({ finding: { type: `dns.authoritative-${u[0]}`, title: `Authoritative ${u[0]} for ${o} ${a}`, description: `Query for ${o} (${a}) failed from ${i.length} authoritative server(s) with: ${u.join(", ")}. This may indicate nameserver issues or network problems.`, severity: d, confidence: p, riskPosture: d === "high" ? "high" : "medium", blastRadius: c, reviewOnly: sd(d, c, p), evidence: i.map((l) => ({ observationId: l.id, description: `${l.vantageIdentifier}: ${l.status}${l.errorMessage ? ` - ${l.errorMessage}` : ""}` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Check authoritative server health", description: `Verify that authoritative nameservers for ${e.domainName} are responding correctly.`, action: `Run connectivity checks to: ${[...new Set(i.map((l) => l.vantageIdentifier))].join(", ")}`, riskPosture: "low", blastRadius: c, reviewOnly: true }] });
  }
  return r[0] || null;
} }, od = { id: "dns.auth-mismatch.v1", name: "Authoritative Server Answer Mismatch", description: "Detects when different authoritative servers return different answers", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.recordSets.filter((r) => !r.isConsistent);
  if (t.length === 0) return null;
  const n = [];
  for (const r of t) {
    const s = e.observations.filter((o) => o.queryName.toLowerCase() === r.name.toLowerCase() && o.queryType === r.type && o.vantageType === "authoritative" && o.status === "success");
    if (s.length < 2) continue;
    const i = dn(e.zoneManagement, r.type);
    n.push({ finding: { type: "dns.authoritative-mismatch", title: `Authoritative mismatch for ${r.name} ${r.type}`, description: `Different authoritative servers return different answers for ${r.name} (${r.type}). Values: ${r.values.join(", ")}. Source vantages: ${r.sourceVantages.join(", ")}. This indicates zone inconsistency or ongoing propagation.`, severity: "critical", confidence: "certain", riskPosture: "critical", blastRadius: i, reviewOnly: true, evidence: s.map((o) => {
      var _a2;
      return { observationId: o.id, recordSetId: r.id, description: `${o.vantageIdentifier}: ${((_a2 = o.answerSection) == null ? void 0 : _a2.map((a) => a.data).join(", ")) || "no answer"}` };
    }), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Investigate zone inconsistency", description: "Check for zone transfer issues or configuration differences between authoritative servers.", action: `Compare zone files on: ${r.sourceVantages.filter((o) => !o.includes("(")).join(", ")}`, riskPosture: "high", blastRadius: i, reviewOnly: true }] });
  }
  return n[0] || null;
} }, ad = { id: "dns.recursive-auth-mismatch.v1", name: "Recursive vs Authoritative Mismatch", description: "Detects when public recursive resolvers disagree with authoritative servers", version: "1.0.0", enabled: true, evaluate(e) {
  const t = /* @__PURE__ */ new Map();
  for (const i of e.recordSets) {
    const o = `${i.name.toLowerCase()}|${i.type}`;
    t.set(o, i);
  }
  const n = [];
  for (const [i] of t) {
    const [o, a] = i.split("|"), u = e.observations.filter((l) => l.queryName.toLowerCase() === o.toLowerCase() && l.queryType === a && l.vantageType === "public-recursive" && l.status === "success"), d = e.observations.filter((l) => l.queryName.toLowerCase() === o.toLowerCase() && l.queryType === a && l.vantageType === "authoritative" && l.status === "success");
    if (u.length === 0 || d.length === 0) continue;
    const c = Ts(u), p = Ts(d);
    ld(Rs(c), Rs(p)) || n.push({ name: o, type: a, recursiveValues: c, authoritativeValues: p, recursiveObs: u, authObs: d });
  }
  if (n.length === 0) return null;
  const r = n[0], s = dn(e.zoneManagement, r.type);
  return { finding: { type: "dns.recursive-authoritative-mismatch", title: `Recursive/authoritative mismatch for ${r.name} ${r.type}`, description: `Public recursive resolver(s) return different values than authoritative servers for ${r.name} (${r.type}). Recursive: ${r.recursiveValues.join(", ") || "none"}. Authoritative: ${r.authoritativeValues.join(", ") || "none"}. This may indicate stale cache or propagation in progress.`, severity: "high", confidence: "certain", riskPosture: "high", blastRadius: s, reviewOnly: true, evidence: [...r.recursiveObs.map((i) => {
    var _a2;
    return { observationId: i.id, description: `Recursive (${i.vantageIdentifier}): ${((_a2 = i.answerSection) == null ? void 0 : _a2.map((o) => o.data).join(", ")) || "no answer"}` };
  }), ...r.authObs.map((i) => {
    var _a2;
    return { observationId: i.id, description: `Authoritative (${i.vantageIdentifier}): ${((_a2 = i.answerSection) == null ? void 0 : _a2.map((o) => o.data).join(", ")) || "no answer"}` };
  })], ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Check for stale cache", description: "Verify if this is a cache propagation issue or configuration problem.", action: "Compare TTL on recursive vs authoritative. Consider cache flush if values are stale.", riskPosture: "low", blastRadius: s, reviewOnly: true }] };
} }, dd = { id: "dns.cname-coexistence.v1", name: "CNAME Coexistence Conflict", description: "Detects CNAME records coexisting with other record types (RFC violation)", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.recordSets.filter((i) => i.type === "CNAME");
  if (t.length === 0) return null;
  const n = [];
  for (const i of t) {
    const o = e.recordSets.filter((a) => a.name.toLowerCase() === i.name.toLowerCase() && a.type !== "CNAME" && !["RRSIG", "NSEC", "NSEC3", "DNSKEY"].includes(a.type));
    o.length > 0 && n.push({ cname: i, conflicting: o });
  }
  if (n.length === 0) return null;
  const r = n[0], s = dn(e.zoneManagement, "CNAME");
  return { finding: { type: "dns.cname-coexistence-conflict", title: `CNAME coexistence violation at ${r.cname.name}`, description: `${r.cname.name} has a CNAME record coexisting with ${r.conflicting.map((i) => i.type).join(", ")} records. Per RFC 1034/2181, CNAME cannot coexist with other data (except DNSSEC records). This causes undefined behavior.`, severity: "critical", confidence: "certain", riskPosture: "critical", blastRadius: s, reviewOnly: true, evidence: [...e.observations.filter((i) => i.queryName.toLowerCase() === r.cname.name.toLowerCase()).map((i) => ({ observationId: i.id, description: `${i.queryType} from ${i.vantageIdentifier}` }))], ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Remove conflicting records", description: "Either remove the CNAME or the conflicting record(s). CNAME cannot coexist with other data.", action: `Choose one: keep CNAME (${r.cname.values.join(", ")}) OR keep ${r.conflicting.map((i) => `${i.type} (${i.values.join(", ")})`).join(", ")}`, riskPosture: "high", blastRadius: s, reviewOnly: true }] };
} }, cd = { id: "dns.unmanaged-partial.v1", name: "Unmanaged Zone Partial Coverage", description: "Explicitly notes that unmanaged zones have limited visibility", version: "1.0.0", enabled: true, evaluate(e) {
  if (e.zoneManagement !== "unmanaged") return null;
  const t = [...new Set(e.observations.map((r) => r.queryName))], n = [...new Set(e.observations.map((r) => r.queryType))];
  return e.observations.length === 0 ? { finding: { type: "dns.partial-coverage-unmanaged", title: `No data collected for ${e.domainName}`, description: `No observations were collected for ${e.domainName}. This is an unmanaged zone with no visibility.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: [], ruleId: this.id, ruleVersion: this.version } } : { finding: { type: "dns.partial-coverage-unmanaged", title: `Partial coverage for unmanaged zone ${e.domainName}`, description: `${e.domainName} is an unmanaged zone. Only targeted inspection was performed for: ${t.join(", ")} (types: ${n.join(", ")}). Full zone enumeration was not attempted. This is limited visibility, not authoritative completeness.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: e.observations.map((r) => ({ observationId: r.id, description: `Queried ${r.queryName} ${r.queryType}` })), ruleId: this.id, ruleVersion: this.version } };
} };
function ud(e) {
  var _a2;
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const r = `${n.queryName.toLowerCase()}|${n.queryType}`;
    t.has(r) || t.set(r, []), (_a2 = t.get(r)) == null ? void 0 : _a2.push(n);
  }
  return t;
}
function Ts(e) {
  const t = /* @__PURE__ */ new Set();
  for (const n of e) for (const r of n.answerSection || []) t.add(r.data);
  return [...t];
}
function Rs(e) {
  return [...e].sort();
}
function ld(e, t) {
  return e.length !== t.length ? false : e.every((n, r) => n === t[r]);
}
const pd = { id: "mail.mx-presence.v1", name: "MX Record Presence", description: "Detects presence or absence of MX records", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((o) => o.queryType === "MX" && o.queryName.toLowerCase() === e.domainName.toLowerCase()), n = t.filter((o) => o.status === "success"), r = n.some((o) => o.answerSection && o.answerSection.length > 0);
  if (n.find((o) => {
    var _a2;
    return (_a2 = o.answerSection) == null ? void 0 : _a2.some((a) => /^0\s+\.$/.test(a.data.trim()));
  })) return { finding: { type: "mail.null-mx-configured", title: `Null MX configured for ${e.domainName}`, description: `${e.domainName} has a Null MX record (priority 0, target "."), explicitly indicating that the domain does not accept email. This is a valid configuration for domains that should not receive mail.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: t.map((o) => ({ observationId: o.id, description: `${o.vantageType}: ${o.status}${o.answerSection ? ` - ${o.answerSection.map((a) => a.data).join(", ")}` : ""}` })), ruleId: this.id, ruleVersion: this.version } };
  if (!r) {
    const o = t.filter((a) => a.status === "timeout" || a.status === "error" || a.status === "refused");
    return o.length > 0 && n.length === 0 ? { finding: { type: "mail.mx-query-failed", title: `MX query failed for ${e.domainName}`, description: `Could not determine MX status for ${e.domainName} due to query failures: ${o.map((a) => a.status).join(", ")}. This is not the same as "no MX record".`, severity: "medium", confidence: "low", riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true, evidence: t.map((a) => ({ observationId: a.id, description: `${a.vantageType}: ${a.status}${a.errorMessage ? ` - ${a.errorMessage}` : ""}` })), ruleId: this.id, ruleVersion: this.version } } : { finding: { type: "mail.no-mx-record", title: `No MX record for ${e.domainName}`, description: `${e.domainName} has no MX record. Mail will fall back to A/AAAA record lookups (if they exist). This is discouraged per RFC 5321 but may be intentional.`, severity: "medium", confidence: "certain", riskPosture: "medium", blastRadius: "single-domain", reviewOnly: false, evidence: t.map((a) => ({ observationId: a.id, description: `${a.vantageType}: ${a.status}` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Add MX record", description: `Configure an MX record for ${e.domainName} to explicitly route mail.`, action: "Add MX record pointing to your mail server(s), or add a Null MX (0 .) if the domain should not receive mail.", riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true }] };
  }
  const i = e.recordSets.find((o) => o.type === "MX" && o.name.toLowerCase() === e.domainName.toLowerCase());
  return { finding: { type: "mail.mx-present", title: `MX record present for ${e.domainName}`, description: `${e.domainName} has MX record(s): ${(i == null ? void 0 : i.values.join(", ")) || "configured"}. Mail delivery is explicitly configured.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: t.map((o) => {
    var _a2;
    return { observationId: o.id, description: `${o.vantageType}: ${((_a2 = o.answerSection) == null ? void 0 : _a2.map((a) => a.data).join(", ")) || "no answer"}` };
  }), ruleId: this.id, ruleVersion: this.version } };
} }, fd = { id: "mail.spf-analysis.v1", name: "SPF Record Analysis", description: "Analyzes SPF record presence, validity, and configuration", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((f) => f.queryType === "TXT" && f.queryName.toLowerCase() === e.domainName.toLowerCase()), n = t.filter((f) => f.status === "success"), r = t.filter((f) => f.status === "timeout" || f.status === "error" || f.status === "refused");
  let s = null, i = null;
  for (const f of n) {
    for (const h of f.answerSection || []) if (h.data.includes("v=spf1")) {
      s = h.data, i = f;
      break;
    }
    if (s) break;
  }
  if (!s && r.length > 0 && n.length === 0) return { finding: { type: "mail.spf-query-failed", title: `SPF query failed for ${e.domainName}`, description: `Could not determine SPF status for ${e.domainName} due to query failures: ${r.map((f) => f.status).join(", ")}. This is not the same as "no SPF record".`, severity: "medium", confidence: "low", riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true, evidence: t.map((f) => ({ observationId: f.id, description: `${f.vantageType}: ${f.status}${f.errorMessage ? ` - ${f.errorMessage}` : ""}` })), ruleId: this.id, ruleVersion: this.version } };
  if (!s) return { finding: { type: "mail.no-spf-record", title: `No SPF record for ${e.domainName}`, description: `${e.domainName} has no SPF record. Without SPF, anyone can forge email appearing to come from this domain. This is a security risk.`, severity: "high", confidence: "certain", riskPosture: "high", blastRadius: "single-domain", reviewOnly: false, evidence: n.map((f) => ({ observationId: f.id, description: `${f.vantageType}: TXT record present but no SPF found` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Add SPF record", description: `Add an SPF record to prevent email spoofing of ${e.domainName}.`, action: `Add TXT record at ${e.domainName}: "v=spf1 include:_spf.google.com ~all" (adjust for your mail provider)`, riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true }] };
  const o = Ka(s);
  if (!o) return { finding: { type: "mail.spf-malformed", title: `Malformed SPF record for ${e.domainName}`, description: `${e.domainName} has an SPF record that could not be parsed: "${s}". This may cause mail delivery issues as receiving servers may reject or flag emails.`, severity: "critical", confidence: "certain", riskPosture: "critical", blastRadius: "single-domain", reviewOnly: true, evidence: i ? [{ observationId: i.id, description: `Raw SPF record: ${s}` }] : [], ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Fix SPF syntax", description: "The SPF record has syntax errors that need correction.", action: "Review and correct the SPF record syntax. Common issues: missing spaces, invalid mechanisms, or missing version tag.", riskPosture: "high", blastRadius: "single-domain", reviewOnly: true }] };
  const a = ["all", "include", "a", "mx", "ptr", "ip4", "ip6", "exists", "redirect"], u = o.mechanisms.filter((f) => !a.includes(f.type));
  if (u.length > 0) return { finding: { type: "mail.spf-malformed", title: `Malformed SPF record for ${e.domainName}`, description: `${e.domainName} has an SPF record with invalid mechanisms: ${u.map((f) => f.type).join(", ")}. Raw: "${s}". Valid mechanisms are: ${a.join(", ")}.`, severity: "critical", confidence: "certain", riskPosture: "critical", blastRadius: "single-domain", reviewOnly: true, evidence: i ? [{ observationId: i.id, description: "Invalid SPF mechanisms found" }] : [], ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Fix SPF mechanism syntax", description: "The SPF record contains unknown mechanisms that may cause mail delivery issues.", action: `Remove or correct invalid mechanisms: ${u.map((f) => f.type).join(", ")}`, riskPosture: "high", blastRadius: "single-domain", reviewOnly: true }] };
  const d = [], c = o.mechanisms.find((f) => f.type === "all");
  c ? c.prefix === "~" ? d.push("Softfail (~all) - emails may be delivered but flagged") : c.prefix === "?" ? d.push("Neutral (?all) - no enforcement, effectively no protection") : c.prefix === "+" && d.push("Pass (+all) - DANGEROUS: allows all senders") : d.push("No all mechanism - may cause unexpected behavior"), o.mechanisms.filter((f) => f.type === "include").length === 0 && !o.mechanisms.some((f) => ["a", "mx", "ip4", "ip6"].includes(f.type)) && d.push("No sender sources defined");
  const l = d.some((f) => f.includes("DANGEROUS")) ? "critical" : d.length > 0 ? "medium" : "info";
  return { finding: { type: "mail.spf-present", title: `SPF record present for ${e.domainName}`, description: `${e.domainName} has a valid SPF record. Raw: "${s}". ${d.length > 0 ? `Issues: ${d.join("; ")}` : "Configuration looks good with proper all mechanism."}`, severity: l, confidence: "certain", riskPosture: l === "critical" ? "critical" : l === "medium" ? "medium" : "safe", blastRadius: "single-domain", reviewOnly: l !== "info", evidence: i ? [{ observationId: i.id, description: `Parsed SPF: ${JSON.stringify(o)}` }] : [], ruleId: this.id, ruleVersion: this.version }, suggestions: d.length > 0 ? [{ title: "Review SPF configuration", description: "The SPF record has configuration issues that may affect mail delivery.", action: `Address: ${d.join("; ")}`, riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true }] : void 0 };
} }, md = { id: "mail.dmarc-analysis.v1", name: "DMARC Record Analysis", description: "Analyzes DMARC record presence, validity, and policy", version: "1.0.0", enabled: true, evaluate(e) {
  var _a2;
  const t = e.observations.filter((p) => p.queryType === "TXT" && p.queryName.toLowerCase() === `_dmarc.${e.domainName}`.toLowerCase() && p.status === "success");
  let n = null, r = null;
  for (const p of t) {
    for (const l of p.answerSection || []) if (l.data.includes("v=DMARC1")) {
      n = l.data, r = p;
      break;
    }
    if (n) break;
  }
  if (!n) return { finding: { type: "mail.no-dmarc-record", title: `No DMARC record for ${e.domainName}`, description: `${e.domainName} has no DMARC record. Without DMARC, receiving servers have no policy guidance for handling SPF/DKIM failures. This is a security risk.`, severity: "high", confidence: "certain", riskPosture: "high", blastRadius: "single-domain", reviewOnly: false, evidence: t.map((p) => ({ observationId: p.id, description: `${p.vantageType}: ${p.status}` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Add DMARC record", description: "Add a DMARC record to specify how receivers should handle authentication failures.", action: 'Start with monitoring: "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com", then progress to quarantine/reject', riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true }] };
  const s = Ga(n);
  if (!s) return { finding: { type: "mail.dmarc-malformed", title: `Malformed DMARC record for ${e.domainName}`, description: `${e.domainName} has a DMARC record that could not be parsed: "${n}". This may cause mail delivery issues.`, severity: "critical", confidence: "certain", riskPosture: "critical", blastRadius: "single-domain", reviewOnly: true, evidence: r ? [{ observationId: r.id, description: `Raw DMARC: ${n}` }] : [], ruleId: this.id, ruleVersion: this.version } };
  const i = s.policy, o = s.subdomainPolicy, a = s.rua, u = (_a2 = s.percentage) != null ? _a2 : 100;
  let d = "info";
  const c = [];
  return i === "none" ? (d = "medium", c.push('Policy is "none" - monitoring only, no enforcement')) : i === "quarantine" ? (d = "info", c.push('Policy is "quarantine" - failed emails go to spam')) : i === "reject" && (d = "info", c.push('Policy is "reject" - failed emails are rejected')), (!a || a.length === 0) && (c.push("No aggregate report URI (rua) - no visibility into failures"), d === "info" && (d = "low")), u < 100 && c.push(`Partial deployment: ${u}% of emails affected`), o && o !== i && c.push(`Subdomain policy (${o}) differs from main policy (${i})`), { finding: { type: "mail.dmarc-present", title: `DMARC record present for ${e.domainName}`, description: `${e.domainName} has a valid DMARC record with policy "${i}". ${c.length > 0 ? `Notes: ${c.join("; ")}` : "Configuration looks good."}`, severity: d, confidence: "certain", riskPosture: d === "info" ? "safe" : "medium", blastRadius: "single-domain", reviewOnly: d !== "info", evidence: r ? [{ observationId: r.id, description: `Policy: ${i}${o ? `, Subdomain: ${o}` : ""}, RUA: ${(a == null ? void 0 : a.join(", ")) || "none"}, Pct: ${u}%` }] : [], ruleId: this.id, ruleVersion: this.version }, suggestions: i === "none" ? [{ title: "Strengthen DMARC policy", description: "DMARC is in monitoring mode only. Consider progressing to quarantine or reject.", action: `After monitoring shows SPF/DKIM alignment, upgrade: "v=DMARC1; p=quarantine; rua=mailto:dmarc@${e.domainName}"`, riskPosture: "medium", blastRadius: "single-domain", reviewOnly: true }] : void 0 };
} }, hd = { id: "mail.dkim-presence.v1", name: "DKIM Key Presence", description: "Checks for DKIM public keys at discovered selectors", version: "1.0.0", enabled: true, evaluate(e) {
  var _a2, _b;
  const t = e.domainName.toLowerCase(), n = e.observations.filter((i) => {
    const o = i.queryName.toLowerCase();
    return i.queryType === "TXT" && o.includes("._domainkey.") && o.endsWith(`._domainkey.${t}`);
  });
  if (n.length === 0) return { finding: { type: "mail.no-dkim-queried", title: `No DKIM selectors discovered for ${e.domainName}`, description: `No DKIM selectors were discovered for ${e.domainName}. This could mean: (1) no DKIM is configured, (2) selectors use non-standard names, or (3) selector discovery heuristics didn't match. DKIM is recommended for email authentication.`, severity: "medium", confidence: "heuristic", riskPosture: "medium", blastRadius: "single-domain", reviewOnly: false, evidence: [], ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Configure DKIM", description: "DKIM provides cryptographic email authentication and is recommended.", action: `Configure DKIM with your mail provider and add the public key as a TXT record at selector._domainkey.${e.domainName}`, riskPosture: "low", blastRadius: "single-domain", reviewOnly: true }] };
  const r = [], s = [];
  for (const i of n) {
    const o = i.queryName.split("._domainkey.")[0];
    if (i.status !== "success") {
      s.push({ selector: o, observation: i, reason: `Query failed: ${i.status}` });
      continue;
    }
    const a = (_b = (_a2 = i.answerSection) == null ? void 0 : _a2[0]) == null ? void 0 : _b.data;
    if (!a) {
      s.push({ selector: o, observation: i, reason: "Empty response" });
      continue;
    }
    a.includes("k=") && a.includes("v=DKIM1") ? r.push({ selector: o, observation: i }) : s.push({ selector: o, observation: i, reason: "No valid DKIM key data found" });
  }
  return r.length === 0 ? { finding: { type: "mail.dkim-no-valid-keys", title: `No valid DKIM keys found for ${e.domainName}`, description: `DKIM selectors were queried but no valid keys were found. Attempted: ${s.map((i) => i.selector).join(", ")}. ${s.map((i) => `${i.selector}: ${i.reason}`).join("; ")}`, severity: "high", confidence: "certain", riskPosture: "high", blastRadius: "single-domain", reviewOnly: false, evidence: n.map((i) => ({ observationId: i.id, description: `${i.queryName}: ${i.status}` })), ruleId: this.id, ruleVersion: this.version } } : { finding: { type: "mail.dkim-keys-present", title: `DKIM keys present for ${e.domainName}`, description: `Valid DKIM keys found for selectors: ${r.map((i) => i.selector).join(", ")}. ${s.length > 0 ? `Additional selectors queried but invalid: ${s.map((i) => i.selector).join(", ")}` : ""}`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: r.map((i) => ({ observationId: i.observation.id, description: `Selector ${i.selector}: valid DKIM key` })), ruleId: this.id, ruleVersion: this.version } };
} }, gd = { id: "mail.mta-sts-presence.v1", name: "MTA-STS Presence", description: "Checks for MTA-STS TXT record", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((s) => s.queryType === "TXT" && s.queryName.toLowerCase() === `_mta-sts.${e.domainName}`.toLowerCase());
  return t.filter((s) => s.status === "success").some((s) => {
    var _a2;
    return (_a2 = s.answerSection) == null ? void 0 : _a2.some((i) => i.data.includes("v=STSv1"));
  }) ? { finding: { type: "mail.mta-sts-present", title: `MTA-STS configured for ${e.domainName}`, description: `${e.domainName} has an MTA-STS TXT record indicating TLS enforcement policy is configured.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: t.map((s) => {
    var _a2;
    return { observationId: s.id, description: `${s.vantageType}: ${((_a2 = s.answerSection) == null ? void 0 : _a2.map((i) => i.data).join(", ")) || "present"}` };
  }), ruleId: this.id, ruleVersion: this.version } } : { finding: { type: "mail.no-mta-sts", title: `No MTA-STS for ${e.domainName}`, description: `${e.domainName} has no MTA-STS policy. MTA-STS enforces TLS encryption for inbound mail and prevents downgrade attacks. Recommended for security-conscious domains.`, severity: "low", confidence: "certain", riskPosture: "low", blastRadius: "none", reviewOnly: false, evidence: t.map((s) => ({ observationId: s.id, description: `${s.vantageType}: ${s.status}` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Consider MTA-STS", description: "MTA-STS enforces TLS for email and prevents downgrade attacks.", action: `Deploy MTA-STS: (1) Add TXT record _mta-sts.${e.domainName} with "v=STSv1; id=YYYYMMDD", (2) Host policy at https://mta-sts.${e.domainName}/.well-known/mta-sts.txt`, riskPosture: "low", blastRadius: "single-domain", reviewOnly: true }] };
} }, yd = { id: "mail.tls-rpt-presence.v1", name: "TLS-RPT Presence", description: "Checks for TLS-RPT TXT record", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((s) => s.queryType === "TXT" && s.queryName.toLowerCase() === `_smtp._tls.${e.domainName}`.toLowerCase());
  return t.filter((s) => s.status === "success").some((s) => {
    var _a2;
    return (_a2 = s.answerSection) == null ? void 0 : _a2.some((i) => i.data.includes("v=TLSRPTv1"));
  }) ? { finding: { type: "mail.tls-rpt-present", title: `TLS-RPT configured for ${e.domainName}`, description: `${e.domainName} has a TLS-RPT TXT record for receiving TLS connectivity reports.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: t.map((s) => {
    var _a2;
    return { observationId: s.id, description: `${s.vantageType}: ${((_a2 = s.answerSection) == null ? void 0 : _a2.map((i) => i.data).join(", ")) || "present"}` };
  }), ruleId: this.id, ruleVersion: this.version } } : { finding: { type: "mail.no-tls-rpt", title: `No TLS-RPT for ${e.domainName}`, description: `${e.domainName} has no TLS-RPT record. TLS-RPT provides reports on TLS connectivity issues for inbound mail. Useful for monitoring MTA-STS effectiveness.`, severity: "low", confidence: "certain", riskPosture: "low", blastRadius: "none", reviewOnly: false, evidence: t.map((s) => ({ observationId: s.id, description: `${s.vantageType}: ${s.status}` })), ruleId: this.id, ruleVersion: this.version }, suggestions: [{ title: "Consider TLS-RPT", description: "TLS-RPT provides reports on TLS connectivity issues for inbound mail.", action: `Add TXT record at _smtp._tls.${e.domainName}: "v=TLSRPTv1; rua=mailto:tls-rpt@${e.domainName}"`, riskPosture: "low", blastRadius: "single-domain", reviewOnly: true }] };
} }, wd = { id: "mail.bimi-presence.v1", name: "BIMI Presence", description: "Checks for BIMI TXT record (info only)", version: "1.0.0", enabled: true, evaluate(e) {
  const t = e.observations.filter((s) => s.queryType === "TXT" && s.queryName.toLowerCase() === `default._bimi.${e.domainName}`.toLowerCase());
  return t.filter((s) => s.status === "success").some((s) => {
    var _a2;
    return (_a2 = s.answerSection) == null ? void 0 : _a2.some((i) => i.data.includes("v=BIMI1"));
  }) ? { finding: { type: "mail.bimi-present", title: `BIMI configured for ${e.domainName}`, description: `${e.domainName} has a BIMI record for email logo display. Note: BIMI requires a validated DMARC policy (p=quarantine or p=reject) and a trademarked logo or VMC certificate.`, severity: "info", confidence: "certain", riskPosture: "safe", blastRadius: "none", reviewOnly: false, evidence: t.map((s) => ({ observationId: s.id, description: `${s.vantageType}: BIMI record present` })), ruleId: this.id, ruleVersion: this.version } } : null;
} };
class vd {
  compare(t, n, r, s) {
    const i = [], o = r.find((l) => l.type.startsWith("mail.dmarc")), a = r.find((l) => l.type.startsWith("mail.spf")), u = r.find((l) => l.type.startsWith("mail.dkim"));
    i.push(this.compareDmarcPresence(o, s.dmarc)), i.push(this.compareDmarcValidity(o, s.dmarc)), i.push(this.compareDmarcPolicy(o, s.dmarc)), i.push(this.compareSpfPresence(a, s.spf)), i.push(this.compareSpfValidity(a, s.spf)), i.push(this.compareDkimPresence(u, s.dkim)), i.push(this.compareDkimValidity(u, s.dkim));
    const d = this.calculateMetrics(i), c = this.determineOverallStatus(i), p = this.generateSummary(n, i, d);
    return { snapshotId: t, domain: n, comparedAt: /* @__PURE__ */ new Date(), status: c, comparisons: i, metrics: d, summary: p };
  }
  compareDmarcPresence(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.dmarc-present", s = n.present;
    return r === s ? { field: "dmarc-present", legacyValue: s, newValue: r, status: "match", severity: "info", explanation: `Both agree: DMARC is ${r ? "present" : "absent"}` } : { field: "dmarc-present", legacyValue: s, newValue: r, status: "mismatch", severity: "critical", explanation: `MISMATCH: Legacy says ${s ? "present" : "absent"}, new says ${r ? "present" : "absent"}` };
  }
  compareDmarcValidity(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.dmarc-malformed", i = (t == null ? void 0 : t.type) === "mail.dmarc-present" && !r, o = n.valid;
    return i === o ? { field: "dmarc-valid", legacyValue: o, newValue: i, status: "match", severity: "info", explanation: `Both agree: DMARC is ${i ? "valid" : "invalid"}` } : { field: "dmarc-valid", legacyValue: o, newValue: i, status: "mismatch", severity: "high", explanation: `MISMATCH: Legacy says ${o ? "valid" : "invalid"}, new says ${i ? "valid" : "invalid"}` };
  }
  compareDmarcPolicy(t, n) {
    const r = t == null ? void 0 : t.description.match(/policy "(\w+)"/), s = r ? r[1] : null, i = n.policy || null;
    return !s && !i ? { field: "dmarc-policy", legacyValue: i, newValue: s, status: "match", severity: "info", explanation: "Both agree: no policy found" } : (s == null ? void 0 : s.toLowerCase()) === (i == null ? void 0 : i.toLowerCase()) ? { field: "dmarc-policy", legacyValue: i, newValue: s, status: "match", severity: "info", explanation: `Both agree: policy is "${s}"` } : { field: "dmarc-policy", legacyValue: i, newValue: s, status: "mismatch", severity: "high", explanation: `MISMATCH: Legacy says "${i}", new says "${s}"` };
  }
  compareSpfPresence(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.spf-present", s = n.present;
    return r === s ? { field: "spf-present", legacyValue: s, newValue: r, status: "match", severity: "info", explanation: `Both agree: SPF is ${r ? "present" : "absent"}` } : { field: "spf-present", legacyValue: s, newValue: r, status: "mismatch", severity: "critical", explanation: `MISMATCH: Legacy says ${s ? "present" : "absent"}, new says ${r ? "present" : "absent"}` };
  }
  compareSpfValidity(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.spf-malformed", i = (t == null ? void 0 : t.type) === "mail.spf-present" && !r, o = n.valid;
    return i === o ? { field: "spf-valid", legacyValue: o, newValue: i, status: "match", severity: "info", explanation: `Both agree: SPF is ${i ? "valid" : "invalid"}` } : { field: "spf-valid", legacyValue: o, newValue: i, status: "mismatch", severity: "high", explanation: `MISMATCH: Legacy says ${o ? "valid" : "invalid"}, new says ${i ? "valid" : "invalid"}` };
  }
  compareDkimPresence(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.dkim-keys-present", s = n.present;
    return r === s ? { field: "dkim-present", legacyValue: s, newValue: r, status: "match", severity: "info", explanation: `Both agree: DKIM is ${r ? "present" : "absent"}` } : { field: "dkim-present", legacyValue: s, newValue: r, status: "mismatch", severity: "high", explanation: `MISMATCH: Legacy says ${s ? "present" : "absent"}, new says ${r ? "present" : "absent"}` };
  }
  compareDkimValidity(t, n) {
    const r = (t == null ? void 0 : t.type) === "mail.dkim-no-valid-keys", i = (t == null ? void 0 : t.type) === "mail.dkim-keys-present" && !r, o = n.valid;
    return i === o ? { field: "dkim-valid", legacyValue: o, newValue: i, status: "match", severity: "info", explanation: `Both agree: DKIM is ${i ? "valid" : "invalid"}` } : { field: "dkim-valid", legacyValue: o, newValue: i, status: "mismatch", severity: "medium", explanation: `MISMATCH: Legacy says ${o ? "valid" : "invalid"}, new says ${i ? "valid" : "invalid"}` };
  }
  calculateMetrics(t) {
    return { totalFields: t.length, matchingFields: t.filter((n) => n.status === "match").length, mismatchingFields: t.filter((n) => n.status === "mismatch").length, missingInNew: t.filter((n) => n.status === "missing-in-new").length, missingInLegacy: t.filter((n) => n.status === "missing-in-legacy").length };
  }
  determineOverallStatus(t) {
    if (t.filter((i) => i.status === "mismatch" && i.severity === "critical").length > 0) return "mismatch";
    const r = t.filter((i) => i.status === "mismatch").length, s = t.filter((i) => i.status !== "not-comparable").length;
    return r === 0 ? "match" : r < s / 2 ? "partial-match" : "mismatch";
  }
  generateSummary(t, n, r) {
    const s = [];
    if (s.push(`Shadow comparison for ${t}:`), s.push(`${r.matchingFields}/${r.totalFields} fields match`), r.mismatchingFields > 0) {
      s.push(`${r.mismatchingFields} mismatches detected`);
      const i = n.filter((o) => o.status === "mismatch" && o.severity === "critical");
      i.length > 0 && s.push(`CRITICAL: ${i.map((o) => o.field).join(", ")}`);
    }
    return s.join(". ");
  }
}
const Id = new vd(), je = { "google-workspace": { id: "template.google-workspace.v1", provider: "google-workspace", name: "Google Workspace", description: "Expected configuration for Google Workspace email hosting", version: "1.0.0", expected: { mx: [{ priority: 1, pattern: /\.googlemail\.com$/i, description: "Google Workspace MX" }, { priority: 5, pattern: /\.googlemail\.com$/i, description: "Google Workspace MX backup" }], spf: { required: true, include: "_spf.google.com", patterns: [/_spf\.google\.com/, /include:.*google/] }, dmarc: { required: true, recommendedPolicy: "quarantine" }, dkim: { required: true, selectors: ["google", "20210112", "20230601"] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["google", "20210112", "20230601", "2024"], detection: { mxPatterns: [/googlemail\.com$/i, /\.google\.com$/i], spfPatterns: [/_spf\.google\.com/i, /google\.com/i] } }, "microsoft-365": { id: "template.microsoft-365.v1", provider: "microsoft-365", name: "Microsoft 365", description: "Expected configuration for Microsoft 365 email hosting", version: "1.0.0", expected: { mx: [{ priority: 0, pattern: /\.mail\.protection\.outlook\.com$/i, description: "Microsoft 365 MX" }], spf: { required: true, include: "spf.protection.outlook.com", patterns: [/spf\.protection\.outlook\.com/i, /outlook\.com/i] }, dmarc: { required: true, recommendedPolicy: "quarantine" }, dkim: { required: true, selectors: ["selector1", "selector2"] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["selector1", "selector2", "microsoft"], detection: { mxPatterns: [/\.mail\.protection\.outlook\.com$/i, /outlook\.com$/i, /hotmail\.com$/i], spfPatterns: [/spf\.protection\.outlook\.com/i, /outlook\.com/i] } }, "amazon-ses": { id: "template.amazon-ses.v1", provider: "amazon-ses", name: "Amazon SES", description: "Expected configuration for Amazon Simple Email Service", version: "1.0.0", expected: { mx: [], spf: { required: false, include: "amazonses.com", patterns: [/amazonses\.com/i] }, dmarc: { required: false, recommendedPolicy: "none" }, dkim: { required: true, selectors: ["amazonses"] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["amazonses", "aws"], detection: { mxPatterns: [/amazonses\.com$/i], spfPatterns: [/amazonses\.com/i] } }, sendgrid: { id: "template.sendgrid.v1", provider: "sendgrid", name: "SendGrid", description: "Expected configuration for SendGrid email delivery", version: "1.0.0", expected: { mx: [], spf: { required: false, include: "sendgrid.net", patterns: [/sendgrid\.net/i] }, dmarc: { required: false, recommendedPolicy: "none" }, dkim: { required: true, selectors: ["smtpapi"] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["smtpapi", "sendgrid"], detection: { mxPatterns: [/sendgrid\.(net|com)$/i], spfPatterns: [/sendgrid\.net/i] } }, mailgun: { id: "template.mailgun.v1", provider: "mailgun", name: "Mailgun", description: "Expected configuration for Mailgun email delivery", version: "1.0.0", expected: { mx: [{ priority: 10, pattern: /\.mailgun\.(org|net)$/i, description: "Mailgun MX" }], spf: { required: true, include: "mailgun.org", patterns: [/mailgun\.(org|net)/i] }, dmarc: { required: false, recommendedPolicy: "none" }, dkim: { required: true, selectors: ["krs", "mailgun"] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["krs", "mailgun", "mg"], detection: { mxPatterns: [/\.mailgun\.(org|net)$/i], spfPatterns: [/mailgun\.(org|net)/i] } }, other: { id: "template.other.v1", provider: "other", name: "Other Provider", description: "Generic template for unidentified mail providers", version: "1.0.0", expected: { mx: [], spf: { required: true, patterns: [/v=spf1/] }, dmarc: { required: true, recommendedPolicy: "none" }, dkim: { required: false, selectors: [] }, mtaSts: false, tlsRpt: false }, knownSelectors: ["default", "dkim", "mail"], detection: { mxPatterns: [], spfPatterns: [] } }, unknown: { id: "template.unknown.v1", provider: "unknown", name: "Unknown Provider", description: "No provider detected - minimal expectations", version: "1.0.0", expected: { mx: [], spf: { required: false, patterns: [] }, dmarc: { required: false, recommendedPolicy: "none" }, dkim: { required: false, selectors: [] }, mtaSts: false, tlsRpt: false }, knownSelectors: [], detection: { mxPatterns: [], spfPatterns: [] } } };
function Wt$1(e, t) {
  const n = { "google-workspace": 0, "microsoft-365": 0, "amazon-ses": 0, sendgrid: 0, mailgun: 0, other: 0, unknown: 0 }, r = { "google-workspace": [], "microsoft-365": [], "amazon-ses": [], sendgrid: [], mailgun: [], other: [], unknown: [] };
  for (const a of e) {
    const u = a.toLowerCase();
    for (const [d, c] of Object.entries(je)) for (const p of c.detection.mxPatterns) p.test(u) && (n[d] += 2, r[d].push(`MX match: ${a}`));
  }
  if (t) {
    const a = t.toLowerCase();
    for (const [u, d] of Object.entries(je)) for (const c of d.detection.spfPatterns) c.test(a) && (n[u] += 1, r[u].push(`SPF match: ${c.source}`));
  }
  let s = "unknown", i = 0;
  for (const [a, u] of Object.entries(n)) u > i && (i = u, s = a);
  let o = "low";
  return i >= 3 ? o = "certain" : i >= 2 ? o = "high" : i >= 1 && (o = "medium"), { provider: s, confidence: o, evidence: r[s] };
}
function _d(e, t) {
  var _a2, _b;
  const n = je[e], r = [], s = [], i = [];
  if (n.expected.mx && n.expected.mx.length > 0 && (!t.mx || t.mx.length === 0 ? i.push({ aspect: "MX", expected: n.expected.mx.map((a) => a.description).join(", "), severity: "critical" }) : n.expected.mx.some((u) => {
    var _a3;
    return (_a3 = t.mx) == null ? void 0 : _a3.some((d) => u.pattern.test(d));
  }) ? r.push({ aspect: "MX", expected: "Provider-specific MX", actual: t.mx.join(", "), matches: true }) : s.push({ aspect: "MX", expected: n.expected.mx.map((u) => u.description).join(", "), actual: t.mx.join(", "), severity: "high" })), (_a2 = n.expected.spf) == null ? void 0 : _a2.required) if (!t.spf) i.push({ aspect: "SPF", expected: `Include: ${n.expected.spf.include || "provider SPF"}`, severity: "high" });
  else {
    const a = t.spf;
    (a ? n.expected.spf.patterns.some((d) => d.test(a)) : false) ? r.push({ aspect: "SPF", expected: "Provider SPF pattern", actual: "SPF configured", matches: true }) : s.push({ aspect: "SPF", expected: `Include ${n.expected.spf.include || "provider SPF"}`, actual: t.spf, severity: "medium" });
  }
  if ((_b = n.expected.dkim) == null ? void 0 : _b.required) {
    const a = n.expected.dkim.selectors;
    if (!t.dkimSelectors || t.dkimSelectors.length === 0) i.push({ aspect: "DKIM", expected: `Selectors: ${a.join(", ")}`, severity: "high" });
    else {
      const u = t.dkimSelectors.filter((d) => a.includes(d));
      u.length > 0 ? r.push({ aspect: "DKIM", expected: `Known selectors: ${a.join(", ")}`, actual: `Found: ${u.join(", ")}`, matches: true }) : s.push({ aspect: "DKIM", expected: `Selectors: ${a.join(", ")}`, actual: `Found: ${t.dkimSelectors.join(", ")}`, severity: "medium" });
    }
  }
  let o;
  return s.length === 0 && i.length === 0 ? o = "full" : r.length > 0 ? o = "partial" : o = "none", { provider: e, matches: r, mismatches: s, missing: i, overallMatch: o };
}
class bd {
  constructor() {
    __publicField(this, "templates");
    this.templates = new Map(Object.entries(je));
  }
  getTemplate(t) {
    return this.templates.get(t);
  }
  getAllTemplates() {
    return Array.from(this.templates.values());
  }
  updateTemplate(t) {
    this.templates.set(t.provider, t);
  }
  addCustomSelector(t, n) {
    var _a2;
    const r = this.templates.get(t);
    r && !r.knownSelectors.includes(n) && (r.knownSelectors.push(n), (_a2 = r.expected.dkim) == null ? void 0 : _a2.selectors.push(n));
  }
}
const gt$1 = new bd();
class Sd {
  constructor(t) {
    __publicField(this, "ruleset");
    this.ruleset = t;
  }
  simulate(t, n, r) {
    const s = t.recordSets.find((g) => g.type === "MX" && g.name.toLowerCase() === t.domainName.toLowerCase()), i = t.recordSets.find((g) => g.type === "TXT" && g.name.toLowerCase() === t.domainName.toLowerCase() && g.values.some((b) => b.includes("v=spf1"))), o = Wt$1((s == null ? void 0 : s.values) || [], i == null ? void 0 : i.values.find((g) => g.includes("v=spf1"))), a = r ? n.filter((g) => r.includes(g.type)) : n.filter((g) => this.isActionable(g.type)), u = [];
    for (const g of a) {
      const b = this.invertFinding(g.type, t.domainName, t.recordSets, o.provider);
      u.push(...b);
    }
    const d = this.deduplicateChanges(u), c = this.applyChanges(t.recordSets, d, t.snapshotId), p = this.synthesizeObservations(t.observations, d, t.domainName, t.snapshotId), l = { ...t, recordSets: c, observations: p }, f = new yr(this.ruleset), h = f.evaluate(t), y = f.evaluate(l), v = this.toSimFindings(h.findings), m = this.toSimFindings(y.findings), w = new Set(v.map((g) => g.type)), S = new Set(m.map((g) => g.type)), A = v.filter((g) => !S.has(g.type)), q = v.filter((g) => S.has(g.type)), R = m.filter((g) => !w.has(g.type));
    return { domain: t.domainName, detectedProvider: o.provider, proposedChanges: d, currentFindings: v, projectedFindings: m, resolvedFindings: A, remainingFindings: q, newFindings: R, summary: { changesProposed: d.length, findingsBefore: v.length, findingsAfter: m.length, findingsResolved: A.length, findingsNew: R.length } };
  }
  invertFinding(t, n, r, s) {
    const i = je[s] || je.other;
    switch (t) {
      case "mail.no-spf-record":
        return this.proposeSPF(n, i, s);
      case "mail.no-dmarc-record":
        return this.proposeDMARC(n);
      case "mail.no-mx-record":
        return this.proposeMX(n, i, s);
      case "mail.no-mta-sts":
        return this.proposeMtaSts(n);
      case "mail.no-tls-rpt":
        return this.proposeTlsRpt(n);
      case "mail.no-dkim-queried":
        return this.proposeDKIM(n, i, s);
      case "mail.spf-malformed":
        return this.proposeFixSPF(n, r, i, s);
      case "dns.cname-coexistence-conflict":
        return this.proposeCnameResolution(n, r);
      default:
        return [];
    }
  }
  proposeSPF(t, n, r) {
    var _a2;
    const s = (_a2 = n.expected.spf) == null ? void 0 : _a2.include, i = s ? `"v=spf1 include:${s} ~all"` : '"v=spf1 ~all"';
    return [{ action: "add", name: t, type: "TXT", currentValues: [], proposedValues: [i], rationale: s ? `Add SPF record with ${r} include directive` : "Add baseline SPF record (customize includes for your mail provider)", findingType: "mail.no-spf-record", risk: "low" }];
  }
  proposeDMARC(t) {
    return [{ action: "add", name: `_dmarc.${t}`, type: "TXT", currentValues: [], proposedValues: [`"v=DMARC1; p=none; rua=mailto:dmarc-reports@${t}"`], rationale: "Add DMARC record in monitoring mode (p=none). Upgrade to quarantine/reject after reviewing reports.", findingType: "mail.no-dmarc-record", risk: "low" }];
  }
  proposeMX(t, n, r) {
    return n.expected.mx && n.expected.mx.length > 0 ? [{ action: "add", name: t, type: "MX", currentValues: [], proposedValues: n.expected.mx.map((s) => `${s.priority} ${s.description}`), rationale: `Add MX records for ${r}`, findingType: "mail.no-mx-record", risk: "medium" }] : [{ action: "add", name: t, type: "MX", currentValues: [], proposedValues: ["0 ."], rationale: "Add Null MX to explicitly declare this domain does not receive email, OR add your mail server MX records", findingType: "mail.no-mx-record", risk: "medium" }];
  }
  proposeMtaSts(t) {
    const n = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    return [{ action: "add", name: `_mta-sts.${t}`, type: "TXT", currentValues: [], proposedValues: [`"v=STSv1; id=${n}"`], rationale: "Add MTA-STS TXT record to enable TLS enforcement for inbound mail. Also requires hosting a policy file at https://mta-sts.{domain}/.well-known/mta-sts.txt", findingType: "mail.no-mta-sts", risk: "low" }];
  }
  proposeTlsRpt(t) {
    return [{ action: "add", name: `_smtp._tls.${t}`, type: "TXT", currentValues: [], proposedValues: [`"v=TLSRPTv1; rua=mailto:tls-reports@${t}"`], rationale: "Add TLS-RPT record to receive TLS connectivity reports for inbound mail", findingType: "mail.no-tls-rpt", risk: "low" }];
  }
  proposeDKIM(t, n, r) {
    var _a2;
    const s = ((_a2 = n.expected.dkim) == null ? void 0 : _a2.selectors) || [];
    return s.length === 0 ? [{ action: "add", name: `default._domainkey.${t}`, type: "TXT", currentValues: [], proposedValues: ['"v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"'], rationale: "Add DKIM public key record. Replace YOUR_PUBLIC_KEY with the key from your mail provider.", findingType: "mail.no-dkim-queried", risk: "low" }] : s.map((i) => ({ action: "add", name: `${i}._domainkey.${t}`, type: "TXT", currentValues: [], proposedValues: ['"v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY"'], rationale: `Add DKIM public key for ${r} selector "${i}". Get the actual key value from your ${r} admin console.`, findingType: "mail.no-dkim-queried", risk: "low" }));
  }
  proposeFixSPF(t, n, r, s) {
    var _a2;
    const i = n.find((u) => u.type === "TXT" && u.name.toLowerCase() === t.toLowerCase() && u.values.some((d) => d.includes("v=spf1"))), o = (_a2 = r.expected.spf) == null ? void 0 : _a2.include, a = o ? `"v=spf1 include:${o} ~all"` : '"v=spf1 ~all"';
    return [{ action: "modify", name: t, type: "TXT", currentValues: (i == null ? void 0 : i.values.filter((u) => u.includes("v=spf1"))) || [], proposedValues: [a], rationale: `Replace malformed SPF record with valid ${s} configuration`, findingType: "mail.spf-malformed", risk: "medium" }];
  }
  proposeCnameResolution(t, n) {
    return n.filter((i) => i.type === "CNAME" && i.name.toLowerCase() === t.toLowerCase()).length === 0 ? [] : n.filter((i) => i.name.toLowerCase() === t.toLowerCase() && i.type !== "CNAME" && !["RRSIG", "NSEC", "NSEC3", "DNSKEY"].includes(i.type)).map((i) => ({ action: "remove", name: i.name, type: i.type, currentValues: i.values, proposedValues: [], rationale: `Remove ${i.type} record that conflicts with CNAME at ${i.name} (RFC 1034/2181 violation)`, findingType: "dns.cname-coexistence-conflict", risk: "high" }));
  }
  isActionable(t) {
    return ["mail.no-spf-record", "mail.no-dmarc-record", "mail.no-mx-record", "mail.no-mta-sts", "mail.no-tls-rpt", "mail.no-dkim-queried", "mail.spf-malformed", "dns.cname-coexistence-conflict"].includes(t);
  }
  deduplicateChanges(t) {
    const n = /* @__PURE__ */ new Map();
    for (const r of t) {
      const s = `${r.action}:${r.name.toLowerCase()}:${r.type}`;
      n.has(s) || n.set(s, r);
    }
    return [...n.values()];
  }
  applyChanges(t, n, r) {
    const s = [...t];
    for (const i of n) if (i.action === "add") s.push({ id: crypto.randomUUID(), snapshotId: r, name: i.name, type: i.type, ttl: 300, values: i.proposedValues, sourceObservationIds: [], sourceVantages: ["simulation"], isConsistent: true, consolidationNotes: "Simulated record", createdAt: /* @__PURE__ */ new Date() });
    else if (i.action === "modify") {
      let o = s.findIndex((a) => a.name.toLowerCase() === i.name.toLowerCase() && a.type === i.type && i.currentValues.some((u) => a.values.some((d) => d.includes(u) || u.includes(d))));
      o < 0 && (o = s.findIndex((a) => a.name.toLowerCase() === i.name.toLowerCase() && a.type === i.type)), o >= 0 && (s[o] = { ...s[o], values: i.proposedValues, consolidationNotes: "Simulated modification" });
    } else if (i.action === "remove") {
      const o = s.findIndex((a) => a.name.toLowerCase() === i.name.toLowerCase() && a.type === i.type);
      o >= 0 && s.splice(o, 1);
    }
    return s;
  }
  synthesizeObservations(t, n, r, s) {
    var _a2, _b;
    const i = [...t];
    for (const o of n) {
      if (o.action === "remove") continue;
      const a = i.findIndex((u) => u.queryName.toLowerCase() === o.name.toLowerCase() && u.queryType === o.type && u.status === "success");
      o.action === "add" && a >= 0 && i[a].answerSection && ((_b = (_a2 = i[a].answerSection) == null ? void 0 : _a2.length) != null ? _b : 0) > 0 || (a >= 0 && i.splice(a, 1), i.push({ id: crypto.randomUUID(), snapshotId: s, queryName: o.name, queryType: o.type, vantageId: null, vantageType: "public-recursive", vantageIdentifier: "simulation", status: "success", responseCode: 0, answerSection: o.proposedValues.map((u) => ({ name: o.name, type: o.type, ttl: 300, data: u })), authoritySection: null, additionalSection: null, errorMessage: null, queryDurationMs: 0, createdAt: /* @__PURE__ */ new Date() }));
    }
    return i;
  }
  toSimFindings(t) {
    return t.map((n) => ({ type: n.type, title: n.title, severity: n.severity, ruleId: n.ruleId }));
  }
}
const Pe = new Hono(), tr = "1.2.0", Ad = "DNS and Mail Rules";
function jt$1() {
  return { id: "dns-mail-v1", version: tr, name: Ad, description: "Combined DNS and mail analysis rules (Bead 06)", rules: [id, od, ad, dd, cd, pd, fd, md, hd, gd, yd, wd], createdAt: /* @__PURE__ */ new Date() };
}
async function cn(e, t, n) {
  const r = await e.findByVersion(t.version);
  return r ? r.id : (await e.create({ version: t.version, name: t.name, description: t.description || "", rules: t.rules.map((i) => ({ id: i.id, name: i.name, version: i.version, enabled: i.enabled !== false })), active: true, createdBy: n })).id;
}
Pe.get("/snapshot/:snapshotId/findings", $, async (e) => {
  var _a2, _b;
  const t = e.req.param("snapshotId"), n = e.req.query("refresh") === "true", r = e.get("db");
  try {
    const s = new se$1(r), i = new te(r), o = new Le(r), a = new xt$1(r), u = new Ve(r), d = new St$1(r), c = new xe$1(r), p = await s.findById(t);
    if (!p) return e.json({ error: "Snapshot not found" }, 404);
    const l = await i.findById(p.domainId);
    if (!l) return e.json({ error: "Domain not found" }, 404);
    const f = e.get("tenantId");
    if (l.tenantId && l.tenantId !== f) return e.json({ error: "Snapshot not found" }, 404);
    if (!f && l.tenantId) return e.json({ error: "Snapshot not found" }, 404);
    const h = jt$1(), y = e.req.header("X-Actor-Id") || "system", v = await cn(c, h, y), m = await u.findBySnapshotIdAndRulesetVersionId(t, v);
    if (m.length > 0 && !n) {
      const N = m.map((ne) => ne.id), U = [...(await d.findByFindingIds(N)).values()].flat(), V = m.filter((ne) => ne.type.startsWith("dns.")), le = m.filter((ne) => ne.type.startsWith("mail."));
      return e.json({ snapshotId: t, domain: l.name, rulesetVersion: h.version, rulesetVersionId: v, persisted: true, idempotent: true, summary: { totalFindings: m.length, dnsFindings: V.length, mailFindings: le.length, suggestions: U.length }, findings: m, suggestions: U, categorized: { dns: V, mail: le } });
    }
    const w = await o.findBySnapshotId(t), S = await a.findBySnapshotId(t), A = { snapshotId: t, domainId: l.id, domainName: l.name, zoneManagement: p.zoneManagement, observations: w, recordSets: S, rulesetVersion: h.version }, q = new yr(h), { findings: R, suggestions: g } = q.evaluate(A);
    n && m.length > 0 && await u.deleteBySnapshotIdAndRulesetVersionId(t, v);
    const b = R.map((N) => ({ snapshotId: t, type: N.type, title: N.title, description: N.description, severity: N.severity, confidence: N.confidence, riskPosture: N.riskPosture, blastRadius: N.blastRadius, reviewOnly: N.reviewOnly, evidence: N.evidence, ruleId: N.ruleId, ruleVersion: N.ruleVersion, rulesetVersionId: v })), I = await u.createMany(b), E = /* @__PURE__ */ new Map();
    for (let N = 0; N < R.length; N++) {
      const j = R[N].id, U = (_a2 = I[N]) == null ? void 0 : _a2.id;
      j && U && E.set(j, U);
    }
    const x = [];
    for (const N of g) {
      const j = E.get(N.findingId);
      j && x.push({ findingId: j, title: N.title, description: N.description, action: N.action, riskPosture: N.riskPosture, blastRadius: N.blastRadius, reviewOnly: (_b = N.reviewOnly) != null ? _b : false });
    }
    const k = await d.createMany(x), _ = I.filter((N) => N.type.startsWith("dns.")), M = I.filter((N) => N.type.startsWith("mail."));
    return e.json({ snapshotId: t, domain: l.name, rulesetVersion: h.version, rulesetVersionId: v, persisted: true, evaluated: true, idempotent: false, rulesEvaluated: q.getEnabledRulesCount(), summary: { totalFindings: I.length, dnsFindings: _.length, mailFindings: M.length, suggestions: k.length }, findings: I, suggestions: k, categorized: { dns: _, mail: M } });
  } catch (s) {
    return P().error("Error evaluating findings:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:snapshotId/findings", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to evaluate findings", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
Pe.get("/snapshot/:snapshotId/findings/mail", $, async (e) => {
  var _a2, _b;
  const t = e.req.param("snapshotId"), n = e.get("db");
  try {
    const r = new se$1(n), s = new te(n), i = new Ve(n), o = new St$1(n), a = new Aa(n), u = new ji(n), d = await r.findById(t);
    if (!d) return e.json({ error: "Snapshot not found" }, 404);
    const c = await s.findById(d.domainId);
    if (!c) return e.json({ error: "Domain not found" }, 404);
    const p = e.get("tenantId");
    if (c.tenantId && c.tenantId !== p) return e.json({ error: "Snapshot not found" }, 404);
    if (!p && c.tenantId) return e.json({ error: "Snapshot not found" }, 404);
    const [l, f] = await Promise.all([a.findBySnapshotId(t), u.findBySnapshotId(t)]), h = await i.findBySnapshotId(t), y = h.filter((q) => q.type.startsWith("mail."));
    if (h.length === 0) {
      const g = ((_a2 = (await (await fetch(`${e.req.url.replace("/findings/mail", "/findings")}`, { headers: e.req.raw.headers })).json()).categorized) == null ? void 0 : _a2.mail) || [], b = Es(g), I = Ds(b, l);
      return e.json({ snapshotId: t, domain: c.name, rulesetVersion: tr, summary: { totalFindings: g.length, dkimSelectorsFound: f.filter((E) => E.found).length, dkimSelectorsTried: f.length }, mailConfig: I, mailEvidence: l || null, dkimSelectors: qs(f), findings: g });
    }
    const v = y.map((q) => q.id), w = [...(await o.findByFindingIds(v)).values()].flat(), S = Es(y), A = Ds(S, l);
    return e.json({ snapshotId: t, domain: c.name, rulesetVersion: ((_b = y[0]) == null ? void 0 : _b.ruleVersion) || tr, persisted: true, summary: { totalFindings: y.length, suggestions: w.length, dkimSelectorsFound: f.filter((q) => q.found).length, dkimSelectorsTried: f.length }, mailConfig: A, mailEvidence: l || null, dkimSelectors: qs(f), findings: y, suggestions: w });
  } catch (r) {
    return P().error("Error evaluating mail findings:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/mail/findings", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to evaluate mail findings", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
Pe.post("/snapshot/:snapshotId/evaluate", $, async (e) => {
  const t = e.req.param("snapshotId"), n = e.get("db");
  try {
    const r = new se$1(n), s = new Ve(n), i = new xe$1(n);
    if (!await r.findById(t)) return e.json({ error: "Snapshot not found" }, 404);
    const a = jt$1(), u = e.req.header("X-Actor-Id") || "system", d = await cn(i, a, u), c = await s.deleteBySnapshotIdAndRulesetVersionId(t, d), l = await (await fetch(`${e.req.url.replace("/evaluate", "/findings")}?refresh=true`, { headers: e.req.raw.headers })).json();
    return e.json({ snapshotId: t, previousFindingsDeleted: c, rulesetVersion: a.version, rulesetVersionId: d, ...typeof l == "object" && l !== null ? l : {} });
  } catch (r) {
    return P().error("Error re-evaluating findings:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:snapshotId/findings/re-evaluate", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to re-evaluate findings", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
Pe.get("/snapshot/:snapshotId/findings/summary", $, async (e) => {
  const t = e.req.param("snapshotId"), n = e.get("db"), r = e.get("tenantId");
  try {
    const s = new se$1(n), i = new te(n), o = await s.findById(t);
    if (!o) return e.json({ error: "Snapshot not found" }, 404);
    const a = await i.findById(o.domainId);
    if (!a) return e.json({ error: "Snapshot not found" }, 404);
    if (a.tenantId && a.tenantId !== r) return e.json({ error: "Snapshot not found" }, 404);
    if (!r && a.tenantId) return e.json({ error: "Snapshot not found" }, 404);
    const u = new Ve(n), d = await u.countBySeverity(t), c = await u.hasFindings(t);
    return e.json({ snapshotId: t, hasFindings: c, severityCounts: d, total: Object.values(d).reduce((p, l) => p + l, 0) });
  } catch (s) {
    return P().error("Error getting findings summary:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get findings summary", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
Pe.patch("/findings/:findingId/acknowledge", $, G, async (e) => {
  const t = e.req.param("findingId"), n = e.get("db"), r = e.get("actorId");
  if (!r) return e.json({ error: "Unauthorized" }, 401);
  try {
    const i = await new Ve(n).markAcknowledged(t, r);
    return i ? e.json({ success: true, finding: i }) : e.json({ error: "Finding not found" }, 404);
  } catch (s) {
    return P().error("Error acknowledging finding:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to acknowledge finding", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
Pe.get("/findings/:findingId", $, async (e) => {
  const t = e.req.param("findingId"), n = e.get("db");
  try {
    const r = new Ve(n), s = new se$1(n), i = new te(n), o = await r.findById(t);
    if (!o) return e.json({ error: "Finding not found" }, 404);
    const a = await s.findById(o.snapshotId);
    if (!a) return e.json({ error: "Finding not found" }, 404);
    const u = await i.findById(a.domainId);
    if (!u) return e.json({ error: "Finding not found" }, 404);
    const d = e.get("tenantId");
    return u.tenantId && u.tenantId !== d ? e.json({ error: "Finding not found" }, 404) : !d && u.tenantId ? e.json({ error: "Finding not found" }, 404) : e.json({ finding: o });
  } catch (r) {
    return P().error("Error fetching finding:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch finding", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
Pe.patch("/findings/:findingId/false-positive", $, G, async (e) => {
  const t = e.req.param("findingId"), n = e.get("db"), r = e.get("actorId");
  if (!r) return e.json({ error: "Unauthorized" }, 401);
  try {
    const i = await new Ve(n).markFalsePositive(t, r);
    return i ? e.json({ success: true, finding: i }) : e.json({ error: "Finding not found" }, 404);
  } catch (s) {
    return P().error("Error marking finding as false positive:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to mark finding as false positive", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
Pe.post("/findings/backfill", $, async (e) => {
  var _a2, _b;
  const t = e.get("db"), n = e.get("actorId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = await e.req.json().catch(() => ({})), { domainId: s, limit: i = 50, dryRun: o = false } = r, a = Math.min(i || 50, 200);
  try {
    const u = new se$1(t), d = new Ve(t), c = new xe$1(t), p = new te(t), l = new Le(t), f = new xt$1(t), h = new St$1(t), y = jt$1(), v = await cn(c, y, n), m = await u.countNeedingBackfill(v, { domainId: s, completedOnly: true });
    if (o) return e.json({ dryRun: true, rulesetVersion: y.version, rulesetVersionId: v, stats: m, message: `${m.needsBackfill} of ${m.total} snapshots need backfill` });
    const w = await u.findNeedingBackfill(v, { domainId: s, limit: a, completedOnly: true });
    if (w.length === 0) return e.json({ processed: 0, rulesetVersion: y.version, rulesetVersionId: v, stats: m, message: "No snapshots require backfill" });
    const S = [];
    for (const b of w) try {
      const I = await p.findById(b.domainId);
      if (!I) {
        S.push({ snapshotId: b.id, domainName: b.domainName, findingsCount: 0, suggestionsCount: 0, status: "error", error: "Domain not found" });
        continue;
      }
      const E = e.get("tenantId");
      if (I.tenantId && I.tenantId !== E) {
        S.push({ snapshotId: b.id, domainName: b.domainName, findingsCount: 0, suggestionsCount: 0, status: "error", error: "Cross-tenant access denied" });
        continue;
      }
      if (!E && I.tenantId) {
        S.push({ snapshotId: b.id, domainName: b.domainName, findingsCount: 0, suggestionsCount: 0, status: "error", error: "Cross-tenant access denied" });
        continue;
      }
      const x = await l.findBySnapshotId(b.id), k = await f.findBySnapshotId(b.id), _ = { snapshotId: b.id, domainId: I.id, domainName: I.name, zoneManagement: b.zoneManagement, observations: x, recordSets: k, rulesetVersion: y.version }, M = new yr(y), { findings: N, suggestions: j } = M.evaluate(_);
      await d.deleteBySnapshotIdAndRulesetVersionId(b.id, v);
      const U = N.map((Q) => ({ snapshotId: b.id, type: Q.type, title: Q.title, description: Q.description, severity: Q.severity, confidence: Q.confidence, riskPosture: Q.riskPosture, blastRadius: Q.blastRadius, reviewOnly: Q.reviewOnly, evidence: Q.evidence, ruleId: Q.ruleId, ruleVersion: Q.ruleVersion, rulesetVersionId: v })), V = await d.createMany(U), le = /* @__PURE__ */ new Map();
      for (let Q = 0; Q < N.length; Q++) {
        const ce = N[Q].id, ve = (_a2 = V[Q]) == null ? void 0 : _a2.id;
        ce && ve && le.set(ce, ve);
      }
      const ne = [];
      for (const Q of j) {
        const ce = le.get(Q.findingId);
        ce && ne.push({ findingId: ce, title: Q.title, description: Q.description, action: Q.action, riskPosture: Q.riskPosture, blastRadius: Q.blastRadius, reviewOnly: (_b = Q.reviewOnly) != null ? _b : false });
      }
      const he = await h.createMany(ne);
      await u.updateRulesetVersion(b.id, v), S.push({ snapshotId: b.id, domainName: b.domainName, findingsCount: V.length, suggestionsCount: he.length, status: "success" });
    } catch (I) {
      S.push({ snapshotId: b.id, domainName: b.domainName, findingsCount: 0, suggestionsCount: 0, status: "error", error: I instanceof Error ? I.message : "Unknown error" });
    }
    const A = S.filter((b) => b.status === "success").length, q = S.filter((b) => b.status === "error").length, R = S.reduce((b, I) => b + I.findingsCount, 0), g = S.reduce((b, I) => b + I.suggestionsCount, 0);
    return e.json({ processed: S.length, success: A, errors: q, totalFindings: R, totalSuggestions: g, rulesetVersion: y.version, rulesetVersionId: v, remainingToBackfill: m.needsBackfill - A, results: S });
  } catch (u) {
    return P().error("Error in findings backfill:", u instanceof Error ? u : new Error(String(u)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to backfill findings", message: u instanceof Error ? u.message : "Unknown error" }, 500);
  }
});
Pe.get("/findings/backfill/status", $, async (e) => {
  const t = e.get("db"), n = e.req.query("domainId");
  try {
    const r = new se$1(t), s = new xe$1(t), i = jt$1(), o = e.req.header("X-Actor-Id") || "system", a = await cn(s, i, o), u = await r.countNeedingBackfill(a, { domainId: n, completedOnly: true });
    return e.json({ rulesetVersion: i.version, rulesetVersionId: a, total: u.total, needsBackfill: u.needsBackfill, evaluated: u.total - u.needsBackfill, completionPercent: u.total > 0 ? Math.round((u.total - u.needsBackfill) / u.total * 100) : 100 });
  } catch (r) {
    return P().error("Error getting backfill status:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get backfill status", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
function Es(e) {
  const t = { hasMx: false, hasSpf: false, hasDmarc: false, hasDkim: false, hasMtaSts: false, hasTlsRpt: false, securityScore: 0, issues: [], recommendations: [] };
  let n = 0;
  for (const r of e) switch (r.type) {
    case "mail.mx-present":
      t.hasMx = true, n += 20;
      break;
    case "mail.null-mx-configured":
      t.hasMx = true, n += 20;
      break;
    case "mail.no-mx-record":
      t.issues.push("No MX record"), t.recommendations.push("Add an MX record");
      break;
    case "mail.spf-present":
      t.hasSpf = true, n += 20, r.severity && r.severity !== "info" && t.issues.push(`SPF issue: ${r.severity}`);
      break;
    case "mail.no-spf-record":
      t.issues.push("No SPF record"), t.recommendations.push("Add an SPF record");
      break;
    case "mail.dmarc-present":
      t.hasDmarc = true, n += 20, r.severity && r.severity !== "info" && t.issues.push(`DMARC issue: ${r.severity}`);
      break;
    case "mail.no-dmarc-record":
      t.issues.push("No DMARC record"), t.recommendations.push("Add a DMARC record");
      break;
    case "mail.dkim-keys-present":
      t.hasDkim = true, n += 20;
      break;
    case "mail.dkim-no-valid-keys":
    case "mail.no-dkim-queried":
      t.issues.push("DKIM not configured"), t.recommendations.push("Configure DKIM");
      break;
    case "mail.mta-sts-present":
      t.hasMtaSts = true, n += 10;
      break;
    case "mail.tls-rpt-present":
      t.hasTlsRpt = true, n += 10;
      break;
  }
  return t.securityScore = Math.min(100, n), t;
}
function Ds(e, t) {
  var _a2, _b, _c2, _d2, _e2, _f, _g;
  if (!t) return e;
  const n = { ...e, hasMx: (_a2 = t.hasMx) != null ? _a2 : e.hasMx, hasSpf: (_b = t.hasSpf) != null ? _b : e.hasSpf, hasDmarc: (_c2 = t.hasDmarc) != null ? _c2 : e.hasDmarc, hasDkim: (_d2 = t.hasDkim) != null ? _d2 : e.hasDkim, hasMtaSts: (_e2 = t.hasMtaSts) != null ? _e2 : e.hasMtaSts, hasTlsRpt: (_f = t.hasTlsRpt) != null ? _f : e.hasTlsRpt, hasBimi: (_g = t.hasBimi) != null ? _g : false, securityScore: t.securityScore ? Number.parseInt(t.securityScore, 10) : e.securityScore };
  return t.dmarcPolicy && (n.dmarcPolicy = t.dmarcPolicy), t.dmarcSubdomainPolicy && (n.dmarcSubdomainPolicy = t.dmarcSubdomainPolicy), t.dmarcPercent && (n.dmarcPercent = t.dmarcPercent), t.dmarcRua && (n.dmarcRua = t.dmarcRua), t.dmarcRuf && (n.dmarcRuf = t.dmarcRuf), t.spfRecord && (n.spfRecord = t.spfRecord), t.dmarcRecord && (n.dmarcRecord = t.dmarcRecord), t.detectedProvider && (n.detectedProvider = t.detectedProvider), t.providerConfidence && (n.providerConfidence = t.providerConfidence), n;
}
function qs(e) {
  return e.map((t) => {
    var _a2;
    return { selector: t.selector, domain: t.domain, provenance: t.provenance, confidence: t.confidence, provider: t.provider || void 0, found: t.found, keyType: t.keyType || void 0, keySize: t.keySize || void 0, isValid: (_a2 = t.isValid) != null ? _a2 : void 0, validationError: t.validationError || void 0 };
  });
}
const un = new Hono();
un.use("*", $);
un.post("/run", G, async (e) => {
  const t = await e.req.json().catch(() => null);
  if (!t || typeof t != "object") return e.json({ error: "Invalid JSON in request body" }, 400);
  const n = await gr(e, { path: "/api/fleet-report/run", method: "POST", body: JSON.stringify(t) });
  return n instanceof Response ? n : e.json(n.json);
});
un.post("/import-csv", G, async (e) => {
  const t = await e.req.text();
  if (!t.trim()) return e.json({ error: "CSV data required" }, 400);
  const n = await gr(e, { path: "/api/fleet-report/import-csv", method: "POST", headers: { "Content-Type": "text/csv" }, body: t });
  return n instanceof Response ? n : e.json(n.json);
});
let Ns = false;
function Td() {
  const e = process.env.VITE_DMARC_TOOL_URL, t = process.env.VITE_DKIM_TOOL_URL, n = !!e && e.length > 0, r = !!t && t.length > 0;
  if (!Ns && (!n || !r)) {
    Ns = true;
    const s = P(), i = [];
    n || i.push("VITE_DMARC_TOOL_URL"), r || i.push("VITE_DKIM_TOOL_URL"), s.warn("Legacy tools configuration incomplete", { missingConfig: i, message: `Legacy tool URLs not configured: ${i.join(", ")}. Deep-links will return 503.` });
  }
  return { dmarcAvailable: n, dkimAvailable: r };
}
function zi(e, t) {
  var _a2;
  const n = e.req.header("X-Request-ID") || `req_${Date.now().toString(36)}`, s = (_a2 = { DMARC: "VITE_DMARC_TOOL_URL", DKIM: "VITE_DKIM_TOOL_URL" }[t]) != null ? _a2 : `${t.toUpperCase()}_TOOL_URL`, i = { ok: false, code: Hn.INFRA_CONFIG_MISSING, error: `${t} tool not configured`, requestId: n, details: { tool: t.toLowerCase(), hint: `Set the ${s} environment variable to enable this feature.` } };
  return e.json(i, 503);
}
const Rd = /^(\d{1,3}\.){3}\d{1,3}$/, Ed = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "localhost.localdomain"]), Dd = /^[a-zA-Z0-9_-]{1,63}$/;
function wr(e) {
  if (/[#\n\r\0]/.test(e) || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(e) || e.startsWith("xn--") || /[^\x00-\x7F]/.test(e) || Rd.test(e) || e.startsWith("[") && e.endsWith("]") || e.includes(":") && /^[0-9a-fA-F:]+$/.test(e)) return false;
  const t = e.toLowerCase();
  return Ed.has(t) || /^localhost/.test(t) ? false : Ui(e);
}
function Xi(e) {
  return !e || e.length > 63 ? false : Dd.test(e);
}
function Gt$1(e, t) {
  try {
    const n = new URL(e);
    for (const [r, s] of Object.entries(t)) n.searchParams.set(r, s);
    return n.toString();
  } catch {
    return null;
  }
}
const it$1 = new Hono();
it$1.post("/log", $, async (e) => {
  var _a2, _b;
  try {
    const t = await e.req.json(), { tool: n, domain: r, action: s, metadata: i } = t;
    if (!n || !r || !s) return e.json({ error: "Missing required fields: tool, domain, action" }, 400);
    if (!["dmarc", "dkim"].includes(n)) return e.json({ error: 'Invalid tool type. Must be "dmarc" or "dkim"' }, 400);
    if (!["view", "navigate"].includes(s)) return e.json({ error: 'Invalid action type. Must be "view" or "navigate"' }, 400);
    const o = e.get("tenantId") || "default";
    ka({ tenantId: o, toolType: n, domain: r, parameters: { action: s, ...i } });
    let a = false;
    const u = e.get("db");
    if (u) {
      const d = new nn(u), c = { dmarc: "dmarc-check", dkim: "dkim-check" };
      await d.log({ toolType: (_a2 = c[n]) != null ? _a2 : "dmarc-check", domain: r, requestSource: "ui", requestedBy: (_b = e.get("actorId")) != null ? _b : void 0, responseStatus: "success", tenantId: o === "default" ? void 0 : o }), a = true;
    }
    return e.json({ success: true, logged: true, persisted: a, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  } catch (t) {
    return P().error("Error logging legacy tool access:", t instanceof Error ? t : new Error(String(t)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ success: false, logged: false, persisted: false, error: "Failed to log access" }, 200);
  }
});
it$1.get("/config", (e) => {
  const { dmarcAvailable: t, dkimAvailable: n } = Td(), r = { dmarc: { name: "DMARC Analyzer", available: t, supportDeepLink: t, supportEmbed: false, authRequired: true, disclaimer: "Legacy tool output is informational only. No parity with workbench findings is guaranteed." }, dkim: { name: "DKIM Validator", available: n, supportDeepLink: n, supportEmbed: false, authRequired: true, disclaimer: "Legacy tool output is informational only. No parity with workbench findings is guaranteed." } };
  return e.json(r);
});
it$1.get("/dmarc/deeplink", $, (e) => {
  const t = e.req.query("domain"), n = process.env.VITE_DMARC_TOOL_URL;
  if (!n) return zi(e, "DMARC");
  if (!t) return e.json({ error: "Domain is required" }, 400);
  if (!wr(t)) return e.json({ error: "Invalid domain format" }, 400);
  const r = Gt$1(n, { domain: t });
  return r ? e.json({ tool: "dmarc", domain: t, url: r, disclaimer: "This links to a legacy tool. Results may differ from workbench findings. No parity is guaranteed.", legacyWarning: true, openInNewTab: true }) : e.json({ error: "Failed to build deep-link URL" }, 500);
});
it$1.get("/dkim/deeplink", $, (e) => {
  const t = e.req.query("domain"), n = e.req.query("selector"), r = process.env.VITE_DKIM_TOOL_URL;
  if (!r) return zi(e, "DKIM");
  if (!t) return e.json({ error: "Domain is required" }, 400);
  if (!n) return e.json({ error: "Selector is required" }, 400);
  if (!wr(t)) return e.json({ error: "Invalid domain format" }, 400);
  if (!Xi(n)) return e.json({ error: "Invalid selector format" }, 400);
  const s = Gt$1(r, { domain: t, selector: n });
  return s ? e.json({ tool: "dkim", domain: t, selector: n, url: s, disclaimer: "This links to a legacy tool. Results may differ from workbench findings. No parity is guaranteed.", legacyWarning: true, openInNewTab: true }) : e.json({ error: "Failed to build deep-link URL" }, 500);
});
it$1.post("/bulk-deeplinks", $, async (e) => {
  const t = process.env.VITE_DMARC_TOOL_URL, n = process.env.VITE_DKIM_TOOL_URL;
  let r;
  try {
    r = await e.req.json();
  } catch {
    return e.json({ error: "Invalid JSON body" }, 400);
  }
  const { requests: s } = r;
  if (!s || !Array.isArray(s)) return e.json({ error: "requests array is required" }, 400);
  if (s.length > 50) return e.json({ error: "Maximum 50 requests per batch" }, 400);
  const i = s.map((o, a) => {
    const { tool: u, domain: d, selector: c } = o;
    if (!u || !["dmarc", "dkim"].includes(u)) return { index: a, error: "Invalid tool type" };
    if (!d || !wr(d)) return { index: a, error: "Invalid domain" };
    if (u === "dmarc") {
      if (!t) return { index: a, error: "DMARC tool not configured", code: Hn.INFRA_CONFIG_MISSING };
      const p = Gt$1(t, { domain: d });
      return p ? { index: a, tool: u, domain: d, url: p } : { index: a, error: "Failed to build URL" };
    }
    if (u === "dkim") {
      if (!n) return { index: a, error: "DKIM tool not configured", code: Hn.INFRA_CONFIG_MISSING };
      if (!c || !Xi(c)) return { index: a, error: "Invalid selector" };
      const p = Gt$1(n, { domain: d, selector: c });
      return p ? { index: a, tool: u, domain: d, selector: c, url: p } : { index: a, error: "Failed to build URL" };
    }
    return { index: a, error: "Unknown error" };
  });
  return e.json({ results: i, disclaimer: "These links point to legacy tools. Results may differ from workbench findings. No parity is guaranteed.", legacyWarning: true });
});
it$1.get("/shadow-stats", $, async (e) => {
  var _a2;
  const t = e.get("db"), n = e.req.query("domain");
  try {
    const r = new nn(t), s = new rt(t), i = await r.getStats(), o = await s.getStats();
    let a = null, u = 0;
    const d = [];
    if (n) {
      const c = await r.findByDomain(n), p = await s.findByDomain(n), l = await t.selectWhere(K$1, eq(K$1.domainName, n));
      l.sort((h, y) => new Date(y.createdAt).getTime() - new Date(h.createdAt).getTime()), l.length > 0 && (u = (await t.selectWhere(X, eq(X.snapshotId, l[0].id))).length);
      const f = p.filter((h) => h.status === "mismatch" || h.status === "partial-match");
      for (const h of f.slice(0, 10)) {
        const y = h.comparisons;
        for (const v of y) v.status === "mismatch" && d.push({ id: h.id, field: v.field, legacyValue: v.legacyValue, newValue: v.newValue, comparedAt: h.comparedAt });
      }
      a = { legacyAccessCount: c.length, comparisonCount: p.length, matchCount: p.filter((h) => h.status === "match").length, mismatchCount: p.filter((h) => h.status === "mismatch").length, partialMatchCount: p.filter((h) => h.status === "partial-match").length, pendingAdjudication: p.filter((h) => !h.adjudication && h.status !== "match").length };
    }
    return e.json({ domain: n || "all", legacyAccessCount: n ? (_a2 = a == null ? void 0 : a.legacyAccessCount) != null ? _a2 : 0 : i.total, newFindingsCount: u, discrepancies: d, stats: { legacy: { total: i.total, byToolType: i.byToolType, successRate: i.successRate, last24h: i.last24h }, shadow: { total: o.total, matches: o.matches, mismatches: o.mismatches, partialMatches: o.partialMatches, acknowledged: o.acknowledged, pending: o.pending }, domain: a }, durable: true });
  } catch (r) {
    return P().error("Shadow stats error:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/unknown", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get shadow comparison statistics", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
const Cs = ["open", "in-progress", "resolved", "closed"], ks = ["low", "medium", "high", "critical"], qd = new Hono().post("/collect/mail", $, G, async (e) => {
  const t = await Se$1(e, { domain: Jn("domain"), preferredProvider: Ct$1("preferredProvider", ["google", "microsoft", "zoho", "other"], false), explicitSelectors: ht$1("explicitSelectors", (a, u) => {
    if (typeof a != "string" || a.length === 0) throw new Error(`explicitSelectors[${u}] must be a non-empty string`);
    if (a.length > 63) throw new Error(`explicitSelectors[${u}] must be at most 63 characters`);
    return a;
  }) });
  if (!t.success) return De(e, t.error);
  const n = t.data, { collectorUrl: r, internalSecret: s } = Eo(e.env), i = e.get("tenantId"), o = e.get("actorId");
  if (!i || !o) return e.json({ error: "Authenticated tenant and actor required" }, 403);
  if (!s) return e.json({ error: "Collector integration is not configured" }, 503);
  try {
    const a = await fetch(`${r}/api/collect/mail`, { method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Secret": s, "X-Tenant-Id": i, "X-Actor-Id": o }, body: JSON.stringify(n) });
    if (!a.ok) {
      const d = await a.json().catch(() => ({}));
      return e.json({ error: d.message || d.error || "Collector error" }, a.status);
    }
    const u = await a.json();
    return bs({ tenantId: i, domain: n.domain, checkType: "all", success: true, durationMs: void 0 }), e.json(u);
  } catch (a) {
    return bs({ tenantId: i, domain: n.domain, checkType: "all", success: false }), P().error("Collector connection error", a instanceof Error ? a : new Error(String(a)), { requestId: e.req.header("X-Request-ID"), path: "/api/mail/collect/mail", method: "POST", tenantId: i, domain: n.domain }), e.json({ error: "Failed to connect to collector service" }, 503);
  }
}).post("/remediation", $, G, async (e) => {
  var _a2;
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const s = await Se$1(e, { domain: Jn("domain"), snapshotId: Ya("snapshotId", false), contactEmail: Za("contactEmail"), contactName: Qe("contactName", { minLength: 2, maxLength: 100 }), contactPhone: Qe("contactPhone", { minLength: 8, maxLength: 20, pattern: /^\+?[\d\s-]{8,20}$/, patternMessage: "contactPhone must be a valid phone number" }), issues: ht$1("issues", (v, m) => {
    if (typeof v != "string" || v.length === 0) throw new Error(`issues[${m}] must be a non-empty string`);
    return v;
  }), priority: Ct$1("priority", ks, false), notes: Qe("notes", { maxLength: 5e3 }) });
  if (!s.success) return De(e, s.error);
  const { contactEmail: i, contactName: o, contactPhone: a, domain: u, issues: d, notes: c, priority: p, snapshotId: l } = s.data;
  if (!u) return e.json({ error: "domain is required" }, 400);
  if (!i) return e.json({ error: "contactEmail is required" }, 400);
  if (!o) return e.json({ error: "contactName is required" }, 400);
  if (!d || d.length === 0) return e.json({ error: "issues must include at least one item" }, 400);
  const f = new lt$1(t), h = new ee(t), y = await f.create({ tenantId: n, createdBy: r, domain: u, snapshotId: l, contactEmail: i, contactName: o, contactPhone: a, issues: d, priority: p != null ? p : "medium", notes: c, status: "open" });
  return await h.create({ action: "remediation_request_created", entityType: "remediation_request", entityId: y.id, actorId: r, tenantId: n, newValue: { domain: u, issues: d, priority: y.priority, status: y.status }, ipAddress: e.req.header("x-forwarded-for") || e.req.header("x-real-ip"), userAgent: e.req.header("user-agent") }), Ke().remediation.created({ tenantId: n, domainId: u, type: (_a2 = d == null ? void 0 : d.join(",")) != null ? _a2 : "unknown", priority: y.priority }), e.json({ remediation: y }, 201);
}).get("/remediation", $, async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const r = e.req.query("status"), s = e.req.query("priority"), i = e.req.query("domain");
  if (r && !Cs.includes(r)) return e.json({ error: "Invalid remediation status filter" }, 400);
  if (s && !ks.includes(s)) return e.json({ error: "Invalid remediation priority filter" }, 400);
  const a = await new lt$1(t).list(n, { domains: i ? [i] : void 0, statuses: r ? [r] : void 0, priorities: s ? [s] : void 0 });
  return e.json({ remediation: a });
}).get("/remediation/stats", $, async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const s = await new lt$1(t).countByStatus(n);
  return e.json({ counts: s });
}).get("/remediation/by-id/:id", $, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("id");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const i = await new lt$1(t).findById(r, n);
  return i ? e.json({ remediation: i }) : e.json({ error: "Remediation request not found" }, 404);
}).get("/remediation/domain/:domain", $, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("domain");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const i = await new lt$1(t).findByDomain(r, n);
  return e.json({ remediation: i });
}).patch("/remediation/:id", $, G, async (e) => {
  var _a2, _b, _c2, _d2, _e2;
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const i = await Se$1(e, { status: Ct$1("status", Cs, false), assignedTo: Qe("assignedTo", { maxLength: 100 }), notes: Qe("notes", { maxLength: 5e3 }) });
  if (!i.success) return De(e, i.error);
  const o = new lt$1(t), a = await o.findById(s, n);
  if (!a) return e.json({ error: "Remediation request not found" }, 404);
  const u = (_a2 = i.data.status) != null ? _a2 : a.status, d = await o.updateStatus(s, n, u, { assignedTo: i.data.assignedTo, notes: i.data.notes });
  if (!d) return e.json({ error: "Remediation request not found" }, 404);
  if (await new ee(t).create({ action: "remediation_request_updated", entityType: "remediation_request", entityId: d.id, actorId: r, tenantId: n, previousValue: { status: a.status, assignedTo: a.assignedTo, notes: a.notes }, newValue: { status: d.status, assignedTo: d.assignedTo, notes: d.notes }, ipAddress: e.req.header("x-forwarded-for") || e.req.header("x-real-ip"), userAgent: e.req.header("user-agent") }), d.status !== a.status) {
    const p = d.status;
    if (p === "resolved" || p === "closed") {
      const l = a.createdAt ? Date.now() - new Date(a.createdAt).getTime() : 0;
      Ke().remediation.completed({ tenantId: n, domainId: a.domain, type: (_c2 = (_b = a.issues) == null ? void 0 : _b.join(",")) != null ? _c2 : "unknown", durationMs: l });
    } else p === "in-progress" && Ke().remediation.started({ tenantId: n, domainId: a.domain, type: (_e2 = (_d2 = a.issues) == null ? void 0 : _d2.join(",")) != null ? _e2 : "unknown" });
  }
  return e.json({ remediation: d });
}), Ms = vt$1({ service: "migrate-routes" }), ot$1 = new Hono(), xs = ["users", "sessions", "domains", "ruleset_versions", "snapshots", "observations", "record_sets", "findings", "suggestions", "domain_notes", "domain_tags", "saved_filters", "audit_events", "template_overrides", "monitored_domains", "alerts", "shared_reports", "fleet_reports", "probe_observations"], js = { users: ["id", "email", "password_hash", "tenant_id", "created_at", "updated_at"], sessions: ["id", "token", "user_email", "tenant_id", "expires_at", "created_at"], domains: ["id", "name", "normalized_name", "tenant_id", "created_at", "updated_at"], snapshots: ["id", "domain_id", "tenant_id", "collector", "created_at"], observations: ["id", "snapshot_id", "query_name", "query_type", "rcode"], record_sets: ["id", "snapshot_id", "domain_id", "name", "type", "records", "tenant_id"], findings: ["id", "domain_id", "tenant_id", "severity", "code", "message"], suggestions: ["id", "domain_id", "tenant_id", "action", "target", "description"], domain_notes: ["id", "domain_id", "tenant_id", "content", "created_by", "created_at"], domain_tags: ["id", "domain_id", "tenant_id", "tag", "created_by", "created_at"], monitored_domains: ["id", "domain_id", "schedule", "tenant_id", "created_by", "created_at", "is_active"], alerts: ["id", "monitored_domain_id", "tenant_id", "status", "severity", "message"], audit_events: ["id", "tenant_id", "action", "actor_id", "created_at"], ruleset_versions: ["id", "version", "rules", "tenant_id", "created_at"], saved_filters: ["id", "tenant_id", "name", "filters", "created_by", "created_at"], template_overrides: ["id", "tenant_id", "template_id", "field_name", "value", "created_by"], shared_reports: ["id", "tenant_id", "name", "type", "config", "created_by"], fleet_reports: ["id", "tenant_id", "name", "findings", "created_by", "created_at"], probe_observations: ["id", "tenant_id", "domain", "record_type", "resolver", "response_code"] };
ot$1.get("/status", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const i = ((await t.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)).rows || []).map((a) => a.table_name), o = xs.filter((a) => !i.includes(a));
    return o.length > 0 ? e.json({ status: "incomplete", missingTables: o, existingTables: i, message: `Missing tables: ${o.join(", ")}` }, 200) : e.json({ status: "complete", tables: xs.length, message: "All required tables exist" });
  } catch (n) {
    return e.json({ status: "error", message: n.message }, 500);
  }
});
ot$1.get("/schema", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const n = {};
    for (const [s, i] of Object.entries(js)) {
      const d = ((await t.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${s} AND table_schema = 'public'
      `)).rows || []).map((p) => p.column_name), c = i.filter((p) => !d.includes(p));
      n[s] = { columns: d, missing: c };
    }
    const r = Object.entries(n).filter(([, s]) => s.missing.length > 0).map(([s, i]) => ({ table: s, missing: i.missing }));
    return r.length > 0 ? e.json({ status: "incomplete", issues: r, message: `${r.length} tables have missing columns` }, 200) : e.json({ status: "complete", tablesChecked: Object.keys(js).length, message: "All tables have required columns" });
  } catch (n) {
    return e.json({ status: "error", message: n.message }, 500);
  }
});
ot$1.post("/reset", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    return await t.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations;`), e.json({ status: "reset", message: "Migration tracker cleared. Migrations will re-run on next request." });
  } catch (n) {
    return e.json({ status: "error", message: n.message }, 500);
  }
});
ot$1.post("/repair", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  const { repairSchema: n } = await Promise.resolve().then(() => Ea);
  try {
    return await n(t), e.json({ status: "repaired", message: "Schema repair complete" });
  } catch (r) {
    return e.json({ status: "error", message: r.message }, 500);
  }
});
ot$1.post("/rebuild", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const n = ["alerts", "audit_events", "domain_notes", "domain_tags", "findings", "fleet_reports", "monitored_domains", "observations", "probe_observations", "record_sets", "ruleset_versions", "saved_filters", "shared_reports", "snapshots", "suggestions", "template_overrides"];
    for (const r of n) try {
      await t.execute(sql.raw(`DROP TABLE IF EXISTS "${r}" CASCADE;`)), Ms.info(`[Rebuild] Dropped ${r}`);
    } catch (s) {
      Ms.warn(`[Rebuild] Could not drop ${r}: ${s.message}`);
    }
    return await t.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations;`), e.json({ status: "rebuilt", dropped: n, message: "Broken tables dropped. Real migrations will recreate them on next request." });
  } catch (n) {
    return e.json({ status: "error", message: n.message }, 500);
  }
});
ot$1.post("/run-init", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const n = join(process.cwd(), "packages", "db", "src", "migrations", "0000_nebulous_steve_rogers.sql"), s = (await readFile$1(n, "utf-8")).split("--> statement-breakpoint").map((a) => a.trim()).filter((a) => a.length > 0), i = [];
    for (const a of s) try {
      await t.execute(sql.raw(a)), i.push({ statement: a.slice(0, 60), status: "ok" });
    } catch (u) {
      const d = u.message || String(u), p = ["already exists", "does not exist", "cannot drop", "DuplicateObject", "duplicate_object", "no such table"].some((l) => d.includes(l));
      i.push({ statement: a.slice(0, 60), status: p ? "skipped" : "error", error: p ? void 0 : d });
    }
    const o = i.filter((a) => a.status === "error");
    return o.length > 0 ? e.json({ status: "partial", total: i.length, errors: o.map((a) => ({ statement: a.statement, error: a.error })) }, 200) : e.json({ status: "complete", total: i.length, message: "Init migration executed successfully" });
  } catch (n) {
    return e.json({ status: "error", message: n.message }, 500);
  }
});
const Ze = new Hono();
Ze.use("*", $);
async function Lt$1(e, t, n) {
  return (await e.findByTenant(t)).find((s) => s.id === n || s.domainId === n);
}
function Nd(e, t) {
  if (!(e instanceof Error)) return false;
  const n = e.message.toLowerCase();
  return n.includes("duplicate key") || n.includes("unique constraint") || n.includes(t.toLowerCase());
}
Ze.get("/domains", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const r = new st(t), s = new te(t), i = await r.findByTenant(n), o = await Promise.all(i.map(async (a) => {
    const u = await s.findById(a.domainId);
    return { ...a, domainName: (u == null ? void 0 : u.name) || "Unknown" };
  }));
  return e.json({ monitoredDomains: o });
});
Ze.get("/domains/:id", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("id");
  if (!t || !n) return e.json({ error: "Database or tenant context unavailable" }, 503);
  const s = new st(t), i = new te(t), o = await Lt$1(s, n, r);
  if (!o) return e.json({ error: "Monitored domain not found" }, 404);
  const a = await i.findById(o.domainId);
  return e.json({ monitoredDomain: { ...o, domainName: (a == null ? void 0 : a.name) || "Unknown" } });
});
Ze.post("/domains", G, async (e) => {
  var _a2, _b;
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const s = await e.req.json().catch(() => ({}));
  if (!s.domainId && !s.domainName) return e.json({ error: "Either domainId or domainName is required" }, 400);
  const i = new te(t), o = new st(t);
  let a = s.domainId, u = s.domainName, d = a ? await i.findById(a) : void 0;
  if ((d == null ? void 0 : d.tenantId) && d.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
  if (!a && s.domainName) {
    if (d = await i.findByName(s.domainName), (d == null ? void 0 : d.tenantId) && d.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
    d || (d = await i.create({ name: s.domainName, normalizedName: s.domainName.toLowerCase(), tenantId: n, zoneManagement: "unknown" })), a = d.id, u = d.name;
  }
  if (!a) return e.json({ error: "Could not resolve domain" }, 400);
  const c = await Lt$1(o, n, a);
  if (c) return e.json({ error: "Domain is already being monitored", existingId: c.id }, 409);
  if (await o.findByDomainId(a, n)) return e.json({ error: "Domain is already being monitored" }, 409);
  let l;
  try {
    l = await o.create({ domainId: a, schedule: s.schedule || "daily", alertChannels: s.alertChannels || {}, maxAlertsPerDay: (_a2 = s.maxAlertsPerDay) != null ? _a2 : 5, suppressionWindowMinutes: (_b = s.suppressionWindowMinutes) != null ? _b : 60, isActive: true, createdBy: r, tenantId: n });
  } catch (h) {
    if (Nd(h, "monitored_domain_unique_idx")) return e.json({ error: "Domain is already being monitored" }, 409);
    throw h;
  }
  return await new ee(t).create({ action: "monitored_domain_created", entityType: "monitored_domain", entityId: l.id, actorId: r, tenantId: n, newValue: { domainId: l.domainId, domainName: u, schedule: l.schedule, isActive: l.isActive }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), e.json({ monitoredDomain: l }, 201);
});
Ze.put("/domains/:id", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const i = await e.req.json().catch(() => ({})), o = new st(t), a = await Lt$1(o, n, s);
  if (!a) return e.json({ error: "Monitored domain not found" }, 404);
  const u = await o.update(a.id, { ...i.schedule && { schedule: i.schedule }, ...i.alertChannels && { alertChannels: i.alertChannels }, ...i.maxAlertsPerDay !== void 0 && { maxAlertsPerDay: i.maxAlertsPerDay }, ...i.suppressionWindowMinutes !== void 0 && { suppressionWindowMinutes: i.suppressionWindowMinutes }, ...i.isActive !== void 0 && { isActive: i.isActive } });
  return u && await new ee(t).create({ action: "monitored_domain_updated", entityType: "monitored_domain", entityId: u.id, actorId: r, tenantId: n, previousValue: { schedule: a.schedule, isActive: a.isActive, alertChannels: a.alertChannels, maxAlertsPerDay: a.maxAlertsPerDay, suppressionWindowMinutes: a.suppressionWindowMinutes }, newValue: { schedule: u.schedule, isActive: u.isActive, alertChannels: u.alertChannels, maxAlertsPerDay: u.maxAlertsPerDay, suppressionWindowMinutes: u.suppressionWindowMinutes }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), e.json({ monitoredDomain: u });
});
Ze.delete("/domains/:id", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const i = new st(t), o = new te(t), a = await Lt$1(i, n, s);
  if (!a) return e.json({ error: "Monitored domain not found" }, 404);
  const u = await o.findById(a.domainId);
  return await i.delete(a.id), await new ee(t).create({ action: "monitored_domain_deleted", entityType: "monitored_domain", entityId: a.id, actorId: r, tenantId: n, previousValue: { domainId: a.domainId, domainName: u == null ? void 0 : u.name, schedule: a.schedule, isActive: a.isActive }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), e.json({ success: true, deletedId: a.id });
});
Ze.post("/domains/:id/toggle", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId"), s = e.req.param("id");
  if (!t || !n || !r) return e.json({ error: "Database, tenant, and actor context required" }, 503);
  const i = new st(t), o = await Lt$1(i, n, s);
  if (!o) return e.json({ error: "Monitored domain not found" }, 404);
  const a = await i.update(o.id, { isActive: !o.isActive });
  return a && await new ee(t).create({ action: "monitored_domain_toggled", entityType: "monitored_domain", entityId: a.id, actorId: r, tenantId: n, previousValue: { isActive: o.isActive }, newValue: { isActive: a.isActive }, ipAddress: ze(e), userAgent: e.req.header("user-agent") }), e.json({ monitoredDomain: a });
});
const ie$1 = new Hono();
ie$1.use("*", $);
ie$1.post("/search", async (e) => {
  var _a2, _b;
  const t = Date.now(), n = e.get("db"), r = e.get("tenantId");
  if (!r) return e.json({ error: "Unauthorized" }, 401);
  const s = await Se$1(e, { query: Qe("query", { maxLength: 253 }), tags: ht$1("tags"), severities: ht$1("severities"), zoneManagement: ht$1("zoneManagement"), limit: er("limit", { min: 1, max: 100, required: false }), offset: er("offset", { min: 0, required: false }) });
  if (!s.success) return De(e, s.error);
  const { query: i, tags: o, severities: a, zoneManagement: u, limit: d = 20, offset: c = 0 } = s.data;
  try {
    const p = new Mt$1(n), l = [eq(z$1.tenantId, r)];
    if (i) {
      const I = or$1(like(z$1.name, `%${i}%`), like(z$1.normalizedName, `%${i}%`));
      I && l.push(I);
    }
    u && u.length > 0 && l.push(inArray(z$1.zoneManagement, u));
    let f = [];
    if (o && o.length > 0) {
      if (f = await p.findDomainsByTags(o, r), f.length === 0) return e.json({ domains: [], total: 0 });
      l.push(inArray(z$1.id, f));
    }
    const h = (_a2 = l.length > 1 ? and(...l) : l[0]) != null ? _a2 : eq(z$1.tenantId, r), y = await n.getDrizzle().query.domains.findMany({ where: h, limit: d, offset: c, orderBy: desc(z$1.updatedAt) }), v = y.map((I) => I.id), m = v.length > 0 ? await n.getDrizzle().query.snapshots.findMany({ where: inArray(K$1.domainId, v), orderBy: desc(K$1.createdAt) }) : [], w = /* @__PURE__ */ new Map();
    for (const I of m) w.has(I.domainId) || w.set(I.domainId, I);
    const S = Array.from(w.values()).map((I) => I.id), A = a && a.length > 0, q = S.length > 0 ? await n.getDrizzle().query.findings.findMany({ where: A ? and(inArray(X.snapshotId, S), inArray(X.severity, a)) : inArray(X.snapshotId, S) }) : [], R = /* @__PURE__ */ new Map();
    for (const I of q) R.has(I.snapshotId) || R.set(I.snapshotId, []), (_b = R.get(I.snapshotId)) == null ? void 0 : _b.push(I);
    const b = y.map((I) => {
      const E = w.get(I.id);
      if (!E) return { ...I, findings: [], findingsEvaluated: false, latestSnapshot: null };
      const x = E.rulesetVersionId !== null, k = R.get(E.id) || [];
      return A && k.length === 0 && x ? null : { ...I, findings: k, findingsEvaluated: x, latestSnapshot: { id: E.id, createdAt: E.createdAt, resultState: E.resultState, rulesetVersionId: E.rulesetVersionId } };
    }).filter(Boolean);
    return Ca({ tenantId: r, query: i, filters: { tags: o, severities: a, zoneManagement: u }, resultCount: b.length, durationMs: Date.now() - t }), e.json({ domains: b, total: b.length, limit: d, offset: c });
  } catch {
    return e.json({ error: "Search failed" }, 500);
  }
});
ie$1.get("/domains/by-name/:domain", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  const r = e.req.param("domain").toLowerCase();
  try {
    const i = await new te(t).findByNameForTenant(r, n);
    return i ? e.json({ domain: { id: i.id, name: i.name, normalizedName: i.normalizedName, zoneManagement: i.zoneManagement } }) : e.json({ error: "Domain not found" }, 404);
  } catch {
    return e.json({ error: "Failed to resolve domain context" }, 500);
  }
});
ie$1.get("/domains/:domainId/notes", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("domainId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  try {
    const i = await new te(t).findById(r);
    if (!i || i.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
    const a = await new rn(t).findByDomainId(r);
    return e.json({ notes: a });
  } catch {
    return e.json({ error: "Failed to fetch notes" }, 500);
  }
});
ie$1.post("/domains/:domainId/notes", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("domainId"), i = await Se$1(e, { content: tt("content", { minLength: 1, maxLength: 1e4 }) });
  if (!i.success) return De(e, i.error);
  const { content: o } = i.data;
  try {
    const u = await new te(t).findById(s);
    if (!u || u.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
    const d = new rn(t), c = new ee(t), p = await d.create({ domainId: s, content: o.trim(), createdBy: r, tenantId: n });
    return await c.create({ action: "domain_note_created", entityType: "domain_note", entityId: p.id, newValue: { content: p.content }, actorId: r, tenantId: n, ipAddress: e.req.header("x-forwarded-for") || e.req.header("x-real-ip"), userAgent: e.req.header("user-agent") }), e.json({ note: p }, 201);
  } catch {
    return e.json({ error: "Failed to create note" }, 500);
  }
});
ie$1.put("/notes/:noteId", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("noteId"), i = await Se$1(e, { content: tt("content", { minLength: 1, maxLength: 1e4 }) });
  if (!i.success) return De(e, i.error);
  const { content: o } = i.data;
  try {
    const a = new rn(t), u = new ee(t), d = await a.findById(s);
    if (!d || d.tenantId !== n) return e.json({ error: "Note not found" }, 404);
    const c = await a.update(s, { content: o });
    return c ? (await u.create({ action: "domain_note_updated", entityType: "domain_note", entityId: s, previousValue: { content: d.content }, newValue: { content: c.content }, actorId: r, tenantId: n }), e.json({ note: c })) : e.json({ error: "Note not found" }, 404);
  } catch {
    return e.json({ error: "Failed to update note" }, 500);
  }
});
ie$1.delete("/notes/:noteId", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("noteId");
  try {
    const i = new rn(t), o = new ee(t), a = await i.findById(s);
    return !a || a.tenantId !== n ? e.json({ error: "Note not found" }, 404) : (await i.delete(s), await o.create({ action: "domain_note_deleted", entityType: "domain_note", entityId: s, previousValue: { content: a.content }, actorId: r, tenantId: n }), e.json({ success: true }));
  } catch {
    return e.json({ error: "Failed to delete note" }, 500);
  }
});
ie$1.get("/tags", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  try {
    const s = await new Mt$1(t).listByTenant(n);
    return e.json({ tags: s });
  } catch {
    return e.json({ error: "Failed to fetch tags" }, 500);
  }
});
ie$1.get("/domains/:domainId/tags", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.param("domainId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  try {
    const i = await new te(t).findById(r);
    if (!i || i.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
    const a = await new Mt$1(t).findByDomainId(r);
    return e.json({ tags: a });
  } catch {
    return e.json({ error: "Failed to fetch tags" }, 500);
  }
});
ie$1.post("/domains/:domainId/tags", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("domainId"), o = await new te(t).findById(s);
  if (!o || o.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
  const a = await Se$1(e, { tag: tt("tag", { minLength: 1, maxLength: 50, pattern: /^[a-zA-Z0-9_-]+$/, patternMessage: "tag must contain only letters, numbers, underscores, and hyphens" }) });
  if (!a.success) return De(e, a.error);
  const u = a.data.tag.trim().toLowerCase();
  try {
    const d = new Mt$1(t), c = new ee(t), p = await d.create({ domainId: s, tag: u, createdBy: r, tenantId: n });
    return await c.create({ action: "domain_tag_added", entityType: "domain_tag", entityId: p.id, newValue: { tag: u }, actorId: r, tenantId: n }), e.json({ tag: p }, 201);
  } catch {
    return e.json({ error: "Failed to add tag" }, 500);
  }
});
ie$1.delete("/domains/:domainId/tags/:tag", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("domainId"), i = decodeURIComponent(e.req.param("tag"));
  try {
    const a = await new te(t).findById(s);
    if (!a || a.tenantId !== n) return e.json({ error: "Domain not found" }, 404);
    const u = new Mt$1(t), d = new ee(t);
    return await u.deleteByDomainAndTag(s, i.toLowerCase()), await d.create({ action: "domain_tag_removed", entityType: "domain_tag", entityId: s, previousValue: { tag: i }, actorId: r, tenantId: n }), e.json({ success: true });
  } catch {
    return e.json({ error: "Failed to remove tag" }, 500);
  }
});
ie$1.get("/filters", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  try {
    const i = await new sn(t).findByTenant(n, r);
    return e.json({ filters: i.map((o) => ({ ...o, canManage: o.createdBy === r })) });
  } catch {
    return e.json({ error: "Failed to fetch filters" }, 500);
  }
});
ie$1.post("/filters", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = await Se$1(e, { name: tt("name", { minLength: 1, maxLength: 100 }), description: Qe("description", { maxLength: 500 }), criteria: (d) => d && typeof d == "object" ? d : {}, isShared: Vi("isShared", false) });
  if (!s.success) return De(e, s.error);
  const { name: i, description: o, criteria: a, isShared: u } = s.data;
  try {
    const d = new sn(t), c = new ee(t), p = await d.create({ name: i.trim(), description: o, criteria: a || {}, isShared: u || false, createdBy: r, tenantId: n });
    return await c.create({ action: "filter_created", entityType: "saved_filter", entityId: p.id, newValue: { name: p.name, criteria: p.criteria }, actorId: r, tenantId: n }), e.json({ filter: p }, 201);
  } catch {
    return e.json({ error: "Failed to create filter" }, 500);
  }
});
ie$1.put("/filters/:filterId", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("filterId"), i = await e.req.json().catch(() => null);
  if (!i || typeof i != "object") return e.json({ error: "Invalid JSON in request body" }, 400);
  const o = {};
  if ("criteria" in i) return e.json({ error: "Filter criteria cannot be updated from this route" }, 400);
  if ("name" in i) {
    if (typeof i.name != "string" || i.name.trim().length === 0 || i.name.length > 100) return e.json({ error: "name must be a non-empty string up to 100 characters" }, 400);
    o.name = i.name.trim();
  }
  if ("description" in i) {
    if (i.description !== null && typeof i.description != "string") return e.json({ error: "description must be a string or null" }, 400);
    if (typeof i.description == "string" && i.description.length > 500) return e.json({ error: "description must be 500 characters or fewer" }, 400);
    o.description = typeof i.description == "string" && i.description.trim() || null;
  }
  if ("isShared" in i) {
    if (typeof i.isShared != "boolean") return e.json({ error: "isShared must be a boolean" }, 400);
    o.isShared = i.isShared;
  }
  if (Object.keys(o).length === 0) return e.json({ error: "At least one editable filter field is required" }, 400);
  try {
    const a = new sn(t), u = new ee(t), d = await a.findById(s);
    if (!d || d.tenantId !== n) return e.json({ error: "Filter not found" }, 404);
    if (d.createdBy !== r) return e.json({ error: "Cannot edit filter created by another user" }, 403);
    const c = await a.update(s, o);
    return c ? (await u.create({ action: "filter_updated", entityType: "saved_filter", entityId: s, previousValue: { name: d.name, criteria: d.criteria }, newValue: { name: c.name, criteria: c.criteria }, actorId: r, tenantId: n }), e.json({ filter: c })) : e.json({ error: "Filter not found" }, 404);
  } catch {
    return e.json({ error: "Failed to update filter" }, 500);
  }
});
ie$1.delete("/filters/:filterId", G, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("filterId");
  try {
    const i = new sn(t), o = new ee(t), a = await i.findById(s);
    return !a || a.tenantId !== n ? e.json({ error: "Filter not found" }, 404) : a.createdBy !== r ? e.json({ error: "Cannot delete filter created by another user" }, 403) : (await i.delete(s), await o.create({ action: "filter_deleted", entityType: "saved_filter", entityId: s, previousValue: { name: a.name }, actorId: r, tenantId: n }), e.json({ success: true }));
  } catch {
    return e.json({ error: "Failed to delete filter" }, 500);
  }
});
ie$1.get("/templates/overrides", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  const r = e.req.query("provider");
  try {
    const s = new _t$1(t), i = r ? await s.findByProvider(r, n) : [];
    return e.json({ overrides: i });
  } catch {
    return e.json({ error: "Failed to fetch overrides" }, 500);
  }
});
ie$1.post("/templates/overrides", Ue, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = await Se$1(e, { providerKey: tt("providerKey", { minLength: 1, maxLength: 64 }), templateKey: tt("templateKey", { minLength: 1, maxLength: 64 }), overrideData: (d) => {
    if (!d || typeof d != "object") throw new Error("overrideData must be an object");
    return d;
  }, appliesToDomains: ht$1("appliesToDomains") });
  if (!s.success) return De(e, s.error);
  const { providerKey: i, templateKey: o, overrideData: a, appliesToDomains: u } = s.data;
  try {
    const d = new _t$1(t), c = new ee(t), p = await d.create({ providerKey: i, templateKey: o, overrideData: a, appliesToDomains: u || [], createdBy: r, tenantId: n });
    return await c.create({ action: "template_override_created", entityType: "template_override", entityId: p.id, newValue: { providerKey: i, templateKey: o, overrideData: a }, actorId: r, tenantId: n }), e.json({ override: p }, 201);
  } catch {
    return e.json({ error: "Failed to create override" }, 500);
  }
});
ie$1.put("/templates/overrides/:overrideId", Ue, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("overrideId"), i = await e.req.json().catch(() => null);
  if (!i || typeof i != "object") return e.json({ error: "Invalid JSON in request body" }, 400);
  const o = /* @__PURE__ */ new Set(["overrideData", "appliesToDomains"]), a = Object.keys(i).filter((d) => !o.has(d));
  if (a.length > 0) return e.json({ error: `Unsupported override fields: ${a.join(", ")}` }, 400);
  const u = {};
  if ("overrideData" in i) {
    if (!i.overrideData || typeof i.overrideData != "object" || Array.isArray(i.overrideData)) return e.json({ error: "overrideData must be an object" }, 400);
    u.overrideData = i.overrideData;
  }
  if ("appliesToDomains" in i) {
    if (!Array.isArray(i.appliesToDomains) || !i.appliesToDomains.every((d) => typeof d == "string")) return e.json({ error: "appliesToDomains must be an array of strings" }, 400);
    u.appliesToDomains = i.appliesToDomains;
  }
  if (Object.keys(u).length === 0) return e.json({ error: "At least one editable override field is required" }, 400);
  try {
    const d = new _t$1(t), c = new ee(t), p = await d.findById(s);
    if (!p || p.tenantId !== n) return e.json({ error: "Override not found" }, 404);
    const l = await d.update(s, u);
    return l ? (await c.create({ action: "template_override_updated", entityType: "template_override", entityId: s, previousValue: { overrideData: p.overrideData }, newValue: { overrideData: l.overrideData }, actorId: r, tenantId: n }), e.json({ override: l })) : e.json({ error: "Override not found" }, 404);
  } catch {
    return e.json({ error: "Failed to update override" }, 500);
  }
});
ie$1.delete("/templates/overrides/:overrideId", Ue, async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.get("actorId");
  if (!n || !r) return e.json({ error: "Authenticated tenant and actor required" }, 401);
  const s = e.req.param("overrideId");
  try {
    const i = new _t$1(t), o = new ee(t), a = await i.findById(s);
    return !a || a.tenantId !== n ? e.json({ error: "Override not found" }, 404) : (await i.delete(s), await o.create({ action: "template_override_deleted", entityType: "template_override", entityId: s, previousValue: { providerKey: a.providerKey, templateKey: a.templateKey }, actorId: r, tenantId: n }), e.json({ success: true }));
  } catch {
    return e.json({ error: "Failed to delete override" }, 500);
  }
});
ie$1.get("/audit", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Authenticated tenant context required" }, 401);
  const r = parseInt(e.req.query("limit") || "50", 10);
  try {
    const i = await new ee(t).findByTenant(n, r);
    return e.json({ events: i });
  } catch {
    return e.json({ error: "Failed to fetch audit log" }, 500);
  }
});
const at$1 = new Hono();
at$1.use("*", $);
at$1.get("/providers", async (e) => {
  try {
    const t = gt$1.getAllTemplates();
    return e.json({ providers: t.map((n) => {
      var _a2, _b, _c2, _d2;
      return { id: n.id, provider: n.provider, name: n.name, description: n.description, version: n.version, knownSelectors: n.knownSelectors, expected: { mx: ((_a2 = n.expected.mx) == null ? void 0 : _a2.length) || 0, spf: ((_b = n.expected.spf) == null ? void 0 : _b.required) || false, dmarc: ((_c2 = n.expected.dmarc) == null ? void 0 : _c2.required) || false, dkim: ((_d2 = n.expected.dkim) == null ? void 0 : _d2.required) || false } };
    }) });
  } catch (t) {
    return P().error("Provider list error:", t instanceof Error ? t : new Error(String(t)), { requestId: e.req.header("X-Request-ID"), path: "/api/provider-templates", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to list provider templates", message: t instanceof Error ? t.message : "Unknown error" }, 500);
  }
});
at$1.get("/providers/:provider", async (e) => {
  const t = e.req.param("provider");
  try {
    const n = gt$1.getTemplate(t);
    return n ? e.json({ template: { id: n.id, provider: n.provider, name: n.name, description: n.description, version: n.version, knownSelectors: n.knownSelectors, expected: n.expected, detection: { mxPatterns: n.detection.mxPatterns.map((r) => r.source), spfPatterns: n.detection.spfPatterns.map((r) => r.source) } } }) : e.json({ error: "Provider template not found", availableProviders: Object.keys(je) }, 404);
  } catch (n) {
    return P().error("Provider get error:", n instanceof Error ? n : new Error(String(n)), { requestId: e.req.header("X-Request-ID"), path: "/api/provider-templates/:provider", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get provider template", message: n instanceof Error ? n.message : "Unknown error" }, 500);
  }
});
at$1.post("/compare-to-provider", async (e) => {
  const t = e.get("db"), n = await e.req.json().catch(() => ({})), { snapshotId: r, provider: s } = n;
  if (!r) return e.json({ error: "Missing required field: snapshotId" }, 400);
  try {
    const i = new se$1(t), o = new xt$1(t), a = await i.findById(r);
    if (!a) return e.json({ error: "Snapshot not found" }, 404);
    const u = await o.findBySnapshotId(r), d = Cd(u);
    let c = s;
    c || (c = Wt$1(d.mx || [], d.spf || void 0).provider);
    const p = gt$1.getTemplate(c);
    if (!p) return e.json({ error: "Provider template not found", requestedProvider: c, availableProviders: Object.keys(je) }, 404);
    const l = _d(c, d);
    return e.json({ domain: a.domainName, snapshotId: r, provider: c, providerName: p.name, detectionConfidence: s ? void 0 : Wt$1(d.mx || [], d.spf).confidence, comparison: { overallMatch: l.overallMatch, matches: l.matches, mismatches: l.mismatches, missing: l.missing }, actual: d, expected: { mx: p.expected.mx, spf: p.expected.spf, dkim: p.expected.dkim, dmarc: p.expected.dmarc } });
  } catch (i) {
    return P().error("Provider comparison error:", i instanceof Error ? i : new Error(String(i)), { requestId: e.req.header("X-Request-ID"), path: "/api/provider-templates/compare", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to compare to provider template", message: i instanceof Error ? i.message : "Unknown error" }, 500);
  }
});
at$1.post("/detect-provider", async (e) => {
  const t = await e.req.json().catch(() => ({})), { mxRecords: n, spfRecord: r } = t;
  if (!n || !Array.isArray(n)) return e.json({ error: "Missing required field: mxRecords (array)" }, 400);
  try {
    const s = Wt$1(n, r);
    return e.json({ detection: { provider: s.provider, confidence: s.confidence, evidence: s.evidence }, template: s.provider !== "unknown" ? { name: je[s.provider].name, knownSelectors: je[s.provider].knownSelectors } : null });
  } catch (s) {
    return P().error("Provider detection error:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/provider-templates/detect", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to detect provider", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
at$1.post("/providers/:provider/selectors", Ue, async (e) => {
  var _a2;
  const t = e.req.param("provider"), n = await e.req.json().catch(() => ({})), { selector: r } = n;
  if (!r || typeof r != "string") return e.json({ error: "Missing required field: selector (string)" }, 400);
  try {
    return gt$1.getTemplate(t) ? (gt$1.addCustomSelector(t, r), e.json({ message: `Selector "${r}" added to ${t}`, provider: t, knownSelectors: (_a2 = gt$1.getTemplate(t)) == null ? void 0 : _a2.knownSelectors })) : e.json({ error: "Provider template not found" }, 404);
  } catch (s) {
    return P().error("Add selector error:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/provider-templates/:provider/selectors", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to add selector", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
function Cd(e) {
  const t = {};
  for (const n of e) {
    if (n.type === "MX" && (t.mx = n.values), n.type === "TXT") {
      const r = n.values.find((s) => s.includes("v=spf1"));
      r && (t.spf = r);
    }
    if (n.type === "TXT" && n.name.includes("_dmarc")) {
      const r = n.values.find((s) => s.includes("v=DMARC1"));
      r && (t.dmarc = r);
    }
    if (n.type === "TXT" && n.name.includes("._domainkey.")) {
      const r = n.name.split("._domainkey.")[0];
      t.dkimSelectors || (t.dkimSelectors = []), t.dkimSelectors.includes(r) || t.dkimSelectors.push(r);
    }
  }
  return t;
}
const Ls = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, kd = new Hono().get("/", $, async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const n = Math.min(parseInt(e.req.query("limit") || "20", 10), 100), r = parseInt(e.req.query("offset") || "0", 10), s = new xe$1(t), [i, o] = await Promise.all([s.list(n, r), s.count()]);
    return e.json({ versions: i, pagination: { limit: n, offset: r, total: o, hasMore: r + i.length < o } });
  } catch (n) {
    return P().error("Error listing ruleset versions:", n instanceof Error ? n : new Error(String(n)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to list ruleset versions", message: n instanceof Error ? n.message : "Unknown error" }, 500);
  }
}).get("/active", $, async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const r = await new xe$1(t).findActive();
    return r ? e.json(r) : e.json({ error: "No active ruleset version found" }, 404);
  } catch (n) {
    return P().error("Error fetching active ruleset version:", n instanceof Error ? n : new Error(String(n)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions/active", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch active ruleset version", message: n instanceof Error ? n.message : "Unknown error" }, 500);
  }
}).get("/latest", $, async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  try {
    const r = await new xe$1(t).findLatest();
    return r ? e.json(r) : e.json({ error: "No ruleset versions found" }, 404);
  } catch (n) {
    return P().error("Error fetching latest ruleset version:", n instanceof Error ? n : new Error(String(n)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions/latest", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch latest ruleset version", message: n instanceof Error ? n.message : "Unknown error" }, 500);
  }
}).get("/by-version/:version", $, async (e) => {
  const t = e.req.param("version"), n = e.get("db");
  if (!n) return e.json({ error: "Database not available" }, 503);
  try {
    const s = await new xe$1(n).findByVersion(t);
    return s ? e.json(s) : e.json({ error: "Ruleset version not found" }, 404);
  } catch (r) {
    return P().error("Error fetching ruleset version:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions/:id", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch ruleset version", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
}).get("/:id", $, async (e) => {
  const t = e.req.param("id");
  if (!Ls.test(t)) return e.json({ error: "Invalid ruleset version ID" }, 400);
  const n = e.get("db");
  if (!n) return e.json({ error: "Database not available" }, 503);
  try {
    const s = await new xe$1(n).findById(t);
    return s ? e.json(s) : e.json({ error: "Ruleset version not found" }, 404);
  } catch (r) {
    return P().error("Error fetching ruleset version:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions/:id", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch ruleset version", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
}).post("/:id/activate", $, G, async (e) => {
  const t = e.req.param("id");
  if (!Ls.test(t)) return e.json({ error: "Invalid ruleset version ID" }, 400);
  const n = e.get("db");
  if (!n) return e.json({ error: "Database not available" }, 503);
  try {
    const s = await new xe$1(n).setActive(t);
    return s ? e.json({ success: true, message: `Ruleset version ${s.version} is now active`, rulesetVersion: s }) : e.json({ error: "Ruleset version not found" }, 404);
  } catch (r) {
    return P().error("Error activating ruleset version:", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/ruleset-versions/:id/activate", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to activate ruleset version", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
}), vr = new Hono();
vr.get("/snapshot/:snapshotId/selectors", $, async (e) => {
  const t = e.req.param("snapshotId"), n = e.get("db");
  try {
    const r = new se$1(n), s = new ji(n);
    if (!await r.findById(t)) return e.json({ error: "Snapshot not found" }, 404);
    const o = await s.findBySnapshotId(t);
    if (o.length > 0) {
      const p = o.map((l) => ({ selector: l.selector, found: l.found, provenance: l.provenance, confidence: l.confidence, provider: l.provider || void 0, queryName: `${l.selector}._domainkey.${l.domain}`, recordData: l.recordData || void 0, isValid: l.isValid, validationError: l.validationError || void 0 }));
      return e.json({ snapshotId: t, selectors: p, count: p.length, found: p.filter((l) => l.found).length, source: "persisted" });
    }
    const d = (await new Le(n).findBySnapshotId(t)).filter((p) => p.queryType === "TXT" && p.queryName.includes("_domainkey"));
    if (d.length === 0) return e.json({ snapshotId: t, selectors: [], message: "No DKIM selectors discovered for this snapshot", discoveryMethod: "none" });
    const c = d.map((p) => {
      const l = p.queryName.match(/^([^.]+)\._domainkey\./);
      return { selector: l ? l[1] : "unknown", found: p.status === "success" && p.answerSection && p.answerSection.length > 0, provenance: "unknown", confidence: "heuristic", queryName: p.queryName, status: p.status };
    });
    return e.json({ snapshotId: t, selectors: c, count: c.length, found: c.filter((p) => p.found).length, source: "inferred" });
  } catch (r) {
    return P().error("Error fetching selectors", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/selectors", method: "GET", tenantId: e.get("tenantId"), snapshotId: e.req.param("snapshotId") }), e.json({ error: "Failed to fetch selectors", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
vr.get("/domain/:domain/selectors/suggest", $, async (e) => {
  var _a2, _b, _c2;
  const t = e.req.param("domain"), n = e.get("db");
  try {
    const r = new te(n), s = new se$1(n), i = new Le(n), o = await r.findByName(t);
    if (!o) return e.json({ error: "No data for domain" }, 404);
    const a = await s.findByDomain(o.id, 1);
    if (a.length === 0) return e.json({ error: "No snapshots for domain" }, 404);
    const d = (await i.findBySnapshotId(a[0].id)).find((f) => f.queryType === "MX");
    let c = null, p = [];
    const l = (_c2 = (_b = (_a2 = d == null ? void 0 : d.answerSection) == null ? void 0 : _a2[0]) == null ? void 0 : _b.data) == null ? void 0 : _c2.toLowerCase();
    return l && (l.includes("google") ? (c = "google-workspace", p = ["google", "20210112"]) : (l.includes("outlook") || l.includes("microsoft")) && (c = "microsoft-365", p = ["selector1", "selector2"])), e.json({ domain: t, provider: c, suggestedSelectors: p, message: c ? `Detected ${c} - suggested selectors based on provider templates` : "No provider detected - try common selectors" });
  } catch (r) {
    return e.json({ error: "Failed to suggest selectors", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
const we$1 = new Hono();
we$1.use("*", $);
we$1.post("/compare", async (e) => {
  const t = e.get("db"), n = await e.req.json().catch(() => ({})), { snapshotId: r, legacyOutput: s } = n;
  if (!r || !s) return e.json({ error: "Missing required fields", required: ["snapshotId", "legacyOutput"] }, 400);
  try {
    const i = Md(s);
    if (!i.valid || !i.data) return e.json({ error: "Invalid legacy output format", details: i.errors }, 400);
    const o = new se$1(t), a = new rt(t), u = new nn(t), d = await o.findById(r);
    if (!d) return e.json({ error: "Snapshot not found" }, 404);
    const c = e.get("tenantId");
    if (c) {
      const { DomainRepository: y } = await import('../build/index-BHdYYgJK.mjs'), m = await new y(t).findById(d.domainId);
      if (!m || m.tenantId && m.tenantId !== c) return e.json({ error: "Snapshot not found" }, 404);
    }
    const p = await t.selectWhere(X, eq(X.snapshotId, r));
    await u.log({ toolType: "dmarc-check", domain: d.domainName, requestSource: "api", responseStatus: "success", outputSummary: { dmarcPresent: i.data.dmarc.present, dmarcValid: i.data.dmarc.valid, spfPresent: i.data.spf.present, spfValid: i.data.spf.valid, dkimPresent: i.data.dkim.present, dkimValid: i.data.dkim.valid }, snapshotId: r });
    const l = { ...i.data, checkedAt: typeof i.data.checkedAt == "string" ? new Date(i.data.checkedAt) : i.data.checkedAt }, f = Id.compare(r, d.domainName, p, l), h = await a.create({ snapshotId: r, domain: d.domainName, comparedAt: /* @__PURE__ */ new Date(), status: f.status, comparisons: f.comparisons, metrics: f.metrics, summary: f.summary, legacyOutput: i.data, tenantId: c || void 0 });
    return Ke().shadow.comparisonRun({ domain: d.domainName, hadMismatch: f.status !== "match", mismatchTypes: f.status !== "match" ? f.comparisons.filter((y) => y.status === "mismatch").map((y) => y.field) : void 0 }), e.json({ comparison: h, summary: f.summary, status: f.status, metrics: f.metrics, persisted: true });
  } catch (i) {
    return P().error("Shadow comparison error", i instanceof Error ? i : new Error(String(i)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/compare", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to perform shadow comparison", message: i instanceof Error ? i.message : "Unknown error" }, 500);
  }
});
we$1.get("/stats", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  try {
    const r = new rt(t), s = await r.getStats(n), i = await r.findPendingAdjudications(n);
    return e.json({ stats: s, pendingAdjudication: i.length, recentMismatches: i.slice(0, 10).map((o) => ({ id: o.id, domain: o.domain, status: o.status, summary: o.summary, comparedAt: o.comparedAt })), durable: true });
  } catch (r) {
    return P().error("Shadow stats error", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/stats", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get shadow comparison statistics", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
we$1.get("/domain/:domain", async (e) => {
  const t = e.req.param("domain"), n = e.get("db"), r = e.get("tenantId");
  try {
    const i = await new rt(n).findByDomain(t, r);
    return e.json({ domain: t, count: i.length, comparisons: i.map((o) => ({ id: o.id, status: o.status, summary: o.summary, comparedAt: o.comparedAt, adjudication: o.adjudication })) });
  } catch (s) {
    return P().error("Shadow domain lookup error", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/domain/:domain", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get domain comparisons", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
we$1.get("/legacy-logs", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = Number.parseInt(e.req.query("limit") || "50", 10);
  try {
    const s = new nn(t), i = await s.getRecent(r, n), o = await s.getStats(n);
    return e.json({ logs: i.map((a) => ({ id: a.id, toolType: a.toolType, domain: a.domain, requestedAt: a.requestedAt, responseStatus: a.responseStatus, outputSummary: a.outputSummary })), stats: o });
  } catch (s) {
    return P().error("Legacy logs error", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/legacy-logs", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get legacy access logs", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
function Qi(e, t, n) {
  const r = { ...e }, s = [];
  for (const i of t) {
    if (n && i.appliesToDomains && i.appliesToDomains.length > 0 && !i.appliesToDomains.includes(n)) continue;
    const o = i.overrideData;
    o.dkimSelectors && Array.isArray(o.dkimSelectors) && (r.dkimSelectors = o.dkimSelectors), o.mxPatterns && Array.isArray(o.mxPatterns) && (r.mxPatterns = o.mxPatterns), o.spfIncludes && Array.isArray(o.spfIncludes) && (r.spfIncludes = o.spfIncludes), o.baseline && typeof o.baseline == "object" && (r.baseline = { ...r.baseline, ...o.baseline }), s.push(i.id);
  }
  return { ...r, overridesApplied: s };
}
we$1.get("/provider-baselines", async (e) => {
  const t = e.get("db"), n = e.get("tenantId"), r = e.req.query("domainName");
  try {
    const s = new mr(t), i = new _t$1(t), o = await s.findActive(), a = await Promise.all(o.map(async (u) => {
      const d = await i.findByProvider(u.providerKey, n), c = Qi(u, d, r);
      return { providerKey: c.providerKey, providerName: c.providerName, baseline: c.baseline, dkimSelectors: c.dkimSelectors, mxPatterns: c.mxPatterns, spfIncludes: c.spfIncludes, version: c.version, overridesApplied: c.overridesApplied };
    }));
    return e.json({ baselines: a, overridesActive: a.some((u) => u.overridesApplied.length > 0) });
  } catch (s) {
    return P().error("Provider baselines error", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/provider-baselines", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get provider baselines", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
we$1.get("/provider-baselines/:providerKey", async (e) => {
  const t = e.req.param("providerKey"), n = e.get("db"), r = e.get("tenantId"), s = e.req.query("domainName");
  try {
    const i = new mr(n), o = new _t$1(n), a = await i.findByProviderKey(t);
    if (!a) return e.json({ error: "Provider baseline not found" }, 404);
    const u = await o.findByProvider(t, r), d = Qi(a, u, s);
    return e.json({ baseline: d, overridesApplied: d.overridesApplied });
  } catch (i) {
    return P().error("Provider baseline error", i instanceof Error ? i : new Error(String(i)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/provider-baselines/:providerKey", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get provider baseline", message: i instanceof Error ? i.message : "Unknown error" }, 500);
  }
});
we$1.post("/mismatch-report", Ue, async (e) => {
  const t = e.get("db"), n = await e.req.json().catch(() => ({})), { domain: r, periodStart: s, periodEnd: i, generatedBy: o } = n;
  if (!r) return e.json({ error: "Domain is required" }, 400);
  try {
    const a = new rt(t), u = new Li(t), d = s ? new Date(s) : new Date(Date.now() - 720 * 60 * 60 * 1e3), c = i ? new Date(i) : /* @__PURE__ */ new Date(), p = await u.generateReport(a, r, d, c, o || "system");
    return e.json({ report: p, message: p.cutoverReady ? "Domain is ready for cutover" : "Domain does not meet cutover threshold" });
  } catch (a) {
    return P().error("Mismatch report error", a instanceof Error ? a : new Error(String(a)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/mismatch-report", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to generate mismatch report", message: a instanceof Error ? a.message : "Unknown error" }, 500);
  }
});
we$1.get("/mismatch-reports/:domain", async (e) => {
  const t = e.req.param("domain"), n = e.get("db"), r = e.get("tenantId");
  try {
    const i = await new Li(n).findByDomain(t, r), o = i[0];
    return e.json({ domain: t, reports: i.map((a) => ({ id: a.id, periodStart: a.periodStart, periodEnd: a.periodEnd, matchRate: a.matchRate, cutoverReady: a.cutoverReady, generatedAt: a.generatedAt })), latestReport: o ? { matchRate: o.matchRate, cutoverReady: o.cutoverReady, totalComparisons: o.totalComparisons, mismatchBreakdown: o.mismatchBreakdown, cutoverNotes: o.cutoverNotes } : null });
  } catch (s) {
    return P().error("Mismatch reports error", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/mismatch-reports/:domain", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get mismatch reports", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
we$1.post("/seed-baselines", Ue, async (e) => {
  const t = e.get("db");
  try {
    const n = new mr(t);
    await n.seedDefaults();
    const r = await n.findAll();
    return e.json({ message: "Provider baselines seeded", count: r.length, providers: r.map((s) => s.providerKey) });
  } catch (n) {
    return P().error("Seed baselines error", n instanceof Error ? n : new Error(String(n)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/seed-baselines", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to seed provider baselines", message: n instanceof Error ? n.message : "Unknown error" }, 500);
  }
});
we$1.get("/:id", async (e) => {
  const t = e.req.param("id"), n = e.get("db"), r = e.get("tenantId");
  try {
    const i = await new rt(n).findById(t, r);
    return i ? e.json({ comparison: i }) : e.json({ error: "Comparison not found" }, 404);
  } catch (s) {
    return P().error("Shadow comparison get error", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/:id", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to get shadow comparison", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
we$1.post("/:id/adjudicate", Ue, async (e) => {
  const t = e.req.param("id"), n = e.get("db"), r = e.get("tenantId"), s = await e.req.json().catch(() => ({})), { adjudication: i, notes: o, operator: a } = s, u = ["new-correct", "legacy-correct", "both-wrong", "acceptable-difference"];
  if (!i || !u.includes(i)) return e.json({ error: "Invalid adjudication", validOptions: u }, 400);
  try {
    const d = new rt(n);
    if (!await d.findById(t, r)) return e.json({ error: "Comparison not found" }, 404);
    const p = await d.adjudicate(t, a || "unknown", i, o);
    return p ? (Ke().shadow.adjudicated({ comparisonId: t, verdict: i === "new-correct" ? "accept-new" : i === "legacy-correct" ? "keep-legacy" : "investigate", reason: o }), e.json({ message: "Adjudication recorded and persisted", comparison: p })) : e.json({ error: "Comparison not found" }, 404);
  } catch (d) {
    return P().error("Shadow adjudication error", d instanceof Error ? d : new Error(String(d)), { requestId: e.req.header("X-Request-ID"), path: "/api/shadow-comparison/:id/adjudicate", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to adjudicate shadow comparison", message: d instanceof Error ? d.message : "Unknown error" }, 500);
  }
});
function Md(e) {
  const t = [];
  if (!e || typeof e != "object") return { valid: false, errors: ["Legacy output must be an object"] };
  const n = e;
  return (!n.domain || typeof n.domain != "string") && t.push("domain is required and must be a string"), (!n.dmarc || typeof n.dmarc != "object") && t.push("dmarc is required and must be an object"), (!n.spf || typeof n.spf != "object") && t.push("spf is required and must be an object"), (!n.dkim || typeof n.dkim != "object") && t.push("dkim is required and must be an object"), t.length > 0 ? { valid: false, errors: t } : { valid: true, data: e };
}
const Ir = new Hono();
Ir.post("/", $, async (e) => {
  const t = e.get("db"), n = await e.req.json();
  try {
    const r = new se$1(t), s = new te(t), i = new Le(t), o = new xt$1(t), a = new Ve(t);
    let u, d = n.findingTypes;
    if (n.findingId) {
      const A = await a.findById(n.findingId);
      if (!A) return e.json({ error: "Finding not found" }, 404);
      u = A.snapshotId, d = [A.type];
    } else if (n.snapshotId) u = n.snapshotId;
    else return e.json({ error: "Either snapshotId or findingId is required" }, 400);
    const c = await r.findById(u);
    if (!c) return e.json({ error: "Snapshot not found" }, 404);
    const p = await s.findById(c.domainId);
    if (!p) return e.json({ error: "Domain not found" }, 404);
    const l = e.get("tenantId");
    if (p.tenantId && p.tenantId !== l) return e.json({ error: "Snapshot not found" }, 404);
    if (!l && p.tenantId) return e.json({ error: "Snapshot not found" }, 404);
    const f = await i.findBySnapshotId(u), h = await o.findBySnapshotId(u), y = await a.findBySnapshotId(u), v = jt$1(), m = { snapshotId: u, domainId: p.id, domainName: p.name, zoneManagement: c.zoneManagement, observations: f, recordSets: h, rulesetVersion: v.version }, S = new Sd(v).simulate(m, y.map((A) => ({ type: A.type, title: A.title, severity: A.severity, ruleId: A.ruleId })), d);
    return e.json(S);
  } catch (r) {
    return P().error("Simulation error", r instanceof Error ? r : new Error(String(r)), { requestId: e.req.header("X-Request-ID"), path: "/api/simulate", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Simulation failed", message: r instanceof Error ? r.message : "Unknown error" }, 500);
  }
});
Ir.get("/actionable-types", $, (e) => e.json({ actionableTypes: [{ type: "mail.no-spf-record", description: "Missing SPF record", risk: "low" }, { type: "mail.no-dmarc-record", description: "Missing DMARC record", risk: "low" }, { type: "mail.no-mx-record", description: "Missing MX record", risk: "medium" }, { type: "mail.no-mta-sts", description: "Missing MTA-STS record", risk: "low" }, { type: "mail.no-tls-rpt", description: "Missing TLS-RPT record", risk: "low" }, { type: "mail.no-dkim-queried", description: "No DKIM selectors discovered", risk: "low" }, { type: "mail.spf-malformed", description: "Malformed SPF record", risk: "medium" }, { type: "dns.cname-coexistence-conflict", description: "CNAME coexistence violation", risk: "high" }] }));
const dt$1 = new Hono();
dt$1.use("*", $);
async function Pt$1(e, t, n) {
  var _a2;
  return (_a2 = await new te(e).findByNameForTenant(t, n)) != null ? _a2 : null;
}
dt$1.get("/:domain", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = e.req.param("domain"), s = Math.min(100, Math.max(1, parseInt(e.req.query("limit") || "20", 10) || 20)), i = Math.max(0, parseInt(e.req.query("offset") || "0", 10) || 0);
  try {
    const o = await Pt$1(t, r, n);
    if (!o) return e.json({ error: "Domain not found" }, 404);
    const d = (await new se$1(t).findByDomain(o.id, s + i)).slice(i, i + s);
    return e.json({ domain: r, count: d.length, snapshots: d.map((c) => ({ id: c.id, createdAt: c.createdAt, rulesetVersionId: c.rulesetVersionId, findingsEvaluated: c.rulesetVersionId !== null, queryScope: { names: c.queriedNames, types: c.queriedTypes, vantages: c.vantages } })) });
  } catch (o) {
    return P().error("Snapshot list error:", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch snapshots", message: o instanceof Error ? o.message : "Unknown error" }, 500);
  }
});
dt$1.get("/:domain/latest", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = e.req.param("domain");
  try {
    const s = await Pt$1(t, r, n);
    if (!s) return e.json({ error: "Domain not found" }, 404);
    const o = await new se$1(t).findByDomain(s.id, 1);
    if (o.length === 0) return e.json({ error: "No snapshots found for domain" }, 404);
    const a = o[0];
    return e.json({ id: a.id, domain: r, createdAt: a.createdAt, rulesetVersionId: a.rulesetVersionId, findingsEvaluated: a.rulesetVersionId !== null, queryScope: { names: a.queriedNames, types: a.queriedTypes, vantages: a.vantages } });
  } catch (s) {
    return P().error("Latest snapshot error:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/latest", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch latest snapshot", message: s instanceof Error ? s.message : "Unknown error" }, 500);
  }
});
dt$1.get("/:domain/:id", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = e.req.param("domain"), s = e.req.param("id");
  try {
    const i = await Pt$1(t, r, n);
    if (!i) return e.json({ error: "Domain not found" }, 404);
    const a = await new se$1(t).findById(s);
    return a ? a.domainId !== i.id ? e.json({ error: "Snapshot not found" }, 404) : e.json({ id: a.id, domainId: a.domainId, createdAt: a.createdAt, rulesetVersionId: a.rulesetVersionId, findingsEvaluated: a.rulesetVersionId !== null, queryScope: { names: a.queriedNames, types: a.queriedTypes, vantages: a.vantages }, metadata: a.metadata }) : e.json({ error: "Snapshot not found" }, 404);
  } catch (i) {
    return P().error("Snapshot detail error:", i instanceof Error ? i : new Error(String(i)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:id", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Failed to fetch snapshot", message: i instanceof Error ? i.message : "Unknown error" }, 500);
  }
});
dt$1.post("/:domain/diff", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = e.req.param("domain"), s = await e.req.json().catch(() => ({})), { snapshotA: i, snapshotB: o } = s;
  if (!i || !o) return e.json({ error: "Both snapshotA and snapshotB IDs are required", example: { snapshotA: "snap-123", snapshotB: "snap-456" } }, 400);
  try {
    const a = await Pt$1(t, r, n);
    if (!a) return e.json({ error: "Domain not found" }, 404);
    const u = new se$1(t), [d, c] = await Promise.all([u.findById(i), u.findById(o)]);
    if (!d) return e.json({ error: `Snapshot ${i} not found` }, 404);
    if (!c) return e.json({ error: `Snapshot ${o} not found` }, 404);
    if (d.domainId !== a.id || c.domainId !== a.id) return e.json({ error: "Snapshot not found" }, 404);
    const [p, l, f, h] = await Promise.all([t.selectWhere(de, eq(de.snapshotId, i)), t.selectWhere(de, eq(de.snapshotId, o)), t.selectWhere(X, eq(X.snapshotId, i)), t.selectWhere(X, eq(X.snapshotId, o))]), y = d.rulesetVersionId !== null, v = c.rulesetVersionId !== null, m = Bi({ id: d.id, createdAt: d.createdAt, rulesetVersion: String(d.rulesetVersionId || "unknown"), queriedNames: d.queriedNames, queriedTypes: d.queriedTypes, vantages: d.vantages }, { id: c.id, createdAt: c.createdAt, rulesetVersion: String(c.rulesetVersionId || "unknown"), queriedNames: c.queriedNames, queriedTypes: c.queriedTypes, vantages: c.vantages }, p, l, y ? f : [], v ? h : []), w = [];
    return m.comparison.scopeChanges && w.push("Query scope differs between snapshots. Some changes may reflect scope differences rather than actual DNS changes."), (!y || !v) && w.push(`Findings comparison incomplete: ${!y && !v ? "neither snapshot has been evaluated" : y ? "snapshot B has not been evaluated" : "snapshot A has not been evaluated"}. Re-evaluate old snapshots via POST /api/snapshot/:id/evaluate to see finding changes.`), n && Oi({ tenantId: n, domain: r, snapshotIds: [i, o], changeCount: m.comparison.recordChanges.length + m.comparison.findingChanges.length, diffType: "full" }), e.json({ domain: r, diff: m, findingsEvaluated: { snapshotA: y, snapshotB: v }, warnings: w.length > 0 ? w : void 0, ambiguityWarning: m.comparison.scopeChanges ? "Query scope differs between snapshots. Some changes may reflect scope differences rather than actual DNS changes." : void 0 });
  } catch (a) {
    return P().error("Snapshot diff error:", a instanceof Error ? a : new Error(String(a)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:domain/diff", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to compare snapshots" }, 500);
  }
});
dt$1.post("/:domain/compare-latest", async (e) => {
  const t = e.get("db"), n = e.get("tenantId");
  if (!n) return e.json({ error: "Unauthorized" }, 401);
  const r = e.req.param("domain");
  try {
    const s = await Pt$1(t, r, n);
    if (!s) return e.json({ error: "Domain not found" }, 404);
    const o = await new se$1(t).findByDomain(s.id, 2);
    if (o.length < 2) return e.json({ error: "Need at least 2 snapshots to compare", availableSnapshots: o.length }, 400);
    const [a, u] = o, [d, c, p, l] = await Promise.all([t.selectWhere(de, eq(de.snapshotId, u.id)), t.selectWhere(de, eq(de.snapshotId, a.id)), t.selectWhere(X, eq(X.snapshotId, u.id)), t.selectWhere(X, eq(X.snapshotId, a.id))]), f = u.rulesetVersionId !== null, h = a.rulesetVersionId !== null, y = Bi({ id: u.id, createdAt: u.createdAt, rulesetVersion: String(u.rulesetVersionId || "unknown"), queriedNames: u.queriedNames, queriedTypes: u.queriedTypes, vantages: u.vantages }, { id: a.id, createdAt: a.createdAt, rulesetVersion: String(a.rulesetVersionId || "unknown"), queriedNames: a.queriedNames, queriedTypes: a.queriedTypes, vantages: a.vantages }, d, c, f ? p : [], h ? l : []), v = [];
    return (!f || !h) && v.push(`Findings comparison incomplete: ${!f && !h ? "neither snapshot has been evaluated" : f ? "newer snapshot has not been evaluated" : "older snapshot has not been evaluated"}. Re-evaluate via POST /api/snapshot/:id/evaluate.`), n && Oi({ tenantId: n, domain: r, snapshotIds: [u.id, a.id], changeCount: y.comparison.recordChanges.length + y.comparison.findingChanges.length, diffType: "full" }), e.json({ diff: y, findingsEvaluated: { older: f, newer: h }, warnings: v.length > 0 ? v : void 0 });
  } catch (s) {
    return P().error("Snapshot compare-latest error:", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshots/:domain/compare-latest", method: "POST", tenantId: e.get("tenantId") }), e.json({ error: "Failed to compare snapshots" }, 500);
  }
});
const Ot$1 = new Hono();
Ot$1.use("*", $);
const xd = { confirmApply: Vi("confirmApply", false) };
Ot$1.patch("/:suggestionId/apply", G, async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  const n = e.req.param("suggestionId"), r = e.get("actorId");
  if (!r) return e.json({ error: "Unauthorized" }, 401);
  const s = await Se$1(e, xd), i = s.success ? s.data.confirmApply : void 0, o = new St$1(t), a = await o.findById(n);
  if (!a) return e.json({ error: "Suggestion not found", code: "NOT_FOUND", suggestionId: n }, 404);
  if (a.appliedAt) return e.json({ error: "Suggestion already applied", code: "ALREADY_APPLIED", suggestionId: n, appliedAt: a.appliedAt, appliedBy: a.appliedBy }, 409);
  if (a.dismissedAt) return e.json({ error: "Suggestion was dismissed", code: "DISMISSED", suggestionId: n, dismissedAt: a.dismissedAt }, 409);
  if (a.reviewOnly && !i) return e.json({ error: "This suggestion is marked as review-only and requires explicit confirmation", code: "REQUIRES_CONFIRMATION", suggestionId: n, reviewOnly: true, hint: 'Include { "confirmApply": true } in the request body to apply this suggestion' }, 403);
  const u = await o.markApplied(n, r);
  return u ? e.json({ success: true, suggestion: u, confirmed: a.reviewOnly && i }) : e.json({ error: "Failed to apply suggestion", suggestionId: n }, 500);
});
Ot$1.patch("/:suggestionId/dismiss", G, async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  const n = e.req.param("suggestionId"), r = e.get("actorId");
  if (!r) return e.json({ error: "Unauthorized" }, 401);
  let s;
  try {
    s = (await e.req.json()).reason;
  } catch {
  }
  const i = new St$1(t), o = await i.findById(n);
  if (!o) return e.json({ error: "Suggestion not found", code: "NOT_FOUND", suggestionId: n }, 404);
  if (o.dismissedAt) return e.json({ error: "Suggestion already dismissed", code: "ALREADY_DISMISSED", suggestionId: n }, 409);
  if (o.appliedAt) return e.json({ error: "Suggestion was already applied", code: "ALREADY_APPLIED", suggestionId: n }, 409);
  const a = await i.markDismissed(n, r, s);
  return a ? e.json({ success: true, suggestion: a }) : e.json({ error: "Failed to dismiss suggestion", suggestionId: n }, 500);
});
Ot$1.get("/:suggestionId", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  const n = e.req.param("suggestionId"), s = await new St$1(t).findById(n);
  return s ? e.json({ suggestion: s }) : e.json({ error: "Suggestion not found", code: "NOT_FOUND", suggestionId: n }, 404);
});
const Ps = Date.now(), Z = new Hono();
async function Ki(e, t, n) {
  const r = new se$1(e), s = new te(e), i = await r.findById(t);
  if (!i) return null;
  const o = await s.findById(i.domainId);
  return !o || o.tenantId && o.tenantId !== n || !n && o.tenantId ? null : { snapshot: i, domain: o };
}
Z.get("/health", (e) => {
  const n = !!e.get("db");
  return e.json({ status: n ? "healthy" : "degraded", service: "dns-ops-web", timestamp: (/* @__PURE__ */ new Date()).toISOString(), ...n ? {} : { warning: "Database connection not available - API functionality limited" } }, n ? 200 : 503);
});
Z.get("/health/detailed", Ue, async (e) => {
  const t = e.get("db");
  let n = "error", r = null;
  if (t) try {
    const c = Date.now();
    await t.select(z$1), r = Date.now() - c, n = "connected";
  } catch (c) {
    P().error("DB health check failed", c instanceof Error ? c : new Error(String(c)), { path: "/api/health/detailed", method: "GET" }), n = "error";
  }
  const s = et.getInfo(), i = Date.now() - Ps, o = Math.floor(i / 1e3), a = Math.floor(o / 60), u = Math.floor(a / 60), d = u > 0 ? `${u}h ${a % 60}m ${o % 60}s` : a > 0 ? `${a}m ${o % 60}s` : `${o}s`;
  return e.json({ status: n === "connected" ? "healthy" : "degraded", service: "dns-ops-web", version: process.env.npm_package_version || "1.0.0", uptime: { startedAt: new Date(Ps).toISOString(), seconds: o, formatted: d }, timestamp: (/* @__PURE__ */ new Date()).toISOString(), checks: { database: { status: n, latencyMs: r }, circuitBreaker: { state: s.state, consecutiveFailures: s.consecutiveFailures, lastFailureAt: s.lastFailureAt ? new Date(s.lastFailureAt).toISOString() : null } } });
});
Z.route("/", Pe);
Z.route("/", it$1);
Z.route("/", vr);
Z.route("/", At$1);
Z.route("/", qd);
Z.route("/shadow-comparison", we$1);
Z.route("/mail", at$1);
Z.route("/snapshots", dt$1);
Z.use("/migrate/*", Ue);
Z.route("/migrate", ot$1);
Z.route("/portfolio", ie$1);
Z.route("/ruleset-versions", kd);
Z.route("/monitoring", Ze);
Z.route("/alerts", Ne);
Z.route("/fleet-report", un);
Z.route("/simulate", Ir);
Z.route("/suggestions", Ot$1);
Z.get("/domain/:domain/latest", async (e) => {
  const t = e.get("tenantId"), n = e.get("db");
  if (!n) return e.json({ error: "Database not available" }, 503);
  const r = e.req.param("domain").toLowerCase(), s = new te(n), i = new se$1(n);
  try {
    const o = await s.findByName(r);
    if (!o) return e.json({ error: "Domain not found" }, 404);
    if (o.tenantId && o.tenantId !== t) return e.json({ error: "Domain not found" }, 404);
    if (!t && o.tenantId) return e.json({ error: "Domain not found" }, 404);
    const a = await i.findLatestByDomain(o.id);
    return a ? e.json(a) : e.json({ error: "No snapshots found" }, 404);
  } catch (o) {
    return P().error("Error fetching latest snapshot", o instanceof Error ? o : new Error(String(o)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:domain/latest", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Internal server error" }, 500);
  }
});
Z.get("/snapshot/:snapshotId/observations", async (e) => {
  const t = e.get("tenantId"), n = e.get("db"), r = e.req.param("snapshotId");
  if (!n) return e.json({ error: "Database not available" }, 503);
  try {
    const s = await Ki(n, r, t);
    if (!s) return e.json({ error: "Snapshot not found" }, 404);
    const o = await new Le(n).findBySnapshotId(s.snapshot.id);
    return e.json(o);
  } catch (s) {
    return P().error("Error fetching observations", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/observations", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Internal server error" }, 500);
  }
});
Z.get("/snapshot/:snapshotId/recordsets", async (e) => {
  const t = e.get("tenantId"), n = e.get("db"), r = e.req.param("snapshotId");
  if (!n) return e.json({ error: "Database not available" }, 503);
  try {
    const s = await Ki(n, r, t);
    if (!s) return e.json({ error: "Snapshot not found" }, 404);
    const o = await new xt$1(n).findBySnapshotId(s.snapshot.id);
    return e.json(o);
  } catch (s) {
    return P().error("Error fetching record sets", s instanceof Error ? s : new Error(String(s)), { requestId: e.req.header("X-Request-ID"), path: "/api/snapshot/:snapshotId/recordsets", method: "GET", tenantId: e.get("tenantId") }), e.json({ error: "Internal server error" }, 500);
  }
});
Z.post("/collect/domain", $, G, async (e) => {
  const t = await Se$1(e, { domain: Jn("domain"), zoneManagement: Ct$1("zoneManagement", ["managed", "unmanaged", "unknown"], false) });
  if (!t.success) return De(e, t.error);
  const { domain: n, zoneManagement: r = "unmanaged" } = t.data, s = e.get("actorId"), i = e.get("tenantId"), o = e.get("db");
  if (!o) return e.json({ error: "Database unavailable" }, 503);
  const u = await new te(o).findOrCreate({ name: n.toLowerCase(), normalizedName: n.toLowerCase(), tenantId: i, zoneManagement: r }), d = await gr(e, { path: "/api/collect/domain", method: "POST", body: JSON.stringify({ domain: n, zoneManagement: r, triggeredBy: s }) });
  return d instanceof Response ? d : e.json({ ...d.json, domainId: u.id });
});
const Bt$1 = new Hono(), Wi = 7, jd = Wi * 24 * 60 * 60 * 1e3;
function Ld() {
  const e = new Uint8Array(32);
  return crypto.getRandomValues(e), Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
function Gi(e) {
  if (!e) return {};
  const t = {};
  for (const n of e.split(";")) {
    const [r, ...s] = n.trim().split("=");
    r && (t[r] = s.join("="));
  }
  return t;
}
Bt$1.post("/signup", (e) => e.json({ error: "Registration is disabled." }, 403));
Bt$1.post("/login", async (e) => {
  const t = e.get("db");
  if (!t) return e.json({ error: "Database not available" }, 503);
  const { email: n, password: r } = await e.req.json();
  if (!n || !r) return e.json({ error: "Email and password are required" }, 400);
  const s = await t.getDrizzle().query.users.findFirst({ where: eq(yi.email, n.toLowerCase()) });
  if (!s) return e.json({ error: "Invalid email or password" }, 401);
  if (!await verify(s.passwordHash, r)) return e.json({ error: "Invalid email or password" }, 401);
  const o = Ld(), a = new Date(Date.now() + jd);
  return await t.getDrizzle().insert(Ge).values({ token: o, userEmail: s.email, tenantId: s.tenantId, expiresAt: a }), e.header("Set-Cookie", `dns_ops_session=${o}; Path=/; Max-Age=${Wi * 24 * 60 * 60}; HttpOnly; SameSite=Lax`), e.json({ success: true, email: s.email, tenant: n.split("@")[1] });
});
Bt$1.post("/logout", async (e) => {
  const t = e.get("db"), r = Gi(e.req.header("Cookie")).dns_ops_session;
  return r && t && await t.getDrizzle().delete(Ge).where(eq(Ge.token, r)), e.header("Set-Cookie", "dns_ops_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"), e.json({ success: true });
});
Bt$1.get("/me", async (e) => {
  const t = e.get("tenantId"), n = e.get("actorId"), r = e.get("actorEmail");
  if (t && n) return e.json({ authenticated: true, email: r || `${n}@dns-ops.local`, tenant: t });
  const s = e.get("db");
  if (!s) return e.json({ authenticated: false }, 401);
  const o = Gi(e.req.header("Cookie")).dns_ops_session;
  if (!o) return e.json({ authenticated: false }, 401);
  const a = await s.getDrizzle().query.sessions.findFirst({ where: and(eq(Ge.token, o), gt$2(Ge.expiresAt, /* @__PURE__ */ new Date())) });
  return a ? e.json({ authenticated: true, email: a.userEmail, tenant: a.userEmail.split("@")[1] }) : e.json({ authenticated: false }, 401);
});
if (typeof process < "u" && process.env) try {
  Ro();
} catch {
  console.warn("[ENV] Skipping env validation in production runtime");
}
const Tt$1 = new Hono();
Tt$1.use("*", Na);
Tt$1.use("*", Uo);
Tt$1.route("/api/auth", Bt$1);
Tt$1.use("/api/*", async (e, t) => e.req.path === "/api/health" || e.req.path.startsWith("/api/auth/") ? t() : Vo(e, t));
Tt$1.route("/api", Z);
const _c = vo(({ request: e }) => {
  var _a2, _b;
  const n = (_b = (_a2 = Hs()) == null ? void 0 : _a2.context) != null ? _b : {};
  return Tt$1.fetch(e, n);
});

const at = () => ({ routes: { __root__: { filePath: "__root.tsx", children: ["/", "/login", "/portfolio", "/domain/$domain"], preloads: ["/_build/assets/client-d7wXsaxM.js", "/_build/assets/client-BtEB09H5.js"] }, "/": { filePath: "index.tsx" }, "/login": { filePath: "login.tsx" }, "/portfolio": { filePath: "portfolio.tsx" }, "/domain/$domain": { filePath: "domain/$domain.tsx" } } });
function it(e) {
  return globalThis.MANIFEST[e];
}
var ot = "Invariant failed";
function ct(e, r) {
  if (!e) throw new Error(ot);
}
function lt() {
  var _a;
  const e = at(), r = e.routes.__root__ = e.routes.__root__ || {};
  r.assets = r.assets || [];
  let t = "";
  const s = it("client"), n = (_a = s.inputs[s.handler]) == null ? void 0 : _a.output.path;
  return n || ct(n), r.assets.push({ tag: "script", attrs: { type: "module", suppressHydrationWarning: true, async: true }, children: `${t}import("${n}")` }), e;
}
function dt() {
  const e = lt();
  return { ...e, routes: Object.fromEntries(Object.entries(e.routes).map(([r, t]) => {
    const { preloads: s, assets: n } = t;
    return [r, { preloads: s, assets: n }];
  })) };
}
function ue(e) {
  return jsx(RouterProvider, { router: e.router });
}
var ut = " daum[ /]| deusu/|(?:^|[^g])news(?!sapphire)|(?<! (?:channel/|google/))google(?!(app|/google| pixel))|(?<! cu)bots?(?:\\b|_)|(?<!(?:lib))http|(?<!cam)scan|24x7|@[a-z][\\w-]+\\.|\\(\\)|\\.com\\b|\\b\\w+\\.ai|\\bmanus-user/|\\bort/|\\bperl\\b|\\bsecurityheaders\\b|\\btime/|\\||^[\\w \\.\\-\\(?:\\):%]+(?:/v?\\d+(?:\\.\\d+)?(?:\\.\\d{1,10})*?)?(?:,|$)|^[^ ]{50,}$|^\\d+\\b|^\\W|^\\w*search\\b|^\\w+/[\\w\\(\\)]*$|^\\w+/\\d\\.\\d\\s\\([\\w@]+\\)$|^active|^ad muncher|^amaya|^apache/|^avsdevicesdk/|^azure|^biglotron|^bot|^bw/|^clamav[ /]|^client/|^cobweb/|^custom|^ddg[_-]android|^discourse|^dispatch/\\d|^downcast/|^duckduckgo|^email|^facebook|^getright/|^gozilla/|^hobbit|^hotzonu|^hwcdn/|^igetter/|^jeode/|^jetty/|^jigsaw|^microsoft bits|^movabletype|^mozilla/\\d\\.\\d\\s[\\w\\.-]+$|^mozilla/\\d\\.\\d\\s\\((?:compatible;)?(?:\\s?[\\w\\d-.]+\\/\\d+\\.\\d+)?\\)$|^navermailapp|^netsurf|^offline|^openai/|^owler|^php|^postman|^python|^rank|^read|^reed|^rest|^rss|^snapchat|^space bison|^svn|^swcd |^taringa|^thumbor/|^track|^w3c|^webbandit/|^webcopier|^wget|^whatsapp|^wordpress|^xenu link sleuth|^yahoo|^yandex|^zdm/\\d|^zoom marketplace/|advisor|agent\\b|analyzer|archive|ask jeeves/teoma|audit|bit\\.ly/|bluecoat drtr|browsex|burpcollaborator|capture|catch|check\\b|checker|chrome-lighthouse|chromeframe|classifier|cloudflare|convertify|crawl|cypress/|dareboost|datanyze|dejaclick|detect|dmbrowser|download|exaleadcloudview|feed|fetcher|firephp|functionize|grab|headless|httrack|hubspot marketing grader|ibisbrowser|infrawatch|insight|inspect|iplabel|java(?!;)|library|linkcheck|mail\\.ru/|manager|measure|monitor\\b|neustar wpm|node\\b|nutch|offbyone|onetrust|optimize|pageburst|pagespeed|parser|phantomjs|pingdom|powermarks|preview|proxy|ptst[ /]\\d|retriever|rexx;|rigor|rss\\b|scrape|server|sogou|sparkler/|speedcurve|spider|splash|statuscake|supercleaner|synapse|synthetic|tools|torrent|transcoder|url|validator|virtuoso|wappalyzer|webglance|webkit2png|whatcms/|xtate/", ft = /bot|crawl|http|lighthouse|scan|search|spider/i, I;
function mt() {
  if (I instanceof RegExp) return I;
  try {
    I = new RegExp(ut, "i");
  } catch {
    I = ft;
  }
  return I;
}
function fe(e) {
  return !!e && mt().test(e);
}
function pt(e, r) {
  return ye(e, r);
}
function ht(e, r) {
  return Readable.fromWeb(ye(e, Readable.toWeb(r)));
}
const gt = /(<body)/, yt = /(<\/body>)/, St = /(<\/html>)/, bt = /(<head.*?>)/, _t = /(<\/[a-zA-Z][\w:.-]*?>)/g, wt = new TextDecoder();
function xt() {
  let e;
  const r = new TextEncoder(), s = { stream: new ReadableStream$1({ start(n) {
    e = n;
  } }), write: (n) => {
    e.enqueue(r.encode(n));
  }, end: (n) => {
    n && e.enqueue(r.encode(n)), e.close(), s.destroyed = true;
  }, destroy: (n) => {
    e.error(n);
  }, destroyed: false };
  return s;
}
async function vt(e, r) {
  var t, s, n;
  try {
    const o = e.getReader();
    let l;
    for (; !(l = await o.read()).done; ) (t = r.onData) == null || t.call(r, l);
    (s = r.onEnd) == null || s.call(r);
  } catch (o) {
    (n = r.onError) == null || n.call(r, o);
  }
}
function ye(e, r) {
  const t = xt();
  let s = true, n = "", o = "", l = false, d = false, c = "", h = "";
  function m() {
    const f = n;
    return n = "", f;
  }
  function w(f) {
    return f instanceof Uint8Array ? wt.decode(f) : String(f);
  }
  const C = createControlledPromise();
  let x = 0;
  e.serverSsr.injectedHtml.forEach((f) => {
    M(f);
  });
  const Z = e.subscribe("onInjectedHtml", (f) => {
    M(f.promise);
  });
  function M(f) {
    x++, f.then((A) => {
      l ? t.write(A) : n += A;
    }).catch(C.reject).finally(() => {
      x--, !s && x === 0 && (Z(), C.resolve());
    });
  }
  return C.then(() => {
    const f = h + m() + o;
    t.end(f);
  }).catch((f) => {
    console.error("Error reading routerStream:", f), t.destroy(f);
  }), vt(r, { onData: (f) => {
    const A = w(f.value);
    let y = c + A;
    const O = y.match(yt), B = y.match(St);
    if (l || y.match(gt) && (l = true), !d) {
      const p = y.match(bt);
      if (p) {
        d = true;
        const a = p.index, i = p[0], S = y.slice(a + i.length);
        t.write(y.slice(0, a) + i + m()), y = S;
      }
    }
    if (!l) {
      t.write(y), c = "";
      return;
    }
    if (O && B && O.index < B.index) {
      const p = O.index;
      o = y.slice(p), t.write(y.slice(0, p) + m()), c = "";
      return;
    }
    let H, T = 0;
    for (; (H = _t.exec(y)) !== null; ) T = H.index + H[0].length;
    if (T > 0) {
      const p = y.slice(0, T) + m() + h;
      t.write(p), c = y.slice(T);
    } else c = y, h += m();
  }, onEnd: () => {
    s = false, x === 0 && C.resolve();
  }, onError: (f) => {
    console.error("Error reading appStream:", f), t.destroy(f);
  } }), t.stream;
}
function Se(e) {
  if (Array.isArray(e)) return e.flatMap((m) => Se(m));
  if (typeof e != "string") return [];
  const r = [];
  let t = 0, s, n, o, l, d;
  const c = () => {
    for (; t < e.length && /\s/.test(e.charAt(t)); ) t += 1;
    return t < e.length;
  }, h = () => (n = e.charAt(t), n !== "=" && n !== ";" && n !== ",");
  for (; t < e.length; ) {
    for (s = t, d = false; c(); ) if (n = e.charAt(t), n === ",") {
      for (o = t, t += 1, c(), l = t; t < e.length && h(); ) t += 1;
      t < e.length && e.charAt(t) === "=" ? (d = true, t = l, r.push(e.slice(s, o)), s = t) : t = o + 1;
    } else t += 1;
    (!d || t >= e.length) && r.push(e.slice(s, e.length));
  }
  return r;
}
function Rt(e) {
  return e instanceof Headers ? new Headers(e) : Array.isArray(e) ? new Headers(e) : typeof e == "object" ? new Headers(e) : new Headers();
}
function me(...e) {
  return e.reduce((r, t) => {
    const s = Rt(t);
    for (const [n, o] of s.entries()) n === "set-cookie" ? Se(o).forEach((d) => r.append("set-cookie", d)) : r.set(n, o);
    return r;
  }, new Headers());
}
const z = { stringify: (e) => JSON.stringify(e, function(t, s) {
  const n = this[t], o = K.find((l) => l.stringifyCondition(n));
  return o ? o.stringify(n) : s;
}), parse: (e) => JSON.parse(e, function(t, s) {
  const n = this[t];
  if (isPlainObject$1(n)) {
    const o = K.find((l) => l.parseCondition(n));
    if (o) return o.parse(n);
  }
  return s;
}), encode: (e) => {
  if (Array.isArray(e)) return e.map((t) => z.encode(t));
  if (isPlainObject$1(e)) return Object.fromEntries(Object.entries(e).map(([t, s]) => [t, z.encode(s)]));
  const r = K.find((t) => t.stringifyCondition(e));
  return r ? r.stringify(e) : e;
}, decode: (e) => {
  if (isPlainObject$1(e)) {
    const r = K.find((t) => t.parseCondition(e));
    if (r) return r.parse(e);
  }
  return Array.isArray(e) ? e.map((r) => z.decode(r)) : isPlainObject$1(e) ? Object.fromEntries(Object.entries(e).map(([r, t]) => [r, z.decode(t)])) : e;
} }, F = (e, r, t, s) => ({ key: e, stringifyCondition: r, stringify: (n) => ({ [`$${e}`]: t(n) }), parseCondition: (n) => Object.hasOwn(n, `$${e}`), parse: (n) => s(n[`$${e}`]) }), K = [F("undefined", (e) => e === void 0, () => 0, () => {
}), F("date", (e) => e instanceof Date, (e) => e.toISOString(), (e) => new Date(e)), F("error", (e) => e instanceof Error, (e) => ({ ...e, message: e.message, stack: void 0, cause: e.cause }), (e) => Object.assign(new Error(e.message), e)), F("formData", (e) => e instanceof FormData, (e) => {
  const r = {};
  return e.forEach((t, s) => {
    const n = r[s];
    n !== void 0 ? Array.isArray(n) ? n.push(t) : r[s] = [n, t] : r[s] = t;
  }), r;
}, (e) => {
  const r = new FormData();
  return Object.entries(e).forEach(([t, s]) => {
    Array.isArray(s) ? s.forEach((n) => r.append(t, n)) : r.append(t, s);
  }), r;
}), F("bigint", (e) => typeof e == "bigint", (e) => e.toString(), (e) => BigInt(e))];
function Et(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var re, pe;
function jt() {
  if (pe) return re;
  pe = 1;
  const e = {}, r = e.hasOwnProperty, t = (a, i) => {
    for (const S in a) r.call(a, S) && i(S, a[S]);
  }, s = (a, i) => (i && t(i, (S, v) => {
    a[S] = v;
  }), a), n = (a, i) => {
    const S = a.length;
    let v = -1;
    for (; ++v < S; ) i(a[v]);
  }, o = (a) => "\\u" + ("0000" + a).slice(-4), l = (a, i) => {
    let S = a.toString(16);
    return i ? S : S.toUpperCase();
  }, d = e.toString, c = Array.isArray, h = (a) => typeof Buffer == "function" && Buffer.isBuffer(a), m = (a) => d.call(a) == "[object Object]", w = (a) => typeof a == "string" || d.call(a) == "[object String]", C = (a) => typeof a == "number" || d.call(a) == "[object Number]", x = (a) => typeof a == "bigint", Z = (a) => typeof a == "function", M = (a) => d.call(a) == "[object Map]", f = (a) => d.call(a) == "[object Set]", A = { "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "	": "\\t" }, y = /[\\\b\f\n\r\t]/, O = /[0-9]/, B = /[\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/, H = /([\uD800-\uDBFF][\uDC00-\uDFFF])|([\uD800-\uDFFF])|(['"`])|[^]/g, T = /([\uD800-\uDBFF][\uDC00-\uDFFF])|([\uD800-\uDFFF])|(['"`])|[^ !#-&\(-\[\]-_a-~]/g, p = (a, i) => {
    const S = () => {
      Y = W, ++i.indentLevel, W = i.indent.repeat(i.indentLevel);
    }, v = { escapeEverything: false, minimal: false, isScriptContext: false, quotes: "single", wrap: false, es6: false, json: false, compact: true, lowercaseHex: false, numbers: "decimal", indent: "	", indentLevel: 0, __inline1__: false, __inline2__: false }, R = i && i.json;
    R && (v.quotes = "double", v.wrap = true), i = s(v, i), i.quotes != "single" && i.quotes != "double" && i.quotes != "backtick" && (i.quotes = "single");
    const q = i.quotes == "double" ? '"' : i.quotes == "backtick" ? "`" : "'", j = i.compact, $ = i.lowercaseHex;
    let W = i.indent.repeat(i.indentLevel), Y = "";
    const Re = i.__inline1__, U = i.__inline2__, N = j ? "" : `
`;
    let b, V = true;
    const Ee = i.numbers == "binary", je = i.numbers == "octal", Ce = i.numbers == "decimal", Ae = i.numbers == "hexadecimal";
    if (R && a && Z(a.toJSON) && (a = a.toJSON()), !w(a)) {
      if (M(a)) return a.size == 0 ? "new Map()" : (j || (i.__inline1__ = true, i.__inline2__ = false), "new Map(" + p(Array.from(a), i) + ")");
      if (f(a)) return a.size == 0 ? "new Set()" : "new Set(" + p(Array.from(a), i) + ")";
      if (h(a)) return a.length == 0 ? "Buffer.from([])" : "Buffer.from(" + p(Array.from(a), i) + ")";
      if (c(a)) return b = [], i.wrap = true, Re && (i.__inline1__ = false, i.__inline2__ = true), U || S(), n(a, (g) => {
        V = false, U && (i.__inline2__ = false), b.push((j || U ? "" : W) + p(g, i));
      }), V ? "[]" : U ? "[" + b.join(", ") + "]" : "[" + N + b.join("," + N) + N + (j ? "" : Y) + "]";
      if (C(a) || x(a)) {
        if (R) return JSON.stringify(Number(a));
        let g;
        if (Ce) g = String(a);
        else if (Ae) {
          let _ = a.toString(16);
          $ || (_ = _.toUpperCase()), g = "0x" + _;
        } else Ee ? g = "0b" + a.toString(2) : je && (g = "0o" + a.toString(8));
        return x(a) ? g + "n" : g;
      } else return x(a) ? R ? JSON.stringify(Number(a)) : a + "n" : m(a) ? (b = [], i.wrap = true, S(), t(a, (g, _) => {
        V = false, b.push((j ? "" : W) + p(g, i) + ":" + (j ? "" : " ") + p(_, i));
      }), V ? "{}" : "{" + N + b.join("," + N) + N + (j ? "" : Y) + "}") : R ? JSON.stringify(a) || "null" : String(a);
    }
    const Te = i.escapeEverything ? H : T;
    return b = a.replace(Te, (g, _, oe, J, $e, Ne) => {
      if (_) {
        if (i.minimal) return _;
        const ce = _.charCodeAt(0), le = _.charCodeAt(1);
        if (i.es6) {
          const Pe = (ce - 55296) * 1024 + le - 56320 + 65536;
          return "\\u{" + l(Pe, $) + "}";
        }
        return o(l(ce, $)) + o(l(le, $));
      }
      if (oe) return o(l(oe.charCodeAt(0), $));
      if (g == "\0" && !R && !O.test(Ne.charAt($e + 1))) return "\\0";
      if (J) return J == q || i.escapeEverything ? "\\" + J : J;
      if (y.test(g)) return A[g];
      if (i.minimal && !B.test(g)) return g;
      const ee = l(g.charCodeAt(0), $);
      return R || ee.length > 2 ? o(ee) : "\\x" + ("00" + ee).slice(-2);
    }), q == "`" && (b = b.replace(/\$\{/g, "\\${")), i.isScriptContext && (b = b.replace(/<\/(script|style)/gi, "<\\/$1").replace(/<!--/g, R ? "\\u003C!--" : "\\x3C!--")), i.wrap && (b = q + b + q), b;
  };
  return p.version = "3.0.2", re = p, re;
}
var Ct = jt();
const D = Et(Ct), At = `const __TSR_SSR__={matches:[],streamedValues:{},initMatch:o=>(__TSR_SSR__.matches.push(o),o.extracted?.forEach(l=>{if(l.type==="stream"){let r;l.value=new ReadableStream({start(e){r={enqueue:t=>{try{e.enqueue(t)}catch{}},close:()=>{try{e.close()}catch{}}}}}),l.value.controller=r}else{let r,e;l.value=new Promise((t,a)=>{e=a,r=t}),l.value.reject=e,l.value.resolve=r}}),!0),resolvePromise:({matchId:o,id:l,promiseState:r})=>{const e=__TSR_SSR__.matches.find(t=>t.id===o);if(e){const t=e.extracted?.[l];if(t&&t.type==="promise"&&t.value&&r.status==="success")return t.value.resolve(r.data),!0}return!1},injectChunk:({matchId:o,id:l,chunk:r})=>{const e=__TSR_SSR__.matches.find(t=>t.id===o);if(e){const t=e.extracted?.[l];if(t&&t.type==="stream"&&t.value?.controller)return t.value.controller.enqueue(new TextEncoder().encode(r.toString())),!0}return!1},closeStream:({matchId:o,id:l})=>{const r=__TSR_SSR__.matches.find(e=>e.id===o);if(r){const e=r.extracted?.[l];if(e&&e.type==="stream"&&e.value?.controller)return e.value.controller.close(),!0}return!1},cleanScripts:()=>{document.querySelectorAll(".tsr-once").forEach(o=>{o.remove()})}};window.__TSR_SSR__=__TSR_SSR__;
`;
function Tt(e, r) {
  e.ssr = { manifest: r, serializer: z }, e.serverSsr = { injectedHtml: [], streamedKeys: /* @__PURE__ */ new Set(), injectHtml: (t) => {
    const s = Promise.resolve().then(t);
    return e.serverSsr.injectedHtml.push(s), e.emit({ type: "onInjectedHtml", promise: s }), s.then(() => {
    });
  }, injectScript: (t, s) => e.serverSsr.injectHtml(async () => `<script class='tsr-once'>${await t()}; if (typeof __TSR_SSR__ !== 'undefined') __TSR_SSR__.cleanScripts()<\/script>`), streamValue: (t, s) => {
    e.serverSsr.streamedKeys.has(t), e.serverSsr.streamedKeys.add(t), e.serverSsr.injectScript(() => `__TSR_SSR__.streamedValues['${t}'] = { value: ${D(e.ssr.serializer.stringify(s), { isScriptContext: true, wrap: true, json: true })}}`);
  }, onMatchSettled: Pt }, e.serverSsr.injectScript(() => At, { logScript: false });
}
function $t(e) {
  var r, t;
  const s = { manifest: e.ssr.manifest, dehydratedData: (t = (r = e.options).dehydrate) == null ? void 0 : t.call(r) };
  e.serverSsr.injectScript(() => `__TSR_SSR__.dehydrated = ${D(e.ssr.serializer.stringify(s), { isScriptContext: true, wrap: true, json: true })}`);
}
function Nt(e, r) {
  const t = [];
  return { replaced: se(e, (n, o) => {
    if (n instanceof ReadableStream) {
      const [l, d] = n.tee(), c = { type: "stream", path: o, id: t.length, matchIndex: r.match.index, stream: d };
      return t.push(c), l;
    } else if (n instanceof Promise) {
      const l = defer$1(n), d = { type: "promise", path: o, id: t.length, matchIndex: r.match.index, promise: l };
      t.push(d);
    }
    return n;
  }), extracted: t };
}
function Pt(e) {
  const { router: r, match: t } = e;
  let s, n;
  if (t.loaderData !== void 0) {
    const c = Nt(t.loaderData, { match: t });
    t.loaderData = c.replaced, s = c.extracted, n = s.reduce((h, m) => ne(h, ["temp", ...m.path], void 0), { temp: c.replaced }).temp;
  }
  const o = `__TSR_SSR__.initMatch(${D({ id: t.id, __beforeLoadContext: r.ssr.serializer.stringify(t.__beforeLoadContext), loaderData: r.ssr.serializer.stringify(n), error: r.ssr.serializer.stringify(t.error), extracted: s == null ? void 0 : s.map((c) => pick(c, ["type", "path"])), updatedAt: t.updatedAt, status: t.status }, { isScriptContext: true, wrap: true, json: true })})`;
  r.serverSsr.injectScript(() => o), s && s.forEach((c) => c.type === "promise" ? l(c) : d(c));
  function l(c) {
    r.serverSsr.injectScript(async () => (await c.promise, `__TSR_SSR__.resolvePromise(${D({ matchId: t.id, id: c.id, promiseState: c.promise[TSR_DEFERRED_PROMISE] }, { isScriptContext: true, wrap: true, json: true })})`));
  }
  function d(c) {
    r.serverSsr.injectHtml(async () => {
      try {
        const h = c.stream.getReader();
        let m = null;
        for (; !(m = await h.read()).done; ) if (m.value) {
          const w = `__TSR_SSR__.injectChunk(${D({ matchId: t.id, id: c.id, chunk: m.value }, { isScriptContext: true, wrap: true, json: true })})`;
          r.serverSsr.injectScript(() => w);
        }
        r.serverSsr.injectScript(() => `__TSR_SSR__.closeStream(${D({ matchId: t.id, id: c.id }, { isScriptContext: true, wrap: true, json: true })})`);
      } catch (h) {
        console.error("stream read error", h);
      }
      return "";
    });
  }
}
function ne(e, r, t) {
  if (r.length === 0) return t;
  const [s, ...n] = r;
  return Array.isArray(e) ? e.map((o, l) => l === Number(s) ? ne(o, n, t) : o) : isPlainObject$1(e) ? { ...e, [s]: ne(e[s], n, t) } : e;
}
function se(e, r, t = []) {
  if (isPlainArray(e)) return e.map((n, o) => se(n, r, [...t, `${o}`]));
  if (isPlainObject$1(e)) {
    const n = {};
    for (const o in e) n[o] = se(e[o], r, [...t, o]);
    return n;
  }
  const s = r(e, t);
  return s !== e ? s : e;
}
function Dt({ createRouter: e, getRouterManifest: r }) {
  return (t) => eventHandler(async (s) => {
    const n = toWebRequest(s), o = new URL(n.url), l = o.href.replace(o.origin, ""), d = createMemoryHistory({ initialEntries: [l] }), c = e();
    Tt(c, await (r == null ? void 0 : r())), c.update({ history: d }), await c.load(), $t(c);
    const h = Ot({ event: s, router: c });
    return await t({ request: n, router: c, responseHeaders: h });
  });
}
function Ot(e) {
  let r = me(getResponseHeaders(e.event), e.event.___ssrRpcResponseHeaders, { "Content-Type": "text/html; charset=UTF-8" }, ...e.router.state.matches.map((s) => s.headers));
  const { redirect: t } = e.router.state;
  return t && (r = me(r, t.headers, { Location: t.href })), r;
}
const Ht = async ({ request: e, router: r, responseHeaders: t }) => {
  if (typeof G$2.renderToReadableStream == "function") {
    const s = await G$2.renderToReadableStream(jsx(ue, { router: r }), { signal: e.signal });
    fe(e.headers.get("User-Agent")) && await s.allReady;
    const n = pt(r, s);
    return new Response(n, { status: r.state.statusCode, headers: t });
  }
  if (typeof G$2.renderToPipeableStream == "function") {
    const s = new PassThrough();
    try {
      const o = G$2.renderToPipeableStream(jsx(ue, { router: r }), { ...fe(e.headers.get("User-Agent")) ? { onAllReady() {
        o.pipe(s);
      } } : { onShellReady() {
        o.pipe(s);
      } }, onError: (l, d) => {
        console.error("Error in renderToPipeableStream:", l, d);
      } });
    } catch (o) {
      console.error("Error in renderToPipeableStream:", o);
    }
    const n = ht(r, s);
    return new Response(n, { status: r.state.statusCode, headers: t });
  }
  throw new Error("No renderToReadableStream or renderToPipeableStream found in react-dom/server. Ensure you are using a version of react-dom that supports streaming.");
}, k = createRootRoute({ component: Ft, head: () => ({ title: "DNS Ops Workbench", meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }], links: [{ rel: "stylesheet", href: "/_build/assets/client.css" }] }) });
function It() {
  const [e, r] = useState(false), [t, s] = useState(false), [n, o] = useState(null), l = useLocation(), d = useNavigate(), c = useRef(false);
  useEffect(() => {
    if (r(true), c.current) {
      c.current = false;
      return;
    }
    fetch("/api/auth/me", { credentials: "include" }).then((m) => m.json()).then((m) => {
      const w = m;
      w.authenticated ? (s(true), o(w.email || null)) : (s(false), o(null));
    }).catch(() => {
    });
  }, [l.pathname]);
  const h = async () => {
    c.current = true, await fetch("/api/auth/logout", { method: "POST", credentials: "include" }), flushSync(() => {
      s(false), o(null);
    }), d({ to: "/login" });
  };
  return e ? t ? jsxs(Fragment, { children: [jsx("span", { className: "text-sm text-gray-500", children: n }), jsx("button", { type: "button", onClick: h, className: "focus-ring rounded text-gray-600 hover:text-gray-900 text-sm", children: "Logout" })] }) : jsx(Link, { to: "/login", className: "focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium", children: "Login" }) : jsx(Link, { to: "/login", className: "focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium", children: "Login" });
}
function Ft() {
  const r = useRouter().options.context.queryClient;
  return jsx(QueryClientProvider, { client: r, children: jsxs("html", { lang: "en", children: [jsx("head", { children: jsx(HeadContent, {}) }), jsxs("body", { children: [jsxs("div", { className: "min-h-screen bg-gray-50", children: [jsx("header", { className: "bg-white border-b border-gray-200", children: jsx("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8", children: jsxs("div", { className: "flex justify-between h-16 items-center", children: [jsx(Link, { to: "/", className: "focus-ring text-xl font-bold text-gray-900 rounded", children: "DNS Ops Workbench" }), jsxs("nav", { className: "flex gap-6 items-center", children: [jsx(Link, { to: "/", className: "focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium", children: "Home" }), jsx(Link, { to: "/portfolio", className: "focus-ring rounded text-gray-600 hover:text-gray-900 [&.active]:text-blue-600 [&.active]:font-medium", children: "Portfolio" }), jsx(It, {})] })] }) }) }), jsx("main", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8", children: jsx(Outlet, {}) })] }), jsx(Scripts, {})] })] }) });
}
function ae() {
  return jsx("div", { className: "flex min-h-[50vh] items-center justify-center", children: jsxs("div", { className: "text-center", children: [jsx("div", { className: "inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent", role: "status", "aria-label": "Verifying authentication" }), jsx("p", { className: "mt-3 text-sm text-gray-500", children: "Verifying session..." })] }) });
}
async function ie() {
  return;
}
const zt = () => import('../build/portfolio-DibpN4rR.mjs'), be = createFileRoute("/portfolio")({ beforeLoad: async () => {
  await ie();
}, pendingComponent: ae, component: lazyRouteComponent(zt, "component", () => be.ssr) }), Lt = () => import('../build/login-CJz8182m.mjs'), _e = createFileRoute("/login")({ component: lazyRouteComponent(Lt, "component", () => _e.ssr) }), kt = () => import('../build/index-CkDK1VJT.mjs'), we = createFileRoute("/")({ validateSearch: (e) => ({ domain: typeof e.domain == "string" && e.domain.length > 0 ? e.domain : void 0 }), beforeLoad: async ({ search: e }) => {
  if (await ie(), e.domain) throw redirect({ to: "/domain/$domain", params: { domain: e.domain } });
}, pendingComponent: ae, component: lazyRouteComponent(kt, "component", () => we.ssr) });
function xe() {
  return process.env.VITE_FEATURE_DELEGATION !== "false";
}
function Mt() {
  return process.env.VITE_FEATURE_SIMULATION === "true";
}
xe(), Mt();
const Bt = () => import('../build/_domain-DJPc2vNI.mjs'), qt = xe(), he = ["overview", "dns", "mail", "history"], Wt = qt ? [...he, "delegation"] : he, Ut = Wt, ve = createFileRoute("/domain/$domain")({ component: lazyRouteComponent(Bt, "component", () => ve.ssr), beforeLoad: async () => {
  await ie();
}, pendingComponent: ae, validateSearch: (e) => {
  const r = e.tab;
  return { tab: r && Ut.includes(r) ? r : void 0 };
}, loader: ({ params: e }) => ({ domain: e.domain, snapshot: null, observations: [] }) }), Vt = be.update({ id: "/portfolio", path: "/portfolio", getParentRoute: () => k }), Jt = _e.update({ id: "/login", path: "/login", getParentRoute: () => k }), Gt = we.update({ id: "/", path: "/", getParentRoute: () => k }), Kt = ve.update({ id: "/domain/$domain", path: "/domain/$domain", getParentRoute: () => k }), Qt = { IndexRoute: Gt, LoginRoute: Jt, PortfolioRoute: Vt, DomainDomainRoute: Kt }, Xt = k._addFileChildren(Qt)._addFileTypes();
function Zt() {
  return jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50", children: jsxs("div", { className: "text-center", children: [jsx("h1", { className: "text-2xl font-bold text-gray-900", children: "Page not found" }), jsx("p", { className: "mt-2 text-gray-600", children: "The page you requested does not exist." })] }) });
}
function Yt() {
  const e = new QueryClient({ defaultOptions: { queries: { staleTime: 3e4, refetchOnWindowFocus: false } } });
  return createRouter$2({ routeTree: Xt, context: { queryClient: e }, defaultPreload: "intent", defaultPreloadStaleTime: 0, defaultNotFoundComponent: Zt });
}
const fr = Dt({ createRouter: Yt, getRouterManifest: dt })(Ht);

const handlers = [
  { route: '', handler: _MTmOo_, lazy: false, middleware: true, method: undefined },
  { route: '/_server', handler: le, lazy: false, middleware: true, method: undefined },
  { route: '/api', handler: _c, lazy: false, middleware: true, method: undefined },
  { route: '/', handler: fr, lazy: false, middleware: true, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const captureError = (error, context = {}) => {
    const promise = hooks.callHookParallel("error", error, context).catch((error_) => {
      console.error("Error while capturing another error", error_);
    });
    if (context.event && isEvent(context.event)) {
      const errors = context.event.context.nitro?.errors;
      if (errors) {
        errors.push({ error, context });
      }
      if (context.event.waitUntil) {
        context.event.waitUntil(promise);
      }
    }
  };
  const h3App = createApp({
    debug: destr(false),
    onError: (error, event) => {
      captureError(error, { event, tags: ["request"] });
      return errorHandler(error, event);
    },
    onRequest: async (event) => {
      event.context.nitro = event.context.nitro || { errors: [] };
      const fetchContext = event.node.req?.__unenv__;
      if (fetchContext?._platform) {
        event.context = {
          _platform: fetchContext?._platform,
          // #3335
          ...fetchContext._platform,
          ...event.context
        };
      }
      if (!event.context.waitUntil && fetchContext?.waitUntil) {
        event.context.waitUntil = fetchContext.waitUntil;
      }
      event.fetch = (req, init) => fetchWithEvent(event, req, init, { fetch: localFetch });
      event.$fetch = (req, init) => fetchWithEvent(event, req, init, {
        fetch: $fetch
      });
      event.waitUntil = (promise) => {
        if (!event.context.nitro._waitUntilPromises) {
          event.context.nitro._waitUntilPromises = [];
        }
        event.context.nitro._waitUntilPromises.push(promise);
        if (event.context.waitUntil) {
          event.context.waitUntil(promise);
        }
      };
      event.captureError = (error, context) => {
        captureError(error, { event, ...context });
      };
      await nitroApp$1.hooks.callHook("request", event).catch((error) => {
        captureError(error, { event, tags: ["request"] });
      });
    },
    onBeforeResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("beforeResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    },
    onAfterResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("afterResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    }
  });
  const router = createRouter({
    preemptive: true
  });
  const nodeHandler = toNodeListener(h3App);
  const localCall = (aRequest) => b$1(
    nodeHandler,
    aRequest
  );
  const localFetch = (input, init) => {
    if (!input.toString().startsWith("/")) {
      return globalThis.fetch(input, init);
    }
    return C$1(
      nodeHandler,
      input,
      init
    ).then((response) => normalizeFetchResponse(response));
  };
  const $fetch = createFetch({
    fetch: localFetch,
    Headers: Headers$1,
    defaults: { baseURL: config.app.baseURL }
  });
  globalThis.$fetch = $fetch;
  h3App.use(createRouteRulesHandler({ localFetch }));
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(
        /\/+/g,
        "/"
      );
      h3App.use(middlewareBase, handler);
    } else {
      const routeRules = getRouteRulesForPath(
        h.route.replace(/:\w+|\*\*/g, "_")
      );
      if (routeRules.cache) {
        handler = cachedEventHandler(handler, {
          group: "nitro/routes",
          ...routeRules.cache
        });
      }
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router.handler);
  {
    const _handler = h3App.handler;
    h3App.handler = (event) => {
      const ctx = { event };
      return nitroAsyncContext.callAsync(ctx, () => _handler(event));
    };
  }
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch,
    captureError
  };
  return app;
}
function runNitroPlugins(nitroApp2) {
  for (const plugin of plugins) {
    try {
      plugin(nitroApp2);
    } catch (error) {
      nitroApp2.captureError(error, { tags: ["plugin"] });
      throw error;
    }
  }
}
const nitroApp$1 = createNitroApp();
function useNitroApp() {
  return nitroApp$1;
}
runNitroPlugins(nitroApp$1);

const debug = (...args) => {
};
function GracefulShutdown(server, opts) {
  opts = opts || {};
  const options = Object.assign(
    {
      signals: "SIGINT SIGTERM",
      timeout: 3e4,
      development: false,
      forceExit: true,
      onShutdown: (signal) => Promise.resolve(signal),
      preShutdown: (signal) => Promise.resolve(signal)
    },
    opts
  );
  let isShuttingDown = false;
  const connections = {};
  let connectionCounter = 0;
  const secureConnections = {};
  let secureConnectionCounter = 0;
  let failed = false;
  let finalRun = false;
  function onceFactory() {
    let called = false;
    return (emitter, events, callback) => {
      function call() {
        if (!called) {
          called = true;
          return Reflect.apply(callback, this, arguments);
        }
      }
      for (const e of events) {
        emitter.on(e, call);
      }
    };
  }
  const signals = options.signals.split(" ").map((s) => s.trim()).filter((s) => s.length > 0);
  const once = onceFactory();
  once(process, signals, (signal) => {
    debug("received shut down signal", signal);
    shutdown(signal).then(() => {
      if (options.forceExit) {
        process.exit(failed ? 1 : 0);
      }
    }).catch((error) => {
      debug("server shut down error occurred", error);
      process.exit(1);
    });
  });
  function isFunction(functionToCheck) {
    const getType = Object.prototype.toString.call(functionToCheck);
    return /^\[object\s([A-Za-z]+)?Function]$/.test(getType);
  }
  function destroy(socket, force = false) {
    if (socket._isIdle && isShuttingDown || force) {
      socket.destroy();
      if (socket.server instanceof http.Server) {
        delete connections[socket._connectionId];
      } else {
        delete secureConnections[socket._connectionId];
      }
    }
  }
  function destroyAllConnections(force = false) {
    debug("Destroy Connections : " + (force ? "forced close" : "close"));
    let counter = 0;
    let secureCounter = 0;
    for (const key of Object.keys(connections)) {
      const socket = connections[key];
      const serverResponse = socket._httpMessage;
      if (serverResponse && !force) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader("connection", "close");
        }
      } else {
        counter++;
        destroy(socket);
      }
    }
    debug("Connections destroyed : " + counter);
    debug("Connection Counter    : " + connectionCounter);
    for (const key of Object.keys(secureConnections)) {
      const socket = secureConnections[key];
      const serverResponse = socket._httpMessage;
      if (serverResponse && !force) {
        if (!serverResponse.headersSent) {
          serverResponse.setHeader("connection", "close");
        }
      } else {
        secureCounter++;
        destroy(socket);
      }
    }
    debug("Secure Connections destroyed : " + secureCounter);
    debug("Secure Connection Counter    : " + secureConnectionCounter);
  }
  server.on("request", (req, res) => {
    req.socket._isIdle = false;
    if (isShuttingDown && !res.headersSent) {
      res.setHeader("connection", "close");
    }
    res.on("finish", () => {
      req.socket._isIdle = true;
      destroy(req.socket);
    });
  });
  server.on("connection", (socket) => {
    if (isShuttingDown) {
      socket.destroy();
    } else {
      const id = connectionCounter++;
      socket._isIdle = true;
      socket._connectionId = id;
      connections[id] = socket;
      socket.once("close", () => {
        delete connections[socket._connectionId];
      });
    }
  });
  server.on("secureConnection", (socket) => {
    if (isShuttingDown) {
      socket.destroy();
    } else {
      const id = secureConnectionCounter++;
      socket._isIdle = true;
      socket._connectionId = id;
      secureConnections[id] = socket;
      socket.once("close", () => {
        delete secureConnections[socket._connectionId];
      });
    }
  });
  process.on("close", () => {
    debug("closed");
  });
  function shutdown(sig) {
    function cleanupHttp() {
      destroyAllConnections();
      debug("Close http server");
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            return reject(err);
          }
          return resolve(true);
        });
      });
    }
    debug("shutdown signal - " + sig);
    if (options.development) {
      debug("DEV-Mode - immediate forceful shutdown");
      return process.exit(0);
    }
    function finalHandler() {
      if (!finalRun) {
        finalRun = true;
        if (options.finally && isFunction(options.finally)) {
          debug("executing finally()");
          options.finally();
        }
      }
      return Promise.resolve();
    }
    function waitForReadyToShutDown(totalNumInterval) {
      debug(`waitForReadyToShutDown... ${totalNumInterval}`);
      if (totalNumInterval === 0) {
        debug(
          `Could not close connections in time (${options.timeout}ms), will forcefully shut down`
        );
        return Promise.resolve(true);
      }
      const allConnectionsClosed = Object.keys(connections).length === 0 && Object.keys(secureConnections).length === 0;
      if (allConnectionsClosed) {
        debug("All connections closed. Continue to shutting down");
        return Promise.resolve(false);
      }
      debug("Schedule the next waitForReadyToShutdown");
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(waitForReadyToShutDown(totalNumInterval - 1));
        }, 250);
      });
    }
    if (isShuttingDown) {
      return Promise.resolve();
    }
    debug("shutting down");
    return options.preShutdown(sig).then(() => {
      isShuttingDown = true;
      cleanupHttp();
    }).then(() => {
      const pollIterations = options.timeout ? Math.round(options.timeout / 250) : 0;
      return waitForReadyToShutDown(pollIterations);
    }).then((force) => {
      debug("Do onShutdown now");
      if (force) {
        destroyAllConnections(force);
      }
      return options.onShutdown(sig);
    }).then(finalHandler).catch((error) => {
      const errString = typeof error === "string" ? error : JSON.stringify(error);
      debug(errString);
      failed = true;
      throw errString;
    });
  }
  function shutdownManual() {
    return shutdown("manual");
  }
  return shutdownManual;
}

function getGracefulShutdownConfig() {
  return {
    disabled: !!process.env.NITRO_SHUTDOWN_DISABLED,
    signals: (process.env.NITRO_SHUTDOWN_SIGNALS || "SIGTERM SIGINT").split(" ").map((s) => s.trim()),
    timeout: Number.parseInt(process.env.NITRO_SHUTDOWN_TIMEOUT || "", 10) || 3e4,
    forceExit: !process.env.NITRO_SHUTDOWN_NO_FORCE_EXIT
  };
}
function setupGracefulShutdown(listener, nitroApp) {
  const shutdownConfig = getGracefulShutdownConfig();
  if (shutdownConfig.disabled) {
    return;
  }
  GracefulShutdown(listener, {
    signals: shutdownConfig.signals.join(" "),
    timeout: shutdownConfig.timeout,
    forceExit: shutdownConfig.forceExit,
    onShutdown: async () => {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn("Graceful shutdown timeout, force exiting...");
          resolve();
        }, shutdownConfig.timeout);
        nitroApp.hooks.callHook("close").catch((error) => {
          console.error(error);
        }).finally(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  });
}

const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const nitroApp = useNitroApp();
const server = cert && key ? new Server({ key, cert }, toNodeListener(nitroApp.h3App)) : new Server$1(toNodeListener(nitroApp.h3App));
const port = destr(process.env.NITRO_PORT || process.env.PORT) || 3e3;
const host = process.env.NITRO_HOST || process.env.HOST;
const path = process.env.NITRO_UNIX_SOCKET;
const listener = server.listen(path ? { path } : { port, host }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const protocol = cert && key ? "https" : "http";
  const addressInfo = listener.address();
  if (typeof addressInfo === "string") {
    console.log(`Listening on unix socket ${addressInfo}`);
    return;
  }
  const baseURL = (useRuntimeConfig().app.baseURL || "").replace(/\/$/, "");
  const url = `${protocol}://${addressInfo.family === "IPv6" ? `[${addressInfo.address}]` : addressInfo.address}:${addressInfo.port}${baseURL}`;
  console.log(`Listening on ${url}`);
});
trapUnhandledNodeErrors();
setupGracefulShutdown(listener, nitroApp);
const nodeServer = {};

export { $o as $, Aa as A, si as B, ur as C, di as D, oi as E, Fo as F, cc as G, oc as H, uc as I, dc as J, _a as K, Li as L, Mt$1 as M, ac as N, Kt$1 as O, ke as P, Ie as Q, z$1 as R, St$1 as S, Te as T, Bo as U, Ve as V, mi as W, X, lc as Y, Ce as Z, _t$1 as _, Le as a, ri as a0, re$1 as a1, ar as a2, Sa as a3, ft$1 as a4, me$1 as a5, ui as a6, Xe as a7, tn as a8, hc as a9, yi as aA, ai as aB, lr as aC, Et as aD, ve as aE, xe as aF, Mt as aG, nodeServer as aH, gi as aa, hi as ab, Re as ac, de as ad, Js as ae, pe$1 as af, Zs as ag, ii as ah, cr as ai, ue$1 as aj, Fe as ak, or as al, ei as am, Ge as an, dr as ao, fe$1 as ap, ti as aq, fi as ar, pi as as, $e as at, K$1 as au, ge as av, Me as aw, yc as ax, wc as ay, gc as az, bt$1 as b, mr as c, xe$1 as d, ee as e, fc as f, sn as g, rt as h, fr$1 as i, ji as j, se$1 as k, lt$1 as l, mc as m, nn as n, on as o, pc as p, ni as q, rn as r, st as s, te as t, li as u, _e$1 as v, ci as w, xt$1 as x, ye$1 as y, mt$1 as z };
//# sourceMappingURL=nitro.mjs.map
