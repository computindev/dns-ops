/**
 * Environment Configuration and Validation
 *
 * Fail-fast validation for required runtime configuration.
 * The collector requires DATABASE_URL since it always uses PostgreSQL.
 */
/**
 * All environment variables used by the collector
 */
/**
 * Feature flags for optional functionality
 */
interface FeatureFlags {
    /** Enable active probing (MTA-STS, SMTP STARTTLS) */
    enableActiveProbes: boolean;
    /** Enable legacy tool deeplink generation */
    enableLegacyDeeplinks: boolean;
}
/**
 * Validation error for a single environment variable
 */
interface EnvError {
    name: string;
    error: string;
    description: string;
}
/**
 * Result of environment validation
 */
interface ValidationResult {
    valid: boolean;
    errors: EnvError[];
    warnings: string[];
    environment: 'development' | 'production' | 'test';
}
/**
 * Validate all environment variables
 *
 * @param processEnv - The process.env object (or mock for testing)
 * @returns Validation result with errors and warnings
 */
export declare function validateEnv(processEnv?: Record<string, string | undefined>): ValidationResult;
/**
 * Format validation errors as a readable string
 */
export declare function formatValidationErrors(result: ValidationResult): string;
/**
 * Validate environment and throw if invalid
 *
 * Call this at application startup to fail fast with clear messages.
 *
 * @throws Error with formatted message if validation fails
 */
export declare function assertEnvValid(processEnv?: Record<string, string | undefined>): void;
/**
 * Get typed environment configuration
 *
 * Returns the current environment values with proper typing.
 * Uses defaults where appropriate.
 */
export declare function getEnvConfig(processEnv?: Record<string, string | undefined>): {
    nodeEnv: 'development' | 'production' | 'test';
    port: number;
    databaseUrl: string | undefined;
    internalSecret: string | undefined;
    apiKeySecret: string | undefined;
    collectorUrl: string;
    errorReportingEndpoint: string | undefined;
    isDevelopment: boolean;
    isProduction: boolean;
    features: FeatureFlags;
    probes: {
        enabled: boolean;
        timeoutMs: number;
        concurrency: number;
    };
};
/**
 * Environment variable names for documentation/tooling
 */
export declare const ENV_VAR_NAMES: string[];
/**
 * Get documentation for all environment variables
 */
export declare function getEnvDocs(): Array<{
    name: string;
    required: string;
    description: string;
    default?: string;
}>;
export {};
//# sourceMappingURL=env.d.ts.map