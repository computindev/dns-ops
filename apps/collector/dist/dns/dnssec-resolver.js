/**
 * DNSSEC DNS Resolver - DNS-002
 *
 * Provides DNSKEY and DS query support using dns-packet library.
 * Node.js native dns module doesn't support these record types.
 */
import { DNS_RCODE } from '@dns-ops/contracts';
import * as dnsPacket from 'dns-packet';
/**
 * DNS record types supported by dns-packet
 */
const DNS_TYPES = {
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
 * Perform a DNS query using raw packet exchange
 * This allows querying for record types not supported by Node.js dns module
 */
export async function queryWithDnsPacket(query, dnsServer = DEFAULT_DNS_SERVERS[0]) {
    const packetOut = dnsPacket.encode({
        type: 'query',
        id: Math.floor(Math.random() * 0xffff),
        flags: dnsPacket.RECURSION_DESIRED,
        questions: [
            {
                type: DNS_TYPES[query.type] || query.type,
                name: query.name,
                class: 'IN',
            },
        ],
    });
    // Send UDP query
    const response = await sendDnsQuery(packetOut, dnsServer, 53);
    // Parse response
    const packetIn = dnsPacket.decode(response);
    const flags = packetIn.flags || 0;
    // Extract answers
    const answers = (packetIn.answers || []).map((r) => ({
        name: String(r.name || ''),
        type: query.type,
        ttl: Number(r.ttl || 0),
        data: formatRecordData(r),
    }));
    // Extract authority records
    const authority = (packetIn.authority || []).map((r) => ({
        name: String(r.name || ''),
        type: query.type,
        ttl: Number(r.ttl || 0),
        data: formatRecordData(r),
    }));
    return {
        answers,
        authority,
        additional: [],
        flags: {
            aa: !!(flags & dnsPacket.AUTHORITATIVE_ANSWER),
            tc: !!(flags & dnsPacket.TRUNCATED_RESPONSE),
            rd: !!(flags & dnsPacket.RECURSION_DESIRED),
            ra: !!(flags & dnsPacket.RECURSION_AVAILABLE),
            ad: !!(flags & dnsPacket.AUTHENTICATED_DATA),
            cd: !!(flags & dnsPacket.CHECKING_DISABLED),
        },
        responseCode: packetIn.rcode || 0,
    };
}
/**
 * Format record data based on type
 */
function formatRecordData(record) {
    const data = record.data;
    // DNSKEY record - data is typically a buffer or string
    if (record.type === DNS_TYPES.DNSKEY || String(record.type) === '48') {
        if (typeof data === 'string')
            return data;
        if (Buffer.isBuffer(data))
            return data.toString('base64');
        return JSON.stringify(data);
    }
    // DS record
    if (record.type === DNS_TYPES.DS || String(record.type) === '43') {
        if (typeof data === 'string')
            return data;
        if (Buffer.isBuffer(data))
            return data.toString('hex');
        return JSON.stringify(data);
    }
    // Generic record - stringify
    if (typeof data === 'string')
        return data;
    return JSON.stringify(data);
}
/**
 * Send DNS query over UDP with TCP fallback for truncated responses
 */
async function sendDnsQuery(packet, server, port, options = {}) {
    const { timeoutMs = 5000, fallbackToTcp = true } = options;
    return new Promise((resolve, reject) => {
        const dgram = require('node:dgram');
        const client = dgram.createSocket('udp4');
        const timeout = setTimeout(() => {
            client.close();
            reject(new Error('DNS query timeout'));
        }, timeoutMs);
        client.on('message', (msg) => {
            clearTimeout(timeout);
            // Check if response is truncated (TC flag in DNS header)
            // TC flag is in byte 2, bit 1 (0x02)
            const flags = msg[2];
            const isTruncated = (flags & 0x02) !== 0;
            if (isTruncated && fallbackToTcp) {
                // Retry over TCP
                client.close();
                sendDnsQueryTcp(packet, server, port, timeoutMs).then(resolve).catch(reject);
            }
            else {
                client.close();
                resolve(msg);
            }
        });
        client.on('error', (err) => {
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
async function sendDnsQueryTcp(packet, server, port, timeoutMs = 5000) {
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
        client.on('data', (data) => {
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
            }
            else {
                resolve(dnsResponse);
            }
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        client.connect(port, server);
    });
}
/**
 * Query DNSKEY records for a domain
 */
export async function queryDNSKEY(domain) {
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
    }
    catch (error) {
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
export async function queryDS(domain) {
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
    }
    catch (error) {
        return {
            success: false,
            answers: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
//# sourceMappingURL=dnssec-resolver.js.map