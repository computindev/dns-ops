/**
 * DNSSEC DNS Resolver - DNS-002
 *
 * Provides DNSKEY and DS query support using dns-packet library.
 * Node.js native dns module doesn't support these record types.
 */

import { DNS_RCODE } from '@dns-ops/contracts';
import * as dnsPacket from 'dns-packet';
import type { DNSAnswer, DNSQuery } from './types.js';

/**
 * DNS record types supported by dns-packet
 */
const DNS_TYPES: Record<string, number> = {
  DNSKEY: 48,
  DS: 43,
  RRSIG: 46,
  NSEC: 47,
  NSEC3: 50,
  NSEC3PARAM: 51,
  TLSA: 52,
  CDS: 59,
  CDNSKEY: 60,
};

/**
 * Default DNS servers for recursive queries
 */
const DEFAULT_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

/**
 * dns-packet decodes the response code as a string name ('NOERROR', 'NXDOMAIN',
 * ...). Map to the numeric DNS_RCODE values the rest of the codebase uses.
 */
const RCODE_NAME_TO_NUMBER: Record<string, number> = {
  NOERROR: DNS_RCODE.NOERROR,
  FORMERR: DNS_RCODE.FORMERR,
  SERVFAIL: DNS_RCODE.SERVFAIL,
  NXDOMAIN: DNS_RCODE.NXDOMAIN,
  NOTIMP: DNS_RCODE.NOTIMP,
  REFUSED: DNS_RCODE.REFUSED,
};

/**
 * Decoded DNS response sections shared by queryWithDnsPacket and decodeDnsResponse.
 */
export interface DnsResponseSections {
  answers: DNSAnswer[];
  authority: DNSAnswer[];
  additional: DNSAnswer[];
  flags: {
    aa: boolean;
    tc: boolean;
    rd: boolean;
    ra: boolean;
    ad: boolean;
    cd: boolean;
  };
  responseCode: number;
}

/**
 * Perform a DNS query using raw packet exchange.
 *
 * This is the only way to obtain real answer TTLs for record types whose TTLs
 * Node.js's high-level dns API hides (MX/TXT/NS/CNAME/SOA/CAA), and to query
 * types Node does not support at all (DNSKEY/DS). Encodes a query, sends it via
 * sendDnsQuery (UDP with TCP fallback), then decodes the wire response.
 */
export async function queryWithDnsPacket(
  query: DNSQuery,
  dnsServer: string = DEFAULT_DNS_SERVERS[0]
): Promise<DnsResponseSections> {
  const packetOut = dnsPacket.encode({
    type: 'query',
    id: Math.floor(Math.random() * 0xffff),
    flags: dnsPacket.RECURSION_DESIRED as number,
    questions: [
      {
        type: DNS_TYPES[query.type] || query.type,
        name: query.name,
        class: 'IN',
      },
    ],
  });

  const response = await sendDnsQuery(packetOut, dnsServer, 53);
  return decodeDnsResponse(response, query.type);
}

/**
 * Decode a raw DNS wire-format response into typed sections.
 *
 * Pure (no I/O) so it can be unit-tested with dns-packet-encoded fixtures.
 * Answer records carry the real TTL from the wire and are formatted per the
 * requested queryType to match the string shapes downstream consumers expect
 * (e.g. TXT -> joined string for SPF/DMARC matching). Authority/additional
 * records preserve their real TTL and are formatted generically since their
 * record types vary (e.g. SOA in a negative-response authority section).
 */
export function decodeDnsResponse(response: Buffer, queryType: string): DnsResponseSections {
  const packetIn = dnsPacket.decode(response) as {
    flags?: number;
    rcode?: number | string;
    answers?: DecodedRecord[];
    authorities?: DecodedRecord[];
    additionals?: DecodedRecord[];
  };

  const flags = packetIn.flags || 0;

  const answers: DNSAnswer[] = (packetIn.answers || []).map((r) => ({
    name: String(r.name || ''),
    type: queryType,
    ttl: Number(r.ttl || 0),
    data: formatRecordData(r.data, queryType),
  }));

  const mapOther = (records: DecodedRecord[] | undefined): DNSAnswer[] =>
    (records || []).map((r) => ({
      name: String(r.name || ''),
      type: String(r.type ?? queryType),
      ttl: Number(r.ttl || 0),
      data: bufferToString(r.data),
    }));

  return {
    answers,
    authority: mapOther(packetIn.authorities),
    additional: mapOther(packetIn.additionals),
    flags: {
      aa: !!(flags & (dnsPacket.AUTHORITATIVE_ANSWER as number)),
      tc: !!(flags & (dnsPacket.TRUNCATED_RESPONSE as number)),
      rd: !!(flags & (dnsPacket.RECURSION_DESIRED as number)),
      ra: !!(flags & (dnsPacket.RECURSION_AVAILABLE as number)),
      ad: !!(flags & (dnsPacket.AUTHENTICATED_DATA as number)),
      cd: !!(flags & (dnsPacket.CHECKING_DISABLED as number)),
    },
    responseCode:
      typeof packetIn.rcode === 'number'
        ? packetIn.rcode
        : (RCODE_NAME_TO_NUMBER[packetIn.rcode ?? 'NOERROR'] ?? DNS_RCODE.SERVFAIL),
  };
}

interface DecodedRecord {
  name?: string;
  type?: string | number;
  ttl?: number;
  data?: unknown;
}

/**
 * Stringify a dns-packet data value that has no type-specific formatter.
 */
function bufferToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return JSON.stringify(value);
}

/**
 * Format record data based on the requested query type.
 */
function formatRecordData(data: unknown, queryType: string): string {
  switch (queryType) {
    case 'MX':
      return formatMx(data);
    case 'TXT':
      return formatTxt(data);
    case 'SOA':
      return formatSoa(data);
    case 'CAA':
      return formatCaa(data);
    case 'DNSKEY':
      return formatDnskey(data);
    case 'DS':
      return formatDs(data);
    case 'NS':
    case 'CNAME':
    case 'PTR':
      return bufferToString(data);
    default:
      return bufferToString(data);
  }
}

/**
 * TXT: dns-packet decodes data as an array of Buffer chunks (one per
 * <character-string>). Concatenate them to match Node's resolveTxt behaviour
 * of joining a record's strings into a single value.
 */
function formatTxt(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map((chunk) => bufferToString(chunk)).join('');
  }
  return bufferToString(data);
}

/**
 * MX: dns-packet decodes data as { exchange, preference } (RFC 1035 PREFERENCE).
 * Node names the same field `priority`; accept either for safety.
 */
function formatMx(data: unknown): string {
  if (data && typeof data === 'object') {
    const mx = data as { preference?: number; priority?: number; exchange?: string };
    const pref = mx.preference ?? mx.priority ?? 0;
    return `${pref} ${mx.exchange ?? ''}`;
  }
  return bufferToString(data);
}

/** SOA: dns-packet decodes data as the seven RDATA fields. */
function formatSoa(data: unknown): string {
  if (data && typeof data === 'object') {
    const soa = data as {
      mname?: string;
      rname?: string;
      serial?: number;
      refresh?: number;
      retry?: number;
      expire?: number;
      minimum?: number;
    };
    return `${soa.mname ?? ''} ${soa.rname ?? ''} ${soa.serial ?? 0} ${soa.refresh ?? 0} ${soa.retry ?? 0} ${soa.expire ?? 0} ${soa.minimum ?? 0}`;
  }
  return bufferToString(data);
}

/** CAA: dns-packet decodes data as { critical/flag, tag, value }. */
function formatCaa(data: unknown): string {
  if (data && typeof data === 'object') {
    const caa = data as {
      critical?: number;
      flag?: number;
      issue?: string;
      tag?: string;
      value?: string;
    };
    const critical = caa.critical ?? caa.flag ?? 0;
    const tag = caa.issue ?? caa.tag ?? '';
    const value = caa.value ?? '';
    return `${critical} ${tag} "${value}"`;
  }
  return bufferToString(data);
}

/** DNSKEY: public key bytes, base64-encoded. */
function formatDnskey(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('base64');
  return JSON.stringify(data);
}

/** DS: digest bytes, hex-encoded. */
function formatDs(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('hex');
  return JSON.stringify(data);
}

/**
 * Send DNS query over UDP with TCP fallback for truncated responses
 */
async function sendDnsQuery(
  packet: Buffer,
  server: string,
  port: number,
  options: { timeoutMs?: number; fallbackToTcp?: boolean } = {}
): Promise<Buffer> {
  const { timeoutMs = 5000, fallbackToTcp = true } = options;

  return new Promise((resolve, reject) => {
    const dgram = require('node:dgram');
    const client = dgram.createSocket('udp4');

    const timeout = setTimeout(() => {
      client.close();
      reject(new Error('DNS query timeout'));
    }, timeoutMs);

    client.on('message', (msg: Buffer) => {
      clearTimeout(timeout);

      // Check if response is truncated (TC flag in DNS header)
      // TC flag is in byte 2, bit 1 (0x02)
      const flags = msg[2];
      const isTruncated = (flags & 0x02) !== 0;

      if (isTruncated && fallbackToTcp) {
        // Retry over TCP
        client.close();
        sendDnsQueryTcp(packet, server, port, timeoutMs).then(resolve).catch(reject);
      } else {
        client.close();
        resolve(msg);
      }
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      client.close();
      reject(err);
    });

    client.send(packet, 0, packet.length, port, server);
  });
}

/**
 * Send DNS query over TCP
 * TCP DNS uses a 2-byte length prefix before the DNS packet
 */
async function sendDnsQueryTcp(
  packet: Buffer,
  server: string,
  port: number,
  timeoutMs: number = 5000
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const net = require('node:net');
    const client = new net.Socket();

    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('DNS TCP query timeout'));
    }, timeoutMs);

    client.on('connect', () => {
      // Send 2-byte length prefix followed by DNS packet
      const lengthBuffer = Buffer.alloc(2);
      lengthBuffer.writeUInt16BE(packet.length, 0);
      client.write(Buffer.concat([lengthBuffer, packet]));
    });

    client.on('data', (data: Buffer) => {
      clearTimeout(timeout);
      client.destroy();

      // Parse response: first 2 bytes are length, rest is DNS packet
      if (data.length < 2) {
        reject(new Error('Invalid TCP DNS response: too short'));
        return;
      }

      const responseLength = data.readUInt16BE(0);
      const dnsResponse = data.slice(2);

      if (dnsResponse.length < responseLength) {
        // Handle case where data comes in multiple chunks
        // For simplicity, return what we have - full response handling would need buffering
        resolve(dnsResponse);
      } else {
        resolve(dnsResponse);
      }
    });

    client.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });

    client.connect(port, server);
  });
}

/**
 * Query DNSKEY records for a domain
 */
export async function queryDNSKEY(domain: string): Promise<{
  success: boolean;
  answers: DNSAnswer[];
  error?: string;
}> {
  if (!domain) {
    return { success: false, answers: [], error: 'Domain is required' };
  }

  try {
    const result = await queryWithDnsPacket({ name: domain, type: 'DNSKEY' });

    if (result.responseCode !== DNS_RCODE.NOERROR) {
      return {
        success: false,
        answers: [],
        error: `DNSKEY query failed with code: ${result.responseCode}`,
      };
    }

    return {
      success: true,
      answers: result.answers,
    };
  } catch (error) {
    return {
      success: false,
      answers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Query DS records for a domain (from parent zone)
 */
export async function queryDS(domain: string): Promise<{
  success: boolean;
  answers: DNSAnswer[];
  error?: string;
}> {
  if (!domain) {
    return { success: false, answers: [], error: 'Domain is required' };
  }

  try {
    const result = await queryWithDnsPacket({ name: domain, type: 'DS' });

    if (result.responseCode !== DNS_RCODE.NOERROR) {
      return {
        success: false,
        answers: [],
        error: `DS query failed with code: ${result.responseCode}`,
      };
    }

    return {
      success: true,
      answers: result.answers,
    };
  } catch (error) {
    return {
      success: false,
      answers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
