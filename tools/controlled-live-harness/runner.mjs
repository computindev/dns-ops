#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import {
  chmodSync,
  closeSync,
  fchmodSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { domainToASCII, fileURLToPath } from 'node:url';
import {
  createCloudflareAdapter,
  fingerprint,
  policyFromCloudflareManifest,
  validateCloudflareManifest,
} from './cloudflare-adapter.mjs';
import {
  createFixtureControlAdapter,
  validateFixtureRecoveryArtifact,
} from './fixture-control.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_MANIFEST = resolve(
  ROOT,
  'docs/domain-operations/evidence/gate-3/asorin-live-mutation-manifest.json'
);
const fail = (message) => {
  throw new Error(`controlled-live harness: ${message}`);
};

const MCP_PREFLIGHT_SECRET_NAMES = ['DNSOPS_MCP_ENDPOINT', 'DNSOPS_MCP_BEARER_TOKEN'];
const REQUIRED_MCP_TOOLS = Object.freeze([
  ['domain_search', 'DOMAIN_READ'],
  ['domain_get_profile', 'DOMAIN_READ'],
  ['domain_get_posture', 'DOMAIN_READ'],
  ['snapshot_compare', 'DOMAIN_READ'],
  ['evidence_get', 'DOMAIN_READ'],
  ['signal_list', 'SIGNAL_READ'],
  ['case_get', 'CASE_READ'],
  ['case_open', 'CASE_WRITE'],
  ['case_set_disposition', 'CASE_WRITE'],
  ['scan_request', 'SCAN_REQUEST'],
]);
const MCP_PROTOCOL_VERSION = '2024-11-05';

function safeMcpFailure(operation) {
  fail(`MCP ${operation} failed`);
}

/** Validates the remote MCP target without resolving or contacting it. */
export function validateMcpEndpoint(value) {
  if (typeof value !== 'string' || !value) fail('MCP endpoint is invalid');
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    fail('MCP endpoint is invalid');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== '/mcp' ||
    endpoint.search ||
    endpoint.hash
  )
    fail('MCP endpoint is invalid');

  const hostname = endpoint.hostname.toLowerCase();
  const asciiHostname = domainToASCII(hostname);
  if (
    !asciiHostname ||
    hostname !== asciiHostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^[0-9.]+$/.test(hostname) ||
    hostname.includes(':') ||
    hostname.length > 253 ||
    !hostname.includes('.') ||
    hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    fail('MCP endpoint is invalid');
  return endpoint;
}

/**
 * Opens an operator secret once, without following its final path component.
 * Its metadata and content are then read from that same descriptor, so a
 * rename after open cannot replace the value that was validated.
 */
function readProtectedSecretFile(path, modeFailure) {
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') fail('runtime secret file is invalid');
    fail('runtime secret file is unavailable');
  }
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) fail('runtime secret file is invalid');
    if ((metadata.mode & 0o777) !== 0o600) fail(modeFailure);
    return readFileSync(descriptor, 'utf8');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('controlled-live harness:')) throw error;
    fail('runtime secret file is unavailable');
  } finally {
    closeSync(descriptor);
  }
}

/** Reads the explicitly supplied, isolated MCP runtime secret. */
export function loadMcpPreflightSecret(path) {
  if (!path || typeof path !== 'string' || !isAbsolute(path))
    fail('MCP preflight requires an explicit secret file path');
  let contents;
  try {
    contents = readProtectedSecretFile(path, 'runtime secret file must be mode 600');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'controlled-live harness: runtime secret file is invalid'
    )
      fail('MCP preflight secret file is invalid');
    if (
      error instanceof Error &&
      error.message === 'controlled-live harness: runtime secret file is unavailable'
    )
      fail('MCP preflight secret file is unavailable');
    throw error;
  }
  const values = parseProtectedValues(contents, MCP_PREFLIGHT_SECRET_NAMES);
  if (!/^[A-Za-z0-9_-]{32,}$/.test(values.DNSOPS_MCP_BEARER_TOKEN))
    fail('MCP preflight bearer token is invalid');
  return Object.freeze({
    endpoint: validateMcpEndpoint(values.DNSOPS_MCP_ENDPOINT),
    token: values.DNSOPS_MCP_BEARER_TOKEN,
  });
}

function validJsonRpcResult(value, id) {
  return (
    value &&
    typeof value === 'object' &&
    value.jsonrpc === '2.0' &&
    value.id === id &&
    value.error === undefined &&
    value.result !== undefined
  );
}

// Conservative denylist for the complete IANA IPv4 Special-Purpose Address
// Registry plus multicast. Entries covering a smaller registered allocation
// deliberately deny their entire enclosing prefix; this avoids exceptions that
// could become unsafe when the registry changes. IPv6 is not accepted until a
// comparably maintained complete policy is available.
const NON_GLOBAL_IPV4_CIDRS = Object.freeze([
  ['0.0.0.0', 8], // "This network"
  ['10.0.0.0', 8], // Private-use
  ['100.64.0.0', 10], // Shared address space
  ['127.0.0.0', 8], // Loopback
  ['169.254.0.0', 16], // Link local
  ['172.16.0.0', 12], // Private-use
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // Documentation
  ['192.31.196.0', 24], // AS112-v4
  ['192.52.193.0', 24], // AMT
  ['192.88.99.0', 24], // Deprecated 6to4 relay anycast
  ['192.168.0.0', 16], // Private-use
  ['192.175.48.0', 24], // Direct Delegation AS112 service
  ['198.18.0.0', 15], // Benchmarking
  ['198.51.100.0', 24], // Documentation
  ['203.0.113.0', 24], // Documentation
  ['224.0.0.0', 4], // Multicast
  ['240.0.0.0', 4], // Reserved, including limited broadcast
]);

function ipv4ToInteger(address) {
  return address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

const NON_GLOBAL_IPV4_NETWORKS = Object.freeze(
  NON_GLOBAL_IPV4_CIDRS.map(([network, prefix]) =>
    Object.freeze({ network: ipv4ToInteger(network), prefix })
  )
);

function ipv4IsPublic(address) {
  if (isIP(address) !== 4) return false;
  const value = ipv4ToInteger(address);
  return !NON_GLOBAL_IPV4_NETWORKS.some(({ network, prefix }) => {
    const blockSize = 2 ** (32 - prefix);
    return Math.floor(value / blockSize) === Math.floor(network / blockSize);
  });
}

export function isPublicMcpAddress(address) {
  // Do not permit IPv6 until it has an equivalently complete, maintained policy.
  return ipv4IsPublic(address);
}

/**
 * Resolves the endpoint once and rejects it unless every answer is public.
 * The returned lookup callback only returns these vetted answers, preventing
 * the TLS connection from performing a second, attacker-controlled lookup.
 */
export async function resolveMcpEndpoint(endpoint, resolveHostname = dns.lookup) {
  let addresses;
  try {
    addresses = await resolveHostname(endpoint.hostname, { all: true, verbatim: true });
  } catch {
    fail('MCP endpoint resolution failed');
  }
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some(
      (entry) =>
        !entry ||
        entry.family !== 4 ||
        typeof entry.address !== 'string' ||
        !isPublicMcpAddress(entry.address)
    )
  )
    fail('MCP endpoint resolution failed');

  const vettedAddresses = Object.freeze(
    addresses.map(({ address, family }) => Object.freeze({ address, family }))
  );
  let nextAddress = 0;
  const lookup = (hostname, options, callback) => {
    if (hostname !== endpoint.hostname) {
      callback(new Error('MCP endpoint lookup rejected'));
      return;
    }
    const requestedFamily = typeof options === 'object' ? options.family : 0;
    const candidates = vettedAddresses.filter(
      ({ family }) => !requestedFamily || family === requestedFamily
    );
    if (candidates.length === 0) {
      callback(new Error('MCP endpoint lookup rejected'));
      return;
    }
    if (options?.all) {
      callback(null, candidates);
      return;
    }
    const selected = candidates[nextAddress % candidates.length];
    nextAddress += 1;
    callback(null, selected.address, selected.family);
  };
  return Object.freeze({ endpoint, addresses: vettedAddresses, lookup });
}

/** Performs one HTTPS request using the vetted lookup supplied by resolveMcpEndpoint. */
async function pinnedHttpsFetch(endpoint, init) {
  return new Promise((resolveResponse, reject) => {
    const request = httpsRequest(
      endpoint,
      {
        method: init.method,
        headers: init.headers,
        lookup: init.lookup,
        servername: endpoint.hostname,
        agent: false,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolveResponse({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            json: async () => JSON.parse(body),
          });
        });
      }
    );
    request.on('error', reject);
    request.end(init.body);
  });
}

async function mcpRpc(fetchImpl, resolvedEndpoint, token, id, method, params) {
  let response;
  try {
    response = await fetchImpl(resolvedEndpoint.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      lookup: resolvedEndpoint.lookup,
    });
  } catch {
    safeMcpFailure(method);
  }
  if (!response || !response.ok || !Number.isInteger(response.status)) safeMcpFailure(method);
  let body;
  try {
    body = await response.json();
  } catch {
    safeMcpFailure(method);
  }
  if (!validJsonRpcResult(body, id)) safeMcpFailure(method);
  return Object.freeze({ result: body.result, status: response.status });
}

function verifyMcpDiscovery(initializeResult, toolsResult) {
  if (
    !initializeResult ||
    typeof initializeResult !== 'object' ||
    initializeResult.protocolVersion !== MCP_PROTOCOL_VERSION ||
    !initializeResult.capabilities ||
    typeof initializeResult.capabilities !== 'object' ||
    !initializeResult.capabilities.tools ||
    typeof initializeResult.capabilities.tools !== 'object'
  )
    safeMcpFailure('initialize');
  if (!toolsResult || typeof toolsResult !== 'object' || !Array.isArray(toolsResult.tools))
    safeMcpFailure('tools/list');

  const listed = new Map();
  for (const tool of toolsResult.tools) {
    if (
      !tool ||
      typeof tool !== 'object' ||
      typeof tool.name !== 'string' ||
      typeof tool.requiredScope !== 'string' ||
      listed.has(tool.name)
    )
      safeMcpFailure('tools/list');
    listed.set(tool.name, tool.requiredScope);
  }
  if (listed.size !== REQUIRED_MCP_TOOLS.length) safeMcpFailure('tools/list');
  for (const [name, scope] of REQUIRED_MCP_TOOLS) {
    if (listed.get(name) !== scope) safeMcpFailure('tools/list');
  }
}

/**
 * Performs MCP discovery only. It does not invoke an MCP tool or expose a
 * response body; the final artifact is atomically published only on success.
 */
export async function runMcpEvidencePreflight({
  secretFile,
  artifactPath,
  fetchImpl = pinnedHttpsFetch,
  resolveHostname = dns.lookup,
}) {
  const secret = loadMcpPreflightSecret(secretFile);
  const reservation = reserveFixtureArtifact(artifactPath);
  try {
    const resolvedEndpoint = await resolveMcpEndpoint(secret.endpoint, resolveHostname);
    const initialized = await mcpRpc(
      fetchImpl,
      resolvedEndpoint,
      secret.token,
      'dnsops-mcp-preflight-initialize',
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'dns-ops-controlled-live-harness', version: '1.0.0' },
      }
    );
    const tools = await mcpRpc(
      fetchImpl,
      resolvedEndpoint,
      secret.token,
      'dnsops-mcp-preflight-tools-list',
      'tools/list',
      {}
    );
    verifyMcpDiscovery(initialized.result, tools.result);
    const artifact = Object.freeze({
      kind: 'DNSOPS_MCP_EVIDENCE_PREFLIGHT',
      status: 'MCP_EVIDENCE_PREFLIGHT_OK',
      checkedAt: new Date().toISOString(),
      mcpEndpointFingerprint: fingerprint(secret.endpoint.toString()),
      protocolVersion: MCP_PROTOCOL_VERSION,
      verifiedToolScopes: REQUIRED_MCP_TOOLS.map(([name, requiredScope]) => ({
        name,
        requiredScope,
      })),
      rpcResponses: [`mcp.initialize: ${initialized.status}`, `mcp.tools_list: ${tools.status}`],
    });
    reservation.publish(artifact);
    return artifact;
  } catch (error) {
    reservation.discard();
    throw error;
  }
}

/** Reads the runtime secret only from this isolated harness process. */
export function protectedToken(path, name) {
  const contents = readProtectedSecretFile(path, `${name} secret file must be mode 600`);
  const match = contents.match(new RegExp(`^export ${name}='([^'\\n]+)'\\n?$`));
  if (!match) fail(`${name} secret file has invalid format`);
  return match[1];
}

function parseProtectedValues(contents, names) {
  if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length)
    fail('protected runtime value names are invalid');
  const lines = contents.split('\n');
  if (lines.at(-1) !== '') fail('runtime secret file has invalid format');
  lines.pop();
  if (lines.length !== names.length) fail('runtime secret file has invalid format');
  const expected = new Set(names);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^export ([A-Z][A-Z0-9_]*)='([^'\r\n]+)'$/);
    if (!match || !expected.has(match[1]) || Object.hasOwn(values, match[1]))
      fail('runtime secret file has invalid format');
    values[match[1]] = match[2];
  }
  if (Object.keys(values).length !== names.length) fail('runtime secret file has invalid format');
  return Object.freeze(values);
}

export function protectedValues(path, names) {
  return parseProtectedValues(
    readProtectedSecretFile(path, 'runtime secret file must be mode 600'),
    names
  );
}

export function loadManifest(path = DEFAULT_MANIFEST) {
  return validateCloudflareManifest(JSON.parse(readFileSync(path, 'utf8')));
}

export function policyFromManifest(manifest, token) {
  return policyFromCloudflareManifest(manifest, token).policy;
}

function readArtifact(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('artifact file must contain valid JSON');
  }
}

export function writeArtifact(path, artifact) {
  if (!path) fail('an output artifact path is required');
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * Reserves a fixture artifact destination before credentials or the fixture are
 * accessed. Publishing uses link(2), which atomically creates the final name
 * without replacing an output another process may have created meanwhile.
 */
export function reserveFixtureArtifact(path) {
  if (!path || typeof path !== 'string') fail('an output artifact path is required');
  const artifactPath = resolve(path);
  try {
    lstatSync(artifactPath);
    fail('output artifact path already exists');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('controlled-live harness:')) throw error;
    if (error?.code !== 'ENOENT') fail('output artifact destination is invalid');
  }

  let descriptor;
  let temporaryPath;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    temporaryPath = join(dirname(artifactPath), `.${randomBytes(16).toString('hex')}.tmp`);
    let candidate;
    try {
      candidate = openSync(temporaryPath, 'wx', 0o600);
      fchmodSync(candidate, 0o600);
      descriptor = candidate;
      break;
    } catch (error) {
      if (candidate !== undefined) {
        closeSync(candidate);
        unlinkSync(temporaryPath);
      }
      if (error?.code !== 'EEXIST') fail('output artifact destination is invalid');
    }
  }
  if (descriptor === undefined) fail('unable to reserve output artifact destination');

  let closed = false;
  let temporaryExists = true;
  const close = () => {
    if (!closed) {
      closeSync(descriptor);
      closed = true;
    }
  };
  const discard = () => {
    let cleanupError;
    try {
      close();
    } catch (error) {
      cleanupError = error;
    }
    if (temporaryExists) {
      try {
        unlinkSync(temporaryPath);
        temporaryExists = false;
      } catch (error) {
        if (error?.code === 'ENOENT') temporaryExists = false;
        else if (!cleanupError) cleanupError = error;
      }
    }
    if (cleanupError) throw cleanupError;
  };
  return Object.freeze({
    artifactPath,
    temporaryPath,
    publish(artifact) {
      try {
        writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
        fsyncSync(descriptor);
        close();
        linkSync(temporaryPath, artifactPath);
        unlinkSync(temporaryPath);
        temporaryExists = false;
      } catch (error) {
        discard();
        throw error;
      }
    },
    discard,
  });
}

export async function writeFixtureArtifactAfterTransition(path, transition) {
  const reservation = reserveFixtureArtifact(path);
  try {
    const artifact = await transition();
    reservation.publish(artifact);
    return artifact;
  } catch (error) {
    reservation.discard();
    throw error;
  }
}

async function main() {
  const command = process.argv[2] ?? 'status';
  if (
    ![
      'status',
      'preflight',
      'bootstrap',
      'apply',
      'restore',
      'web-preflight',
      'web-verify',
      'web-bootstrap',
      'fixture-apply',
      'fixture-restore',
      'mcp-evidence-preflight',
    ].includes(command)
  )
    fail('unsupported command');
  if (command === 'restore' && process.argv[5] !== undefined)
    fail('restore does not accept a caller-supplied completion evidence file');
  if (command === 'mcp-evidence-preflight') {
    if (!process.argv[3] || process.argv[4] !== undefined)
      fail('mcp-evidence-preflight requires one output artifact path before credential access');
    const artifact = await runMcpEvidencePreflight({
      secretFile: process.env.DNSOPS_MCP_PREFLIGHT_SECRET_FILE,
      artifactPath: process.argv[3],
    });
    console.log(
      JSON.stringify({
        status: artifact.status,
        artifactPath: process.argv[3],
        mcpEndpointFingerprint: artifact.mcpEndpointFingerprint,
      })
    );
    return;
  }
  if (['bootstrap', 'web-bootstrap'].includes(command) && !process.argv[3])
    fail(`${command} requires an output artifact path before provider access`);
  if (['apply', 'restore'].includes(command) && (!process.argv[3] || !process.argv[4]))
    fail(`${command} requires input and output artifact paths before provider access`);
  if (command === 'fixture-apply') {
    if (!['LIVE-01', 'LIVE-02'].includes(process.argv[3] ?? ''))
      fail(
        'fixture-apply requires an approved LIVE-01 or LIVE-02 mutation ID before credential access'
      );
    if (!process.argv[4] || process.argv[5] !== undefined)
      fail('fixture-apply requires one output artifact path before credential access');
  }
  if (command === 'fixture-restore') {
    if (!process.argv[3] || !process.argv[4] || process.argv[5] !== undefined)
      fail('fixture-restore requires input and output artifact paths before credential access');
  }
  const fixtureRecoveryArtifact =
    command === 'fixture-restore' ? readArtifact(process.argv[3]) : undefined;
  const manifest = loadManifest();
  if (command === 'fixture-restore')
    validateFixtureRecoveryArtifact(fixtureRecoveryArtifact, manifest);
  // Railway TXT values are resolved and validated before the Cloudflare client exists.
  const railwayVerificationValues = command.startsWith('web-')
    ? protectedValues(
        process.env.DNSOPS_RAILWAY_VERIFICATION_SECRET_FILE ??
          `${process.env.HOME}/.config/dns-ops/railway-verification.env`,
        ['RAILWAY_ASORIN_AI_VERIFICATION_TXT', 'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT']
      )
    : undefined;
  if (command === 'fixture-apply' || command === 'fixture-restore') {
    const artifact = await writeFixtureArtifactAfterTransition(process.argv[4], async () => {
      const token = protectedToken(
        process.env.DNSOPS_FIXTURE_CONTROL_SECRET_FILE ??
          `${process.env.HOME}/.config/dns-ops/fixture-control.env`,
        'DNSOPS_FIXTURE_CONTROL_TOKEN'
      );
      const adapter = createFixtureControlAdapter({ manifest, token });
      return command === 'fixture-apply'
        ? adapter.apply(process.argv[3])
        : adapter.restore(fixtureRecoveryArtifact);
    });
    console.log(
      JSON.stringify({
        status:
          command === 'fixture-apply'
            ? 'FIXTURE_RECOVERY_ARTIFACT_WRITTEN'
            : 'FIXTURE_RESTORE_ARTIFACT_WRITTEN',
        artifactPath: process.argv[4],
        runId: artifact.runId,
      })
    );
    return;
  }
  // Credential resolution is intentionally here rather than in DNS Ops/MCP or the adapter module.
  const token = protectedToken(
    process.env.DNSOPS_CLOUDFLARE_SECRET_FILE ??
      `${process.env.HOME}/.config/dns-ops/cloudflare-test.env`,
    'CLOUDFLARE_API_TOKEN'
  );
  if (command === 'status') {
    policyFromManifest(manifest, token);
    console.log(
      JSON.stringify({
        status: 'READY_FOR_PREFLIGHT_ONLY',
        manifestId: manifest.manifestId,
        zoneId: manifest.zoneId,
        providerCredentialFingerprint: manifest.providerCredentialFingerprint,
        allowlist: manifest.allowlist,
      })
    );
    return;
  }
  const adapter = createCloudflareAdapter({ manifest, token, railwayVerificationValues });
  if (command === 'web-preflight') {
    console.log(JSON.stringify(await adapter.webPreflight()));
    return;
  }
  if (command === 'web-verify') {
    console.log(JSON.stringify(await adapter.webVerify()));
    return;
  }
  if (command === 'web-bootstrap') {
    const artifact = await adapter.webBootstrap();
    writeArtifact(process.argv[3], artifact);
    console.log(
      JSON.stringify({
        status: 'WEB_BOOTSTRAP_ARTIFACT_WRITTEN',
        artifactPath: process.argv[3],
        baselineHash: artifact.baselineHash,
      })
    );
    return;
  }
  if (command === 'preflight') {
    console.log(JSON.stringify(await adapter.preflight()));
    return;
  }
  if (command === 'bootstrap') {
    const artifact = await adapter.bootstrap();
    writeArtifact(process.argv[3], artifact);
    console.log(
      JSON.stringify({
        status: 'BOOTSTRAP_ARTIFACT_WRITTEN',
        artifactPath: process.argv[3],
        baselineHash: artifact.baselineHash,
      })
    );
    return;
  }
  if (command === 'apply') {
    const artifact = await adapter.apply(readArtifact(process.argv[3]));
    writeArtifact(process.argv[4], artifact);
    console.log(
      JSON.stringify({
        status: 'RECOVERY_ARTIFACT_WRITTEN',
        artifactPath: process.argv[4],
        runId: artifact.runId,
      })
    );
    return;
  }
  const artifact = await adapter.restore(readArtifact(process.argv[3]));
  writeArtifact(process.argv[4], artifact);
  console.log(
    JSON.stringify({
      status: 'RESTORE_ARTIFACT_WRITTEN',
      artifactPath: process.argv[4],
      runId: artifact.runId,
    })
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export { fingerprint, REQUIRED_MCP_TOOLS };
