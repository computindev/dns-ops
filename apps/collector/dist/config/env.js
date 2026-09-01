/**
 * Environment Configuration and Validation
 *
 * Fail-fast validation for required runtime configuration.
 * The collector requires DATABASE_URL since it always uses PostgreSQL.
 */
import { getCollectorLogger } from '../middleware/error-tracking.js';
const logger = getCollectorLogger();
const ENV_VARS = [
    {
        name: 'NODE_ENV',
        required: false,
        description: 'Runtime environment (development/production/test)',
        validate: (v) => {
            const valid = ['development', 'production', 'test'];
            return valid.includes(v) ? null : `Must be one of: ${valid.join(', ')}`;
        },
        default: 'production',
    },
    {
        name: 'PORT',
        required: false,
        description: 'Server port (default: 3001)',
        validate: (v) => {
            const port = parseInt(v, 10);
            if (Number.isNaN(port) || port < 1 || port > 65535) {
                return 'Must be a valid port number (1-65535)';
            }
            return null;
        },
        default: '3001',
    },
    {
        name: 'DATABASE_URL',
        required: true,
        description: 'PostgreSQL connection URL (required for collector)',
        validate: (v) => {
            if (!v.startsWith('postgresql://') && !v.startsWith('postgres://')) {
                return 'Must be a valid PostgreSQL URL (postgresql://... or postgres://...)';
            }
            return null;
        },
    },
    {
        name: 'INTERNAL_SECRET',
        required: 'production',
        description: 'Shared secret for internal service-to-service authentication',
        validate: (v) => {
            if (v.length < 16) {
                return 'Must be at least 16 characters for security';
            }
            return null;
        },
    },
    {
        name: 'API_KEY_SECRET',
        required: false,
        description: 'Secret for external API key validation',
        validate: (v) => {
            if (v.length < 16) {
                return 'Must be at least 16 characters for security';
            }
            return null;
        },
    },
    {
        name: 'COLLECTOR_URL',
        required: false,
        description: 'Self-reference URL for internal callbacks (monitoring)',
        validate: (v) => {
            try {
                new URL(v);
                return null;
            }
            catch {
                return 'Must be a valid URL';
            }
        },
        default: 'http://localhost:3001',
    },
    {
        name: 'ENABLE_ACTIVE_PROBES',
        required: false,
        // Security review and threat model: docs/security/probe-sandbox-review.md
        // Disabled by default — read the review before enabling in production.
        description: 'Enable active probing (MTA-STS, SMTP STARTTLS). Optional feature, disabled by default. See docs/security/probe-sandbox-review.md before enabling.',
        validate: (v) => {
            const valid = ['true', 'false', '1', '0'];
            return valid.includes(v.toLowerCase()) ? null : 'Must be true/false or 1/0';
        },
        default: 'false',
    },
    {
        name: 'PROBE_TIMEOUT_MS',
        required: false,
        description: 'Timeout for active probes in milliseconds (default: 30000)',
        validate: (v) => {
            const ms = parseInt(v, 10);
            if (Number.isNaN(ms) || ms < 1000 || ms > 120000) {
                return 'Must be between 1000 and 120000 milliseconds';
            }
            return null;
        },
        default: '30000',
    },
    {
        name: 'ERROR_REPORTING_ENDPOINT',
        required: false,
        description: 'Optional HTTP endpoint for centralised error reporting (e.g. Sentry ingest, internal collector)',
        validate: (v) => {
            try {
                new URL(v);
                return null;
            }
            catch {
                return 'Must be a valid URL';
            }
        },
    },
    {
        name: 'PROBE_CONCURRENCY',
        required: false,
        description: 'Maximum concurrent probe connections (default: 5)',
        validate: (v) => {
            const n = parseInt(v, 10);
            if (Number.isNaN(n) || n < 1 || n > 20) {
                return 'Must be between 1 and 20';
            }
            return null;
        },
        default: '5',
    },
];
/**
 * Check if a variable is required in the current environment
 */
function isRequired(def, env) {
    if (def.required === true)
        return true;
    if (def.required === false)
        return false;
    return def.required === env;
}
/**
 * Validate all environment variables
 *
 * @param processEnv - The process.env object (or mock for testing)
 * @returns Validation result with errors and warnings
 */
export function validateEnv(processEnv = process.env) {
    const errors = [];
    const warnings = [];
    // Determine environment first
    const nodeEnv = processEnv.NODE_ENV || 'production';
    const environment = nodeEnv;
    for (const def of ENV_VARS) {
        const value = processEnv[def.name];
        const required = isRequired(def, environment);
        // Check if required variable is missing
        if (required && !value) {
            errors.push({
                name: def.name,
                error: 'Required but not set',
                description: def.description,
            });
            continue;
        }
        // Skip validation if not set and not required
        if (!value) {
            if (def.default) {
                // Has default, no warning needed
            }
            else if (def.required === 'production' && environment === 'development') {
                warnings.push(`${def.name} not set (required in production): ${def.description}`);
            }
            continue;
        }
        // Run custom validation if provided
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
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        environment,
    };
}
/**
 * Format validation errors as a readable string
 */
export function formatValidationErrors(result) {
    const lines = [
        '',
        '╔════════════════════════════════════════════════════════════════╗',
        '║           COLLECTOR CONFIGURATION ERROR                        ║',
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
    lines.push('Fix the errors above and restart the collector.');
    lines.push('');
    return lines.join('\n');
}
/**
 * Validate environment and throw if invalid
 *
 * Call this at application startup to fail fast with clear messages.
 *
 * @throws Error with formatted message if validation fails
 */
export function assertEnvValid(processEnv = process.env) {
    const result = validateEnv(processEnv);
    // Log warnings even if valid
    if (result.warnings.length > 0) {
        logger.warn('[ENV] Warnings:', { warnings: result.warnings });
    }
    if (!result.valid) {
        const message = formatValidationErrors(result);
        logger.error('[ENV] Validation failed', new Error(message), { errors: result.errors });
        throw new Error(`Environment validation failed: ${result.errors.length} error(s)`);
    }
}
/**
 * Get typed environment configuration
 *
 * Returns the current environment values with proper typing.
 * Uses defaults where appropriate.
 */
export function getEnvConfig(processEnv = process.env) {
    const nodeEnv = (processEnv.NODE_ENV || 'production');
    // Parse feature flags
    const enableActiveProbes = ['true', '1'].includes((processEnv.ENABLE_ACTIVE_PROBES || 'false').toLowerCase());
    return {
        nodeEnv,
        port: processEnv.PORT ? parseInt(processEnv.PORT, 10) : 3001,
        databaseUrl: processEnv.DATABASE_URL,
        internalSecret: processEnv.INTERNAL_SECRET,
        apiKeySecret: processEnv.API_KEY_SECRET,
        collectorUrl: processEnv.COLLECTOR_URL || 'http://localhost:3001',
        errorReportingEndpoint: processEnv.ERROR_REPORTING_ENDPOINT,
        isDevelopment: nodeEnv === 'development',
        isProduction: nodeEnv === 'production',
        features: {
            enableActiveProbes,
            enableLegacyDeeplinks: true, // Always enabled for now
        },
        probes: {
            enabled: enableActiveProbes,
            timeoutMs: processEnv.PROBE_TIMEOUT_MS ? parseInt(processEnv.PROBE_TIMEOUT_MS, 10) : 30000,
            concurrency: processEnv.PROBE_CONCURRENCY ? parseInt(processEnv.PROBE_CONCURRENCY, 10) : 5,
        },
    };
}
/**
 * Environment variable names for documentation/tooling
 */
export const ENV_VAR_NAMES = ENV_VARS.map((v) => v.name);
/**
 * Get documentation for all environment variables
 */
export function getEnvDocs() {
    return ENV_VARS.map((v) => ({
        name: v.name,
        required: v.required === true ? 'always' : v.required === false ? 'optional' : `in ${v.required}`,
        description: v.description,
        default: v.default,
    }));
}
//# sourceMappingURL=env.js.map