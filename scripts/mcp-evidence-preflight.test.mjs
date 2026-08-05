import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  loadMcpPreflightSecret,
  REQUIRED_MCP_TOOLS,
  resolveMcpEndpoint,
  runMcpEvidencePreflight,
  validateMcpEndpoint,
} from '../tools/controlled-live-harness/runner.mjs';

const endpoint = 'https://mcp.example.test/mcp';
const token = 'mcp-preflight-token-with-sufficient-entropy-123456';
const publicAddresses = Object.freeze([
  Object.freeze({ address: '93.184.216.34', family: 4 }),
  Object.freeze({ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }),
]);
const resolvePublic = async () => publicAddresses;

function secret(values = { DNSOPS_MCP_ENDPOINT: endpoint, DNSOPS_MCP_BEARER_TOKEN: token }) {
  const path = join(mkdtempSync(join(tmpdir(), 'dnsops-mcp-')), 'mcp-preflight.env');
  writeFileSync(
    path,
    `${Object.entries(values)
      .map(([name, value]) => `export ${name}='${value}'`)
      .join('\n')}\n`,
    { mode: 0o600 }
  );
  chmodSync(path, 0o600);
  return path;
}

function rpcResponse(id, result) {
  return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id, result }) };
}

function discoveryFetch(tools = REQUIRED_MCP_TOOLS) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const request = JSON.parse(init.body);
      if (request.method === 'initialize') {
        return rpcResponse(request.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
        });
      }
      if (request.method === 'tools/list') {
        return rpcResponse(request.id, {
          tools: tools.map(([name, requiredScope]) => ({ name, requiredScope })),
        });
      }
      throw new Error('unexpected JSON-RPC method');
    },
  };
}

test('MCP evidence preflight initializes, discovers the complete scoped contract, and publishes redacted evidence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const artifactPath = join(directory, 'preflight.json');
  const mocked = discoveryFetch();

  const artifact = await runMcpEvidencePreflight({
    secretFile: secret(),
    artifactPath,
    fetchImpl: mocked.fetch,
    resolveHostname: resolvePublic,
  });

  assert.equal(artifact.status, 'MCP_EVIDENCE_PREFLIGHT_OK');
  assert.equal(mocked.calls.length, 2);
  assert.deepEqual(
    mocked.calls.map(({ init }) => JSON.parse(init.body).method),
    ['initialize', 'tools/list']
  );
  assert.deepEqual(
    mocked.calls.map(({ init }) => init.headers.Authorization),
    [`Bearer ${token}`, `Bearer ${token}`]
  );
  assert.equal(mocked.calls[0].url.toString(), endpoint);
  for (const { init } of mocked.calls) {
    assert.equal(typeof init.lookup, 'function');
    await new Promise((resolve, reject) =>
      init.lookup('mcp.example.test', { family: 0 }, (error, address, family) => {
        if (error) reject(error);
        else {
          assert.ok(publicAddresses.some((entry) => entry.address === address));
          assert.ok([4, 6].includes(family));
          resolve();
        }
      })
    );
  }
  assert.equal(statSync(artifactPath).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(readFileSync(artifactPath, 'utf8')), artifact);
  const emitted = JSON.stringify(artifact);
  assert.doesNotMatch(emitted, new RegExp(token));
  assert.doesNotMatch(emitted, /mcp\.example\.test/);
  assert.doesNotMatch(emitted, /Bearer|authorization/i);
});

test('MCP evidence preflight rejects a missing artifact path before reading its secret', () => {
  const runner = fileURLToPath(
    new URL('../tools/controlled-live-harness/runner.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [runner, 'mcp-evidence-preflight'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires one output artifact path/);
  assert.doesNotMatch(result.stderr, /secret file/);
});

test('MCP evidence preflight rejects malformed secrets and unsafe endpoints without a request', async () => {
  const malformedFetch = discoveryFetch();
  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: secret({ DNSOPS_MCP_ENDPOINT: endpoint, OTHER_VALUE: token }),
      artifactPath: join(mkdtempSync(join(tmpdir(), 'dnsops-mcp-')), 'preflight.json'),
      fetchImpl: malformedFetch.fetch,
    }),
    /runtime secret file has invalid format/
  );
  assert.equal(malformedFetch.calls.length, 0);

  const unsafeFetch = discoveryFetch();
  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: secret({
        DNSOPS_MCP_ENDPOINT: 'http://127.0.0.1/mcp',
        DNSOPS_MCP_BEARER_TOKEN: token,
      }),
      artifactPath: join(mkdtempSync(join(tmpdir(), 'dnsops-mcp-')), 'preflight.json'),
      fetchImpl: unsafeFetch.fetch,
    }),
    /MCP endpoint is invalid/
  );
  assert.equal(unsafeFetch.calls.length, 0);
});

test('MCP evidence preflight rejects invalid artifact destinations before a request', async () => {
  const validSecret = secret();
  const mocked = discoveryFetch();
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const existing = join(directory, 'preflight.json');
  writeFileSync(existing, 'do not replace\n', { mode: 0o600 });

  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: validSecret,
      artifactPath: existing,
      fetchImpl: mocked.fetch,
    }),
    /already exists/
  );
  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: validSecret,
      artifactPath: join(directory, 'missing', 'preflight.json'),
      fetchImpl: mocked.fetch,
    }),
    /destination is invalid/
  );
  assert.equal(mocked.calls.length, 0);
  assert.equal(readFileSync(existing, 'utf8'), 'do not replace\n');
});

test('MCP evidence preflight fails closed and leaves no artifact when a required tool or scope is absent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const artifactPath = join(directory, 'preflight.json');
  const mocked = discoveryFetch(REQUIRED_MCP_TOOLS.filter(([name]) => name !== 'scan_request'));

  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: secret(),
      artifactPath,
      fetchImpl: mocked.fetch,
      resolveHostname: resolvePublic,
    }),
    /MCP tools\/list failed/
  );
  assert.equal(mocked.calls.length, 2);
  assert.equal(existsSync(artifactPath), false);
  assert.deepEqual(readdirSync(directory), []);
});

test('MCP evidence preflight rejects a wrong required scope without publishing an artifact', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const artifactPath = join(directory, 'preflight.json');
  const tools = REQUIRED_MCP_TOOLS.map(([name, requiredScope]) => [name, requiredScope]);
  tools.find(([name]) => name === 'case_get')[1] = 'CASE_WRITE';

  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: secret(),
      artifactPath,
      fetchImpl: discoveryFetch(tools).fetch,
      resolveHostname: resolvePublic,
    }),
    /MCP tools\/list failed/
  );
  assert.equal(existsSync(artifactPath), false);
});

test('MCP errors do not disclose a response body or bearer token', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const artifactPath = join(directory, 'preflight.json');
  const responseBody = `server response containing ${token}`;
  await assert.rejects(
    runMcpEvidencePreflight({
      secretFile: secret(),
      artifactPath,
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: responseBody }),
      }),
      resolveHostname: resolvePublic,
    }),
    (error) =>
      error instanceof Error &&
      /MCP initialize failed/.test(error.message) &&
      !error.message.includes(token) &&
      !error.message.includes(responseBody)
  );
  assert.equal(existsSync(artifactPath), false);
});

test('MCP endpoint resolution rejects every private, special, and mixed DNS answer before a request', async () => {
  const privateAnswers = [
    { address: '127.0.0.1', family: 4 },
    { address: '10.0.0.1', family: 4 },
    { address: '169.254.169.254', family: 4 },
    { address: '192.168.1.1', family: 4 },
    { address: '::1', family: 6 },
    { address: 'fd00::1', family: 6 },
    { address: 'fe80::1', family: 6 },
    { address: '2001:0db8::1', family: 6 },
  ];
  for (const answer of privateAnswers) {
    await assert.rejects(
      resolveMcpEndpoint(validateMcpEndpoint(endpoint), async () => [answer]),
      /MCP endpoint resolution failed/
    );
  }
  await assert.rejects(
    resolveMcpEndpoint(validateMcpEndpoint(endpoint), async () => [
      publicAddresses[0],
      privateAnswers[0],
    ]),
    /MCP endpoint resolution failed/
  );
});

test('MCP endpoint connection lookup is pinned to the vetted DNS answers', async () => {
  const resolved = await resolveMcpEndpoint(validateMcpEndpoint(endpoint), resolvePublic);
  await new Promise((resolve, reject) =>
    resolved.lookup('mcp.example.test', { family: 6 }, (error, address, family) => {
      if (error) reject(error);
      else {
        assert.equal(address, publicAddresses[1].address);
        assert.equal(family, 6);
        resolve();
      }
    })
  );
  await assert.rejects(
    new Promise((resolve, reject) =>
      resolved.lookup('rebound.example.test', { family: 0 }, (error) =>
        error ? reject(error) : resolve()
      )
    ),
    /lookup rejected/
  );
});

test('MCP preflight rejects a symlinked secret before parsing its target', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dnsops-mcp-'));
  const target = join(directory, 'target.env');
  writeFileSync(
    target,
    `export DNSOPS_MCP_ENDPOINT='${endpoint}'\nexport DNSOPS_MCP_BEARER_TOKEN='${token}'\n`,
    { mode: 0o600 }
  );
  chmodSync(target, 0o600);
  const link = join(directory, 'mcp-preflight.env');
  symlinkSync(target, link);
  assert.throws(() => loadMcpPreflightSecret(link), /MCP preflight secret file is invalid/);
});

test('MCP endpoint validation permits only a public HTTPS /mcp URL', () => {
  assert.equal(validateMcpEndpoint(endpoint).toString(), endpoint);
  for (const unsafe of [
    'https://localhost/mcp',
    'https://127.0.0.1/mcp',
    'https://[::1]/mcp',
    'https://mcp.example.test:444/mcp',
    'https://mcp.example.test/not-mcp',
    'https://user:pass@mcp.example.test/mcp',
    'https://mcp.example.test/mcp?token=leak',
  ])
    assert.throws(() => validateMcpEndpoint(unsafe), /MCP endpoint is invalid/);
});
