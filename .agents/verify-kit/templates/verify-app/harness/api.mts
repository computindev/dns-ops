// harness/api.mts — HTTP driver skeleton with exchange capture and read-back.
// Run: VERIFY_RUN_DIR=… bun harness/api.mts <feature-id>
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.API_URL ?? 'http://localhost:8787'; // <<FILL: wrangler dev / hono port>>
const RUN_DIR = process.env.VERIFY_RUN_DIR ?? (() => { console.error('VERIFY_RUN_DIR not set'); process.exit(2); })();
const TOKEN = process.env.VERIFY_TOKEN ?? ''; // <<FILL: how the verification identity authenticates>>
let n = 0;
const SECRET_KEYS = /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization)$/i;
const SECRET_FIELDS = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|session)/i;
/** Evidence must never contain credentials: redact headers and JSON fields that look like secrets (deep). */
export function redact<T>(v: T): T {
  if (Array.isArray(v)) return v.map(redact) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SECRET_KEYS.test(k) || SECRET_FIELDS.test(k) ? '[REDACTED]' : redact(x)])) as T;
  return v;
}

/** Performs a request through the real public API and records the exchange as evidence. */
export async function call(name: string, method: string, url: string, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE_URL}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = null; try { json = JSON.parse(text); } catch {}
  fs.mkdirSync(path.join(RUN_DIR, 'http'), { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'http', `${String(++n).padStart(2, '0')}-${name}.json`), JSON.stringify(redact({ request: { method, url, body }, response: { status: res.status, headers: Object.fromEntries(res.headers), body: json ?? text } }), null, 2));
  return { status: res.status, json, text };
}

/** Independent read-back: a different path than the one that produced the effect (GET after POST, DB query, outbox row). */
export async function readback(name: string, url: string) {
  const r = await call(`readback-${name}`, 'GET', url);
  fs.mkdirSync(path.join(RUN_DIR, 'readback'), { recursive: true });
  fs.writeFileSync(path.join(RUN_DIR, 'readback', `${name}.json`), JSON.stringify(redact(r.json), null, 2));
  return r;
}

const drives: Record<string, () => Promise<void>> = {
  '<<domain.capability>>': async () => {
    const created = await call('create', 'POST', '/api/<<resource>>', { /* <<FILL>> */ });
    if (created.status !== 201) throw new Error(`expected 201, got ${created.status}`);
    const again = await call('create-again', 'POST', '/api/<<resource>>', { /* same payload */ }); // idempotency oracle
    if (![200, 409].includes(again.status)) throw new Error(`duplicate submit must be idempotent or rejected, got ${again.status}`);
    const { id } = created.json as { id: string };
    await readback('<<resource>>', `/api/<<resource>>/${id}`);
  },
};

const feature = process.argv[2];
const drive = feature && drives[feature];
if (!drive) { console.error(`usage: api.mts <feature-id> (known: ${Object.keys(drives).join(', ')})`); process.exit(2); }
await drive();
console.log(`drive ${feature} finished; evidence in ${RUN_DIR}`);
