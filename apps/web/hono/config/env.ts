import { createLogger } from '@dns-ops/logging';
import type { Env } from '../types.js';

const logger = createLogger({ service: 'dns-ops-web', version: '1.0.0', minLevel: 'info' });

interface EnvVarDef {
  name:
    | 'NODE_ENV'
    | 'DATABASE_URL'
    | 'HYPERDRIVE_URL'
    | 'COLLECTOR_URL'
    | 'INTERNAL_SECRET'
    | 'API_KEY_SECRET'
    | 'ADMIN_EMAILS';
  required: boolean | 'development' | 'production';
  description: string;
  validate?: (value: string) => string | null;
  default?: string;
}

interface EnvError {
  name: string;
  error: string;
  description: string;
}

interface ValidationResult {
  valid: boolean;
  errors: EnvError[];
  warnings: string[];
  environment: 'development' | 'production' | 'test';
}

type RuntimeBindings = Partial<
  Env['Bindings'] & {
    NODE_ENV?: string;
    HYPERDRIVE_URL?: string;
  }
>;

const ENV_VARS: EnvVarDef[] = [
  {
    name: 'NODE_ENV',
    required: false,
    description: 'Runtime environment (development/production/test)',
    validate: (value) =>
      ['development', 'production', 'test'].includes(value)
        ? null
        : 'Must be one of: development, production, test',
    default: 'production',
  },
  {
    name: 'DATABASE_URL',
    required: 'development',
    description: 'PostgreSQL connection URL for local development or bound runtime',
    validate: (value) =>
      value.startsWith('postgresql://') || value.startsWith('postgres://')
        ? null
        : 'Must be a valid PostgreSQL URL (postgresql://... or postgres://...)',
  },
  {
    name: 'HYPERDRIVE_URL',
    required: false,
    description: 'Optional Cloudflare-bound PostgreSQL/Hyperdrive connection URL',
    validate: (value) =>
      value.startsWith('postgresql://') || value.startsWith('postgres://')
        ? null
        : 'Must be a valid PostgreSQL URL (postgresql://... or postgres://...)',
  },
  {
    name: 'COLLECTOR_URL',
    required: true,
    description: 'URL for the DNS collector service',
    validate: (value) => {
      try {
        new URL(value);
        return null;
      } catch {
        return 'Must be a valid URL';
      }
    },
    default: 'http://localhost:3001',
  },
  {
    name: 'INTERNAL_SECRET',
    required: 'production',
    description: 'Shared secret for internal web → collector authentication',
    validate: (value) =>
      value.length >= 16 ? null : 'Must be at least 16 characters for security',
  },
  {
    name: 'API_KEY_SECRET',
    required: false,
    description: 'Shared secret for service API key authentication',
    validate: (value) =>
      value.length >= 16 ? null : 'Must be at least 16 characters for security',
  },
  {
    name: 'ADMIN_EMAILS',
    required: false,
    description: 'Comma-separated admin email allowlist for privileged web routes',
    validate: (value) => {
      const invalid = value
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean)
        .find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      return invalid ? `Invalid admin email: ${invalid}` : null;
    },
  },
];

function isRequired(def: EnvVarDef, env: 'development' | 'production' | 'test'): boolean {
  if (def.required === true) return true;
  if (def.required === false) return false;
  return def.required === env;
}

function readEnvValue(
  name: EnvVarDef['name'],
  bindings?: RuntimeBindings,
  processEnv: Record<string, string | undefined> = process.env
): string | undefined {
  switch (name) {
    case 'DATABASE_URL':
      return (
        bindings?.DATABASE_URL ??
        bindings?.HYPERDRIVE_URL ??
        processEnv.DATABASE_URL ??
        processEnv.HYPERDRIVE_URL
      );
    case 'HYPERDRIVE_URL':
      return bindings?.HYPERDRIVE_URL ?? processEnv.HYPERDRIVE_URL;
    case 'COLLECTOR_URL':
      return bindings?.COLLECTOR_URL ?? processEnv.COLLECTOR_URL;
    case 'INTERNAL_SECRET':
      return bindings?.INTERNAL_SECRET ?? processEnv.INTERNAL_SECRET;
    case 'API_KEY_SECRET':
      return bindings?.API_KEY_SECRET ?? processEnv.API_KEY_SECRET;
    case 'ADMIN_EMAILS':
      return bindings?.ADMIN_EMAILS ?? processEnv.ADMIN_EMAILS;
    case 'NODE_ENV':
      return bindings?.NODE_ENV ?? processEnv.NODE_ENV;
  }
}

export function validateEnv(
  processEnv: Record<string, string | undefined> = process.env
): ValidationResult {
  const errors: EnvError[] = [];
  const warnings: string[] = [];
  const environment = (processEnv.NODE_ENV || 'production') as
    | 'development'
    | 'production'
    | 'test';

  for (const def of ENV_VARS) {
    const value = readEnvValue(def.name, undefined, processEnv);
    const required = isRequired(def, environment);

    if (required && !value) {
      errors.push({
        name: def.name,
        error: 'Required but not set',
        description: def.description,
      });
      continue;
    }

    if (!value) {
      if (def.required === 'production' && environment === 'development') {
        warnings.push(`${def.name} not set (required in production): ${def.description}`);
      }
      continue;
    }

    if (def.validate) {
      const validationError = def.validate(value);
      if (validationError) {
        errors.push({
          name: def.name,
          error: validationError,
          description: def.description,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, environment };
}

export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [
    '',
    '╔════════════════════════════════════════════════════════════════╗',
    '║           ENVIRONMENT CONFIGURATION ERROR                      ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
    `Environment: ${result.environment}`,
    '',
  ];

  if (result.errors.length > 0) {
    lines.push('ERRORS (startup blocked):');
    lines.push('─'.repeat(60));
    for (const err of result.errors) {
      lines.push(`  ✗ ${err.name}`);
      lines.push(`    Error: ${err.error}`);
      lines.push(`    Purpose: ${err.description}`);
      lines.push('');
    }
  }

  if (result.warnings.length > 0) {
    lines.push('WARNINGS:');
    lines.push('─'.repeat(60));
    for (const warn of result.warnings) {
      lines.push(`  ⚠ ${warn}`);
    }
    lines.push('');
  }

  lines.push('─'.repeat(60));
  lines.push('Fix the errors above and restart the application.');
  lines.push('');

  return lines.join('\n');
}

export function assertEnvValid(processEnv: Record<string, string | undefined> = process.env): void {
  const result = validateEnv(processEnv);

  if (result.warnings.length > 0) {
    logger.warn('Environment validation warnings', {
      warnings: result.warnings,
    });
  }

  if (!result.valid) {
    const formatted = formatValidationErrors(result);
    logger.error('Environment validation failed', undefined, {
      errorCount: result.errors.length,
      errors: result.errors.map((e) => `${e.name}: ${e.error}`),
      formatted,
    });
    throw new Error(`Environment validation failed: ${result.errors.length} error(s)`);
  }
}

export function getEnvConfig(
  bindings?: RuntimeBindings,
  processEnv: Record<string, string | undefined> = process.env
): {
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string | undefined;
  collectorUrl: string;
  internalSecret: string | undefined;
  apiKeySecret: string | undefined;
  isDevelopment: boolean;
  isProduction: boolean;
} {
  const nodeEnv = (readEnvValue('NODE_ENV', bindings, processEnv) || 'production') as
    | 'development'
    | 'production'
    | 'test';

  return {
    nodeEnv,
    databaseUrl: readEnvValue('DATABASE_URL', bindings, processEnv),
    collectorUrl: readEnvValue('COLLECTOR_URL', bindings, processEnv) || 'http://localhost:3001',
    internalSecret: readEnvValue('INTERNAL_SECRET', bindings, processEnv),
    apiKeySecret: readEnvValue('API_KEY_SECRET', bindings, processEnv),
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
  };
}

export function getRequestEnvConfig(
  bindings?: RuntimeBindings,
  processEnv: Record<string, string | undefined> = process.env
) {
  return getEnvConfig(bindings, processEnv);
}

export const ENV_VAR_NAMES = ENV_VARS.map((value) => value.name);

export function getEnvDocs(): Array<{
  name: string;
  required: string;
  description: string;
  default?: string;
}> {
  return ENV_VARS.map((value) => ({
    name: value.name,
    required:
      value.required === true
        ? 'always'
        : value.required === false
          ? 'optional'
          : `in ${value.required}`,
    description: value.description,
    default: value.default,
  }));
}
