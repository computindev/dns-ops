/**
 * RecordSet Normalization
 *
 * Convert observations into normalized RecordSets for querying and display.
 * Aggregates multiple vantage points for the same name/type.
 */

import type { DNSRecord, Observation } from '@dns-ops/db/schema';
import { tryNormalizeDNSOwner } from './index.js';

export interface NormalizedRecord {
  name: string;
  type: string;
  ttl: number;
  values: string[];
  sourceVantages: string[];
  sourceObservationIds: string[];
  isConsistent: boolean;
  consolidationNotes?: string;
}

export interface RecordSetDiff {
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  name: string;
  recordType: string;
  before?: NormalizedRecord;
  after?: NormalizedRecord;
  changes?: Array<{
    field: string;
    before: unknown;
    after: unknown;
  }>;
}

/**
 * Group observations by name and type
 */
function groupByNameType(observations: Observation[]): Map<string, Observation[]> {
  const groups = new Map<string, Observation[]>();

  for (const obs of observations) {
    const owner = tryNormalizeDNSOwner(obs.queryName)?.normalized;
    if (!owner) continue;
    const key = `${owner}|${obs.queryType}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(obs);
  }

  return groups;
}

/**
 * Extract values from DNS records. Keep malformed CNAME data unchanged so a
 * later persisted-evidence authorization check can reject it rather than
 * silently dropping the observation.
 */
function extractValues(records: DNSRecord[], ownerName: string, recordType: string): string[] {
  const values: string[] = [];
  for (const record of records) {
    if (record.type !== recordType) continue;
    const recordOwner = tryNormalizeDNSOwner(record.name)?.normalized;
    if (recordOwner !== ownerName) continue;

    if (record.type === 'CNAME') {
      values.push(tryNormalizeDNSOwner(record.data)?.normalized ?? record.data);
    } else if (record.type === 'MX' && record.priority !== undefined) {
      values.push(`${record.priority} ${record.data}`);
    } else {
      values.push(record.data);
    }
  }
  return [...new Set(values)]; // Deduplicate
}

/**
 * Check if two value arrays are equal (ignoring order)
 */
function valuesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Normalize observations into RecordSets
 *
 * Handles mixed success/failure states across vantages.
 * Failed observations are included in metadata but don't contribute values.
 */
export function observationsToRecordSets(observations: Observation[]): NormalizedRecord[] {
  const groups = groupByNameType(observations);
  const records: NormalizedRecord[] = [];

  for (const [key, group] of groups) {
    const [name, type] = key.split('|');

    // Separate successful and failed observations
    const successfulObs = group.filter((obs) => obs.status === 'success');
    const failedObs = group.filter((obs) => obs.status !== 'success');

    // Extract all values from successful observations
    const allValues: string[] = [];
    const vantages: string[] = [];
    const observationIds: string[] = [];
    const vantageValues = new Map<string, string[]>();

    for (const obs of successfulObs) {
      const vantageId = obs.vantageIdentifier || obs.vantageType;
      vantages.push(vantageId);
      observationIds.push(obs.id);

      const values = extractValues(obs.answerSection || [], name, type);
      allValues.push(...values);
      vantageValues.set(vantageId, values);
    }

    // Include failed observations in metadata
    for (const obs of failedObs) {
      const vantageId = obs.vantageIdentifier || obs.vantageType;
      vantages.push(`${vantageId} (${obs.status})`);
      observationIds.push(obs.id);
    }

    // Deduplicate values
    const uniqueValues = [...new Set(allValues)];

    // Check consistency across vantages (only successful ones)
    let isConsistent = true;
    const notes: string[] = [];

    if (vantageValues.size > 1) {
      const firstEntry = vantageValues.values().next();
      if (firstEntry.value) {
        const firstValues = firstEntry.value;
        for (const [, values] of vantageValues) {
          if (!valuesEqual(firstValues, values)) {
            isConsistent = false;
            notes.push('Values differ across vantages');
            break;
          }
        }
      }
    }

    // Note any failures
    if (failedObs.length > 0) {
      const failureTypes = [...new Set(failedObs.map((o) => o.status))];
      notes.push(`Failures from ${failedObs.length} vantage(s): ${failureTypes.join(', ')}`);
      isConsistent = false;
    }

    // Calculate average TTL
    const ttls = successfulObs
      .flatMap((obs) =>
        (obs.answerSection || [])
          .filter(
            (record) =>
              record.type === type && tryNormalizeDNSOwner(record.name)?.normalized === name
          )
          .map((r) => r.ttl)
      )
      .filter((ttl): ttl is number => ttl !== undefined);

    const avgTtl = ttls.length > 0 ? Math.round(ttls.reduce((a, b) => a + b, 0) / ttls.length) : 0;

    records.push({
      name,
      type,
      ttl: avgTtl,
      values: uniqueValues,
      sourceVantages: [...new Set(vantages)],
      sourceObservationIds: observationIds,
      isConsistent,
      consolidationNotes: notes.length > 0 ? notes.join('; ') : undefined,
    });
  }

  return records;
}

/**
 * Group records by type for organized display
 */
export function groupRecordsByType(records: NormalizedRecord[]): Map<string, NormalizedRecord[]> {
  const groups = new Map<string, NormalizedRecord[]>();

  for (const record of records) {
    if (!groups.has(record.type)) {
      groups.set(record.type, []);
    }
    groups.get(record.type)?.push(record);
  }

  // Sort types in preferred order
  const typeOrder = ['SOA', 'NS', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'CAA'];
  const sortedGroups = new Map<string, NormalizedRecord[]>();

  for (const type of typeOrder) {
    const group = groups.get(type);
    if (group) {
      sortedGroups.set(type, group);
    }
  }

  // Add any remaining types
  for (const [type, recs] of groups) {
    if (!sortedGroups.has(type)) {
      sortedGroups.set(type, recs);
    }
  }

  return sortedGroups;
}

/**
 * Format record value for display
 */
export function formatRecordValue(type: string, value: string): string {
  switch (type) {
    case 'MX': {
      const match = value.match(/^(\d+)\s+(.+)$/);
      if (match) {
        return `${match[2]} (priority: ${match[1]})`;
      }
      return value;
    }
    case 'SOA': {
      const parts = value.split(' ');
      if (parts.length >= 2) {
        return `Primary: ${parts[0]}, Contact: ${parts[1]}`;
      }
      return value;
    }
    case 'TXT':
      // Remove surrounding quotes if present
      return value.replace(/^"/, '').replace(/"$/, '');
    default:
      return value;
  }
}

/**
 * Get record type description
 */
export function getRecordTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    A: 'IPv4 Address',
    AAAA: 'IPv6 Address',
    CNAME: 'Canonical Name',
    MX: 'Mail Exchange',
    NS: 'Name Server',
    SOA: 'Start of Authority',
    TXT: 'Text',
    CAA: 'Certification Authority Authorization',
    PTR: 'Pointer',
    SRV: 'Service',
  };
  return descriptions[type] || type;
}
