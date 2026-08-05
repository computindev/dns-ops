import assert from 'node:assert/strict';
import test from 'node:test';
import {
  provisionRailwayVerificationSecret,
  RAILWAY_SCOPE,
} from '../tools/controlled-live-harness/railway-verification-secret-provisioner.mjs';

const outputPath = '/home/operator/.config/dns-ops/railway-verification.env';
const token = Object.freeze({
  'asorin.ai': 'apex-verification-token',
  'www.asorin.ai': 'www-verification-token',
});

function railwayStatus(domain) {
  return JSON.stringify({
    id: domain.id,
    domain: domain.name,
    dnsRecords: [
      { host: domain.verificationHost, type: 'TXT', value: token[domain.name] },
      { host: '@', type: 'CNAME', value: 'ignored-by-provisioner.example' },
    ],
  });
}

function memoryFilesystem(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const calls = [];
  return {
    calls,
    files,
    mkdirSync(path, options) {
      calls.push({ operation: 'mkdir', path, options });
    },
    existsSync(path) {
      calls.push({ operation: 'exists', path });
      return files.has(path);
    },
    writeFileSync(path, content, options) {
      calls.push({ operation: 'write', path, content, options });
      if (options.flag === 'wx' && files.has(path)) {
        const error = new Error('exists');
        error.code = 'EEXIST';
        throw error;
      }
      files.set(path, content);
    },
    chmodSync(path, mode) {
      calls.push({ operation: 'chmod', path, mode });
    },
    linkSync(source, destination) {
      calls.push({ operation: 'link', source, destination });
      if (files.has(destination)) {
        const error = new Error('exists');
        error.code = 'EEXIST';
        throw error;
      }
      files.set(destination, files.get(source));
    },
    renameSync(source, destination) {
      calls.push({ operation: 'rename', source, destination });
      files.set(destination, files.get(source));
      files.delete(source);
    },
    unlinkSync(path) {
      calls.push({ operation: 'unlink', path });
      if (!files.delete(path)) {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      }
    },
  };
}

function mockedExecute(calls, statuses = RAILWAY_SCOPE.domains.map(railwayStatus)) {
  return (command, args) => {
    calls.push({ command, args });
    return statuses.shift();
  };
}

test('queries only the pinned Railway domain IDs with full scope and writes a mode-600 secret', () => {
  const cliCalls = [];
  const fs = memoryFilesystem();
  const result = provisionRailwayVerificationSecret({
    outputPath,
    execute: mockedExecute(cliCalls),
    fs,
    temporaryName: (path) => `${path}.test-tmp`,
  });

  assert.deepEqual(result, {
    status: 'RAILWAY_VERIFICATION_SECRET_WRITTEN',
    outputPath,
  });
  assert.deepEqual(
    cliCalls,
    RAILWAY_SCOPE.domains.map((domain) => ({
      command: 'railway',
      args: [
        'domain',
        'status',
        domain.id,
        '--project',
        RAILWAY_SCOPE.projectId,
        '--environment',
        RAILWAY_SCOPE.environmentId,
        '--service',
        RAILWAY_SCOPE.serviceId,
        '--json',
      ],
    }))
  );
  assert.equal(
    fs.files.get(outputPath),
    "export RAILWAY_ASORIN_AI_VERIFICATION_TXT='apex-verification-token'\nexport RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT='www-verification-token'\n"
  );
  assert.deepEqual(
    fs.calls.filter((call) => call.operation === 'chmod').map((call) => call.mode),
    [0o600]
  );
  assert.equal(
    fs.calls.some((call) => call.operation === 'rename'),
    false
  );
  assert.equal(
    fs.calls.some((call) => call.operation === 'link'),
    true
  );
  assert.doesNotMatch(JSON.stringify(result), /apex-verification-token|www-verification-token/);
});

test('refuses an existing secret without querying Railway and permits an explicit atomic replacement', () => {
  const fs = memoryFilesystem({ [outputPath]: 'old secret' });
  const cliCalls = [];
  assert.throws(
    () =>
      provisionRailwayVerificationSecret({
        outputPath,
        execute: mockedExecute(cliCalls),
        fs,
        temporaryName: (path) => `${path}.test-tmp`,
      }),
    /refusing to overwrite.*--replace/
  );
  assert.equal(cliCalls.length, 0);

  provisionRailwayVerificationSecret({
    replace: true,
    outputPath,
    execute: mockedExecute(cliCalls),
    fs,
    temporaryName: (path) => `${path}.test-tmp`,
  });
  assert.equal(
    fs.calls.some((call) => call.operation === 'rename'),
    true
  );
  assert.match(fs.files.get(outputPath), /RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT/);
});

test('rejects malformed or mismatched Railway status without writing a secret', () => {
  const fs = memoryFilesystem();
  const mismatched = railwayStatus(RAILWAY_SCOPE.domains[0]);
  const malformed = JSON.stringify({
    id: RAILWAY_SCOPE.domains[1].id,
    domain: RAILWAY_SCOPE.domains[1].name,
    dnsRecords: [
      { host: '_railway-verify.www', type: 'TXT', value: 'first' },
      { host: '_railway-verify.www', type: 'TXT', value: 'second' },
    ],
  });
  assert.throws(
    () =>
      provisionRailwayVerificationSecret({
        outputPath,
        execute: mockedExecute([], [mismatched, malformed]),
        fs,
        temporaryName: (path) => `${path}.test-tmp`,
      }),
    /must contain exactly one TXT verification record/
  );
  assert.equal(fs.files.has(outputPath), false);
});
