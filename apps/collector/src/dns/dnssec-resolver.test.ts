/**
 * DNSSEC DNS Resolver Tests - DNS-002
 *
 * Network-free unit coverage for encode/transport contracts. Live public-DNS
 * checks live under e2e / test:live-dns, not here.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dnsPacket from 'dns-packet';
import { build as esbuildBuild } from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeDnsQuery, queryDNSKEY, queryDS, queryWithDnsPacket } from './dnssec-resolver.js';

const here = dirname(fileURLToPath(import.meta.url));
const collectorRoot = join(here, '../..');
const esmProofDir = join(collectorRoot, 'dist', 'rt1-esm-proof');

function encodeAResponse(queryBuf: Buffer, ip: string): Buffer {
  const query = dnsPacket.decode(queryBuf);
  return dnsPacket.encode({
    type: 'response',
    id: query.id,
    flags: (dnsPacket.RECURSION_DESIRED as number) | (dnsPacket.RECURSION_AVAILABLE as number),
    questions: query.questions,
    answers: [
      {
        name: query.questions?.[0]?.name ?? 'example.com',
        type: 'A',
        class: 'IN',
        ttl: 60,
        data: ip,
      },
    ],
  });
}

afterAll(async () => {
  await rm(esmProofDir, { recursive: true, force: true });
});

describe('DNSSEC DNS Resolver', () => {
  describe('record-type encoding for dns-packet', () => {
    it('encodes DNSKEY with a string RR type (numeric 48 is rejected by dns-packet)', () => {
      // Ground truth: dns-packet throws on numeric type codes.
      expect(() =>
        dnsPacket.encode({
          type: 'query',
          id: 1,
          questions: [{ type: 48 as unknown as string, name: 'example.com', class: 'IN' }],
        })
      ).toThrow(/toUpperCase/);

      const buf = encodeDnsQuery({ name: 'example.com', type: 'DNSKEY' });
      expect(dnsPacket.decode(buf).questions?.[0]?.type).toBe('DNSKEY');
    });

    it('encodes DS with a string RR type (numeric 43 is rejected by dns-packet)', () => {
      expect(() =>
        dnsPacket.encode({
          type: 'query',
          id: 1,
          questions: [{ type: 43 as unknown as string, name: 'example.com', class: 'IN' }],
        })
      ).toThrow(/toUpperCase/);

      const buf = encodeDnsQuery({ name: 'example.com', type: 'DS' });
      expect(dnsPacket.decode(buf).questions?.[0]?.type).toBe('DS');
    });
  });

  describe('ESM transport regression (no public DNS)', () => {
    it('A query reaches injected transport and decodes the response', async () => {
      const reached: Array<{ server: string; port: number; type: string | undefined }> = [];

      const result = await queryWithDnsPacket({ name: 'example.com', type: 'A' }, '127.0.0.1', {
        transport: async (packet, server, port) => {
          const decoded = dnsPacket.decode(packet);
          reached.push({
            server,
            port,
            type: decoded.questions?.[0]?.type ? String(decoded.questions[0].type) : undefined,
          });
          return encodeAResponse(packet, '93.184.216.34');
        },
      });

      expect(reached).toEqual([{ server: '127.0.0.1', port: 53, type: 'A' }]);
      expect(result.responseCode).toBe(0);
      expect(result.answers).toEqual([
        expect.objectContaining({
          name: 'example.com',
          type: 'A',
          ttl: 60,
          data: '93.184.216.34',
        }),
      ]);
    });

    it('compiled ESM build reaches transport without require()', async () => {
      // Emit the resolver as plain Node ESM under the package tree so workspace
      // deps resolve, then execute it with stock Node (no vitest loader). A
      // leftover require('node:dgram') becomes __require and throws under ESM.
      await mkdir(esmProofDir, { recursive: true });
      const outfile = join(esmProofDir, 'dnssec-resolver.mjs');
      const harnessFile = join(esmProofDir, 'harness.mjs');

      await esbuildBuild({
        absWorkingDir: collectorRoot,
        entryPoints: [join(here, 'dnssec-resolver.ts')],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        packages: 'external',
        write: true,
      });

      const emitted = await readFile(outfile, 'utf8');
      expect(emitted).toMatch(/from\s+["']node:dgram["']/);
      expect(emitted).toMatch(/from\s+["']node:net["']/);
      expect(emitted).not.toMatch(/require\(\s*["']node:dgram["']\s*\)/);
      expect(emitted).not.toMatch(/__require\(\s*["']node:dgram["']\s*\)/);

      await writeFile(
        harnessFile,
        `import * as dnsPacket from 'dns-packet';
import { queryWithDnsPacket } from './dnssec-resolver.mjs';

const reached = [];
const result = await queryWithDnsPacket(
  { name: 'example.com', type: 'A' },
  '192.0.2.1',
  {
    transport: async (packet, server, port) => {
      const q = dnsPacket.decode(packet);
      reached.push(\`\${server}:\${port}:\${q.questions?.[0]?.type}\`);
      return dnsPacket.encode({
        type: 'response',
        id: q.id,
        flags: dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE,
        questions: q.questions,
        answers: [{
          name: 'example.com',
          type: 'A',
          class: 'IN',
          ttl: 60,
          data: '198.51.100.10',
        }],
      });
    },
  }
);

if (reached.join() !== '192.0.2.1:53:A') {
  throw new Error('transport not reached: ' + JSON.stringify(reached));
}
if (result.answers?.[0]?.data !== '198.51.100.10') {
  throw new Error('bad answer: ' + JSON.stringify(result.answers));
}
`
      );

      const run = spawnSync(process.execPath, [harnessFile], {
        cwd: collectorRoot,
        encoding: 'utf8',
      });

      expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid domain gracefully', async () => {
      const result = await queryDNSKEY('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain is required');
    });

    it('should handle invalid domain for DS gracefully', async () => {
      const result = await queryDS('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain is required');
    });
  });
});
