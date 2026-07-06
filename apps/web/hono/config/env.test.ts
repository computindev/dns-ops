/**
 * Environment Validation Tests
 */

import { describe, expect, it } from 'vitest';
import {
  assertEnvValid,
  formatValidationErrors,
  getEnvConfig,
  getEnvDocs,
  validateEnv,
} from './env.js';

describe('validateEnv', () => {
  it('passes with all required vars in development', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/test',
      COLLECTOR_URL: 'http://localhost:3001',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.environment).toBe('development');
  });

  it('fails when DATABASE_URL missing in development', () => {
    const env = {
      NODE_ENV: 'development',
      COLLECTOR_URL: 'http://localhost:3001',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('DATABASE_URL');
    expect(result.errors[0].error).toBe('Required but not set');
  });

  it('passes in production without DATABASE_URL', () => {
    const env = {
      NODE_ENV: 'production',
      COLLECTOR_URL: 'https://collector.example.com',
      INTERNAL_SECRET: 'super-secret-key-12345678',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when INTERNAL_SECRET missing in production', () => {
    const env = {
      NODE_ENV: 'production',
      COLLECTOR_URL: 'https://collector.example.com',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.name === 'INTERNAL_SECRET')).toBe(true);
  });

  it('fails when INTERNAL_SECRET too short in production', () => {
    const env = {
      NODE_ENV: 'production',
      COLLECTOR_URL: 'https://collector.example.com',
      INTERNAL_SECRET: 'short',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(false);
    expect(result.errors[0].name).toBe('INTERNAL_SECRET');
    expect(result.errors[0].error).toContain('16 characters');
  });

  it('fails when DATABASE_URL has invalid format', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'mysql://localhost:3306/test',
      COLLECTOR_URL: 'http://localhost:3001',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(false);
    expect(result.errors[0].name).toBe('DATABASE_URL');
    expect(result.errors[0].error).toContain('PostgreSQL');
  });

  it('fails when COLLECTOR_URL has invalid format', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/test',
      COLLECTOR_URL: 'not-a-url',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(false);
    expect(result.errors[0].name).toBe('COLLECTOR_URL');
    expect(result.errors[0].error).toContain('valid URL');
  });

  it('warns about production vars missing in development', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/test',
      COLLECTOR_URL: 'http://localhost:3001',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('INTERNAL_SECRET'))).toBe(true);
  });

  it('defaults to production when NODE_ENV unset', () => {
    const env = {
      COLLECTOR_URL: 'https://collector.example.com',
      INTERNAL_SECRET: 'super-secret-key-12345678',
    };

    const result = validateEnv(env);
    expect(result.environment).toBe('production');
  });

  it('accepts postgres:// URL scheme', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://localhost:5432/test',
      COLLECTOR_URL: 'http://localhost:3001',
    };

    const result = validateEnv(env);
    expect(result.valid).toBe(true);
  });
});

describe('formatValidationErrors', () => {
  it('formats errors as readable output', () => {
    const result = validateEnv({
      NODE_ENV: 'development',
    });

    const formatted = formatValidationErrors(result);
    expect(formatted).toContain('ENVIRONMENT CONFIGURATION ERROR');
    expect(formatted).toContain('DATABASE_URL');
    expect(formatted).toContain('Required but not set');
  });
});

describe('assertEnvValid', () => {
  it('throws on invalid env', () => {
    expect(() =>
      assertEnvValid({
        NODE_ENV: 'development',
      })
    ).toThrow('Environment validation failed');
  });

  it('does not throw on valid env', () => {
    expect(() =>
      assertEnvValid({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        COLLECTOR_URL: 'http://localhost:3001',
      })
    ).not.toThrow();
  });

  // Production boundary pair (TB-0 Fix 3): a misconfigured production runtime
  // must crash on boot, not silently serve traffic. assertEnvValid is the gate
  // apps/web/app/api.ts invokes at module load — these guard its contract.
  it('throws in production when INTERNAL_SECRET is unset (boot must crash)', () => {
    expect(() =>
      assertEnvValid({
        NODE_ENV: 'production',
        COLLECTOR_URL: 'https://collector.example.com',
      })
    ).toThrow('Environment validation failed');
  });

  it('does not throw in production with valid required env', () => {
    expect(() =>
      assertEnvValid({
        NODE_ENV: 'production',
        COLLECTOR_URL: 'https://collector.example.com',
        INTERNAL_SECRET: 'super-secret-key-12345678',
      })
    ).not.toThrow();
  });
});

describe('getEnvConfig', () => {
  it('returns typed config with defaults', () => {
    const config = getEnvConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost:5432/test',
    });

    expect(config.nodeEnv).toBe('development');
    expect(config.databaseUrl).toBe('postgresql://localhost:5432/test');
    expect(config.collectorUrl).toBe('http://localhost:3001'); // default
    expect(config.isDevelopment).toBe(true);
    expect(config.isProduction).toBe(false);
  });

  it('uses provided COLLECTOR_URL over default', () => {
    const config = getEnvConfig({
      COLLECTOR_URL: 'https://collector.example.com',
    });

    expect(config.collectorUrl).toBe('https://collector.example.com');
  });
});

describe('getEnvDocs', () => {
  it('returns documentation for all env vars', () => {
    const docs = getEnvDocs();
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => d.name && d.description)).toBe(true);
  });
});
