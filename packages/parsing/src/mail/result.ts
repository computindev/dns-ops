/**
 * Mail Record Parsing with Result Types
 *
 * Result-based variants of mail parsing functions.
 * These complement the throwing/null-returning versions for gradual migration.
 */

import { ParseError, Result, type ResultOrError } from '@dns-ops/contracts';
import type { DKIMRecord, DMARCRecord, MTASTSRecord, SPFRecord } from './index.js';
import { parseDKIM, parseDMARC, parseMTASTS, parseSPF } from './index.js';

/**
 * Mail parsing error codes
 */
export type MailParseCode =
  | 'NOT_SPF_RECORD'
  | 'NOT_DMARC_RECORD'
  | 'NOT_DKIM_RECORD'
  | 'NOT_MTASTS_RECORD'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FORMAT';

/**
 * Mail parsing error with structured details
 */
export class MailParseError extends ParseError {
  readonly code: MailParseCode;
  readonly details: { code: MailParseCode; field?: string; input?: string };

  constructor(args: {
    message: string;
    code: MailParseCode;
    input?: string;
    field?: string;
    details?: Record<string, unknown>;
  }) {
    super({
      message: args.message,
      input: args.input,
      format: 'mail-record',
    });
    this.code = args.code;
    this.details = { code: args.code, field: args.field, input: args.input };
  }
}

/**
 * Parse an SPF TXT record, returning a Result.
 *
 * @example
 * ```typescript
 * const result = parseSPFResult('v=spf1 include:_spf.google.com ~all');
 *
 * if (result.isOk()) {
 *   console.log(result.value.mechanisms);
 * } else {
 *   console.error(result.error.code); // 'NOT_SPF_RECORD'
 * }
 * ```
 */
export function parseSPFResult(txtData: string): ResultOrError<SPFRecord, MailParseError> {
  const result = parseSPF(txtData);

  if (result === null) {
    // Check if it's because it's not an SPF record
    if (!txtData.includes('v=spf1')) {
      return Result.err(
        new MailParseError({
          message: 'Not a valid SPF record: missing v=spf1',
          code: 'NOT_SPF_RECORD',
          input: txtData,
        })
      );
    }

    return Result.err(
      new MailParseError({
        message: 'Failed to parse SPF record',
        code: 'INVALID_FORMAT',
        input: txtData,
      })
    );
  }

  return Result.ok(result);
}

/**
 * Parse a DMARC TXT record, returning a Result.
 *
 * @example
 * ```typescript
 * const result = parseDMARCResult('v=DMARC1; p=reject; rua=mailto:dmarc@example.com');
 *
 * if (result.isOk()) {
 *   console.log(result.value.policy); // 'reject'
 * } else {
 *   console.error(result.error.code); // 'NOT_DMARC_RECORD'
 * }
 * ```
 */
export function parseDMARCResult(txtData: string): ResultOrError<DMARCRecord, MailParseError> {
  const result = parseDMARC(txtData);

  if (result === null) {
    // Check if it's because it's not a DMARC record
    if (!/^v[\t ]*=[\t ]*DMARC1(?:[\t ]*;|[\t ]*$)/.test(txtData)) {
      return Result.err(
        new MailParseError({
          message: 'Not a valid DMARC record: missing v=DMARC1',
          code: 'NOT_DMARC_RECORD',
          input: txtData,
        })
      );
    }

    return Result.err(
      new MailParseError({
        message: 'DMARC record contains invalid tag syntax',
        code: 'INVALID_FORMAT',
        input: txtData,
      })
    );
  }

  return Result.ok(result);
}

/**
 * Parse a DKIM TXT record, returning a Result.
 *
 * @example
 * ```typescript
 * const result = parseDKIMResult('v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...');
 *
 * if (result.isOk()) {
 *   console.log(result.value.publicKey);
 * } else {
 *   console.error(result.error.code); // 'MISSING_REQUIRED_FIELD'
 * }
 * ```
 */
export function parseDKIMResult(txtData: string): ResultOrError<DKIMRecord, MailParseError> {
  const result = parseDKIM(txtData);

  if (result === null) {
    // DKIM records must have a public key
    if (!txtData.includes('p=')) {
      return Result.err(
        new MailParseError({
          message: 'DKIM record missing required public key (p=) field',
          code: 'MISSING_REQUIRED_FIELD',
          input: txtData,
          field: 'p',
        })
      );
    }

    return Result.err(
      new MailParseError({
        message: 'Failed to parse DKIM record',
        code: 'INVALID_FORMAT',
        input: txtData,
      })
    );
  }

  return Result.ok(result);
}

/**
 * Parse an MTA-STS TXT record, returning a Result.
 *
 * @example
 * ```typescript
 * const result = parseMTASTSResult('v=STSv1; id=20240101');
 *
 * if (result.isOk()) {
 *   console.log(result.value.version); // 'STSv1'
 * } else {
 *   console.error(result.error.code); // 'NOT_MTASTS_RECORD'
 * }
 * ```
 */
export function parseMTASTSResult(txtData: string): ResultOrError<MTASTSRecord, MailParseError> {
  const result = parseMTASTS(txtData);

  if (result === null) {
    // Check if it's because it's not an MTA-STS record
    if (!txtData.includes('v=STSv1')) {
      return Result.err(
        new MailParseError({
          message: 'Not a valid MTA-STS record: missing v=STSv1',
          code: 'NOT_MTASTS_RECORD',
          input: txtData,
        })
      );
    }

    return Result.err(
      new MailParseError({
        message: 'Failed to parse MTA-STS record',
        code: 'INVALID_FORMAT',
        input: txtData,
      })
    );
  }

  return Result.ok(result);
}

/**
 * Type guard for MailParseError
 */
export function isMailParseError(error: unknown): error is MailParseError {
  return error instanceof MailParseError;
}

/**
 * Batch parse multiple mail records with Result types
 *
 * @example
 * ```typescript
 * const records = [
 *   'v=spf1 include:_spf.google.com ~all',
 *   'v=DMARC1; p=reject',
 *   'invalid record'
 * ];
 * const results = parseMailRecordsResult(records, parseSPFResult);
 *
 * const successful = results.filter(r => r.isOk()).map(r => r.value);
 * const failed = results.filter(r => r.isErr()).map(r => r.error);
 * ```
 */
export function parseMailRecordsResult<T>(
  records: string[],
  parser: (record: string) => ResultOrError<T, MailParseError>
): ResultOrError<T, MailParseError>[] {
  return records.map(parser);
}

/**
 * Partition mail parsing results into successes and failures
 *
 * @example
 * ```typescript
 * const { ok, err } = partitionMailResults(records, parseSPFResult);
 * // ok: SPFRecord[]
 * // err: MailParseError[]
 * ```
 */
export function partitionMailResults<T>(
  records: string[],
  parser: (record: string) => ResultOrError<T, MailParseError>
): {
  ok: T[];
  err: MailParseError[];
} {
  const results = parseMailRecordsResult(records, parser);
  const [ok, err] = Result.partition(results);
  return { ok, err };
}

/**
 * Try to parse any mail record type and return the appropriate type
 *
 * @example
 * ```typescript
 * const result = parseAnyMailRecord('v=spf1 ~all');
 * if (result.isOk()) {
 *   // result.value.type will indicate which record type was parsed
 * }
 * ```
 */
export function parseAnyMailRecord(
  txtData: string
):
  | { type: 'spf'; result: ResultOrError<SPFRecord, MailParseError> }
  | { type: 'dmarc'; result: ResultOrError<DMARCRecord, MailParseError> }
  | { type: 'dkim'; result: ResultOrError<DKIMRecord, MailParseError> }
  | { type: 'mtasts'; result: ResultOrError<MTASTSRecord, MailParseError> }
  | { type: 'unknown'; result: null } {
  // Pre-check for record type indicators to avoid unnecessary parsing attempts
  const data = txtData.trim();

  // Check for SPF first (most common)
  if (data.includes('v=spf1')) {
    const spf = parseSPFResult(txtData);
    if (spf.isOk()) {
      return { type: 'spf', result: spf };
    }
  }

  // Check for DMARC
  if (/^v[\t ]*=[\t ]*DMARC1(?:[\t ]*;|[\t ]*$)/.test(data)) {
    const dmarc = parseDMARCResult(txtData);
    if (dmarc.isOk()) {
      return { type: 'dmarc', result: dmarc };
    }
  }

  // Check for DKIM (has public key)
  if (data.includes('v=DKIM1') || (data.includes('p=') && data.includes('k='))) {
    const dkim = parseDKIMResult(txtData);
    if (dkim.isOk()) {
      return { type: 'dkim', result: dkim };
    }
  }

  // Check for MTA-STS
  if (data.includes('v=STSv1')) {
    const mtasts = parseMTASTSResult(txtData);
    if (mtasts.isOk()) {
      return { type: 'mtasts', result: mtasts };
    }
  }

  return { type: 'unknown', result: null };
}
