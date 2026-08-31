// harness/api.mts — HTTP driver with exchange capture and read-back.
// Run: VERIFY_RUN_DIR=… bun .agents/skills/verify-dns-ops/harness/api.mts <feature-id>
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.API_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
const RUN_DIR = process.env.VERIFY_RUN_DIR ?? (() => { console.error('VERIFY_RUN_DIR not set'); process.exit(2); })();
const TOKEN = process.env.VERIFY_TOKEN ?? '';
const DEV_TENANT = process.env.E2E_DEV_TENANT ?? '';
const DEV_ACTOR = process.env.E2E_DEV_ACTOR ?? '';
let n = 0;
const SECRET_KEYS = /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization)$/i;
const SECRET_FIELDS = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|session)/i;

export function redact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(redact) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) || SECRET_FIELDS.test(k) ? '[REDACTED]' : redact(x)])) as T;
  return v;
}

export async function call(name: string, method: string, url: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (DEV_TENANT) headers['X-Dev-Tenant'] = DEV_TENANT;
  if (DEV_ACTOR) headers['X-Dev-Actor'] = DEV_ACTOR;
  const res = await fetch(`${BASE_URL}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch {}
  fs.mkdirSync(path.join(RUN_DIR, 'http'), { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'http', `${String(++n).padStart(2, '0')}-${name}.json`), JSON.stringify(redact({ request: { method, url, body }, response: { status: res.status, headers: Object.fromEntries(res.headers), body: json ?? text } }), null, 2));
  return { status: res.status, json, text };
}

export async function readback(name: string, url: string) {
  const r = await call(`readback-${name}`, 'GET', url);
  fs.mkdirSync(path.join(RUN_DIR, 'readback'), { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'readback', `${name}.json`), JSON.stringify(redact(r.json), null, 2));
  return r;
}

const drives: Record<string, () => Promise<void>> = {
  'health.public': async () => {
    const first = await call('web-health', 'GET', '/api/health');
    if (![200, 503].includes(first.status)) throw new Error(`expected 200 or 503, got ${first.status}`);
    const body = first.json as { status?: string; service?: string };
    if (first.status === 200 && body?.status !== 'healthy') throw new Error(`200 without status=healthy`);
    if (first.status === 503 && body?.status !== 'degraded') throw new Error(`503 without status=degraded`);
    const again = await readback('web-health', '/api/health');
    if (again.status !== first.status) throw new Error(`read-back status ${again.status} != ${first.status}`);
  },
};

const feature = process.argv[2];
const drive = feature && drives[feature];
if (!drive) { console.error(`usage: api.mts <feature-id> (known: ${Object.keys(drives).join(', ')})`); process.exit(2); }
await drive();
console.log(`drive ${feature} finished; evidence in ${RUN_DIR}`);
