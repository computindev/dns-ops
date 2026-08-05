#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const RAILWAY_SCOPE = Object.freeze({
  projectId: '0e240f31-311a-4140-9dbf-c18c485d9820',
  environmentId: 'e6c3a4d7-2cce-4e2a-8d81-9b7e433dcd1d',
  serviceId: '4197eca1-a820-4f2f-8706-46cba7a0740d',
  domains: Object.freeze([
    Object.freeze({
      id: '110e3e42-141b-4f3a-9328-3a6dff4b9851',
      name: 'asorin.ai',
      verificationHost: '_railway-verify',
      environmentVariable: 'RAILWAY_ASORIN_AI_VERIFICATION_TXT',
    }),
    Object.freeze({
      id: 'efe59266-2b4a-476b-b189-f5e660ac8da8',
      name: 'www.asorin.ai',
      verificationHost: '_railway-verify.www',
      environmentVariable: 'RAILWAY_WWW_ASORIN_AI_VERIFICATION_TXT',
    }),
  ]),
});

const fail = (message) => {
  throw new Error(`Railway verification-secret provisioner: ${message}`);
};

function scopedDomainStatusArgs(domain) {
  return [
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
  ];
}

function requiredString(object, fields, label) {
  const values = fields
    .filter((field) => Object.hasOwn(object, field))
    .map((field) => object[field]);
  if (
    values.length === 0 ||
    values.some((value) => typeof value !== 'string' || value.length === 0)
  )
    fail(`${label} is missing or invalid`);
  if (new Set(values).size !== 1) fail(`${label} is ambiguous`);
  return values[0];
}

function parseDomainStatus(raw, domain) {
  let status;
  try {
    status = JSON.parse(raw);
  } catch {
    fail(`Railway returned invalid JSON for ${domain.name}`);
  }
  if (!status || typeof status !== 'object' || Array.isArray(status))
    fail(`Railway returned invalid status for ${domain.name}`);
  if (requiredString(status, ['id', 'domainId'], `${domain.name} domain ID`) !== domain.id)
    fail(`Railway returned an unexpected domain ID for ${domain.name}`);
  if (requiredString(status, ['domain', 'name'], `${domain.name} domain name`) !== domain.name)
    fail(`Railway returned an unexpected domain name for ${domain.name}`);
  if (!Array.isArray(status.dnsRecords)) fail(`${domain.name} status has no DNS records`);

  const verificationRecords = status.dnsRecords.filter((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || record.type !== 'TXT')
      return false;
    const host = [record.host, record.name].filter((value) => typeof value === 'string');
    return host.length > 0 && host.every((value) => value === domain.verificationHost);
  });
  if (verificationRecords.length !== 1)
    fail(`${domain.name} status must contain exactly one TXT verification record`);

  const token = requiredString(
    verificationRecords[0],
    ['value', 'content'],
    `${domain.name} verification token`
  );
  if (!/^[^'\r\n]+$/.test(token))
    fail(`${domain.name} verification token is not safe for the secret file`);
  return token;
}

function envFileContents(tokens) {
  return `${RAILWAY_SCOPE.domains
    .map((domain) => `export ${domain.environmentVariable}='${tokens[domain.environmentVariable]}'`)
    .join('\n')}\n`;
}

function defaultExecute(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail('scoped Railway domain-status query failed');
  }
}

function isAlreadyExists(error) {
  return error && typeof error === 'object' && error.code === 'EEXIST';
}

/**
 * Queries only the two pinned Railway domain IDs and writes the harness's local secret file.
 * The injected seams keep tests offline; production uses Railway CLI and the Node filesystem.
 */
export function provisionRailwayVerificationSecret({
  replace = false,
  outputPath = resolve(process.env.HOME ?? '', '.config/dns-ops/railway-verification.env'),
  execute = defaultExecute,
  fs = { mkdirSync, writeFileSync, chmodSync, existsSync, linkSync, renameSync, unlinkSync },
  temporaryName = (path) => `${path}.${process.pid}.tmp`,
} = {}) {
  if (typeof replace !== 'boolean') fail('replace must be a boolean');
  if (typeof outputPath !== 'string' || outputPath.length === 0) fail('output path is invalid');
  const path = resolve(outputPath);
  const temporaryPath = temporaryName(path);
  if (typeof temporaryPath !== 'string' || resolve(temporaryPath) === path)
    fail('temporary path is invalid');

  if (!replace && fs.existsSync(path))
    fail('refusing to overwrite existing secret file without --replace');

  const tokens = {};
  for (const domain of RAILWAY_SCOPE.domains) {
    const output = execute('railway', scopedDomainStatusArgs(domain));
    if (typeof output !== 'string') fail(`Railway returned invalid output for ${domain.name}`);
    tokens[domain.environmentVariable] = parseDomainStatus(output, domain);
  }

  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(temporaryPath, envFileContents(tokens), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    fs.chmodSync(temporaryPath, 0o600);
    if (replace) fs.renameSync(temporaryPath, path);
    else {
      try {
        fs.linkSync(temporaryPath, path);
      } catch (error) {
        if (isAlreadyExists(error))
          fail('refusing to overwrite existing secret file without --replace');
        throw error;
      }
      fs.unlinkSync(temporaryPath);
    }
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (!isAlreadyExists(cleanupError) && cleanupError?.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
  return Object.freeze({ status: 'RAILWAY_VERIFICATION_SECRET_WRITTEN', outputPath: path });
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--replace'))
    fail('usage: railway-verification-secret-provisioner.mjs [--replace]');
  if (args.filter((arg) => arg === '--replace').length > 1)
    fail('usage: railway-verification-secret-provisioner.mjs [--replace]');
  const result = provisionRailwayVerificationSecret({ replace: args.includes('--replace') });
  console.log(JSON.stringify(result));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
