import { Result, type ResultOrError, ValidationError } from '@dns-ops/contracts';

// Re-export for convenience
export { Result, type ResultOrError } from '@dns-ops/contracts';

/**
 * Simulation error codes
 */
export type SimulationErrorCode =
  | 'INVALID_FINDING_TYPE'
  | 'NO_ACTIONABLE_FINDINGS'
  | 'SIMULATION_FAILED'
  | 'INVALID_CONTEXT';

/**
 * Simulation error with context
 */
export class SimulationError extends ValidationError {
  readonly code: SimulationErrorCode;
  readonly findingType?: string;

  constructor(args: {
    message: string;
    code: SimulationErrorCode;
    findingType?: string;
    details?: Record<string, unknown>;
  }) {
    super({
      message: args.message,
      details: { code: args.code, findingType: args.findingType, ...args.details },
    });
    this.code = args.code;
    this.findingType = args.findingType;
  }

  /**
   * Create an INVALID_FINDING_TYPE error
   */
  static invalidFindingType(findingType: string): SimulationError {
    return new SimulationError({
      message: `Cannot simulate changes for finding type: ${findingType}`,
      code: 'INVALID_FINDING_TYPE',
      findingType,
    });
  }

  /**
   * Create a NO_ACTIONABLE_FINDINGS error
   */
  static noActionableFindings(): SimulationError {
    return new SimulationError({
      message: 'No actionable findings to simulate',
      code: 'NO_ACTIONABLE_FINDINGS',
    });
  }
}

/**
 * Type guard for SimulationError
 */
export function isSimulationError(error: unknown): error is SimulationError {
  return error instanceof SimulationError;
}

/**
 * Wrap a simulation operation in a Result
 */
export function simulationResult<T>(fn: () => T): ResultOrError<T, SimulationError> {
  try {
    return Result.ok(fn());
  } catch (e) {
    return Result.err(
      new SimulationError({
        message: e instanceof Error ? e.message : 'Simulation failed',
        code: 'SIMULATION_FAILED',
        details: { cause: String(e) },
      })
    );
  }
}

/** Finding types with a non-executable guidance playbook. */
export function getGuidanceSupportedFindingTypes(): string[] {
  return [
    'mail.no-spf-record',
    'mail.no-dmarc-record',
    'mail.no-mx-record',
    'mail.no-mta-sts',
    'mail.no-tls-rpt',
    'mail.no-dkim-queried',
    'mail.spf-malformed',
    'dns.cname-coexistence-conflict',
  ];
}

/** Check whether a finding type has non-executable guidance. */
export function hasGuidanceForFindingType(findingType: string): boolean {
  return getGuidanceSupportedFindingTypes().includes(findingType);
}

/** @deprecated Use getGuidanceSupportedFindingTypes. */
export const getActionableFindingTypes = getGuidanceSupportedFindingTypes;
/** @deprecated Use hasGuidanceForFindingType. */
export const isActionableFindingType = hasGuidanceForFindingType;

/**
 * Field type validators for simulation context
 */
const contextFieldValidators: Record<string, (value: unknown) => boolean> = {
  snapshotId: (v) => typeof v === 'string' && v.length > 0,
  domainId: (v) => typeof v === 'string' && v.length > 0,
  domainName: (v) => typeof v === 'string' && v.length > 0,
  recordSets: (v) => Array.isArray(v),
};

/**
 * Validate simulation context with type checking
 */
export function validateSimulationContext(context: unknown): ResultOrError<true, SimulationError> {
  if (!context || typeof context !== 'object') {
    return Result.err(
      new SimulationError({
        message: 'Invalid simulation context: must be an object',
        code: 'INVALID_CONTEXT',
      })
    );
  }

  const ctx = context as Record<string, unknown>;
  const required = ['snapshotId', 'domainId', 'domainName', 'recordSets'];

  for (const field of required) {
    if (!(field in ctx) || ctx[field] === undefined) {
      return Result.err(
        new SimulationError({
          message: `Missing required context field: ${field}`,
          code: 'INVALID_CONTEXT',
          details: { missingField: field },
        })
      );
    }

    // Validate field type
    const validator = contextFieldValidators[field];
    if (validator && !validator(ctx[field])) {
      return Result.err(
        new SimulationError({
          message: `Invalid type for context field: ${field}`,
          code: 'INVALID_CONTEXT',
          details: {
            field,
            value: ctx[field],
            expectedType: field === 'recordSets' ? 'array' : 'non-empty string',
          },
        })
      );
    }
  }

  return Result.ok(true);
}
