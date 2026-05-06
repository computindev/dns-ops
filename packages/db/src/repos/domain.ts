/**
 * Domain Repository
 *
 * Repository pattern for domain operations using the database adapter.
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IDatabaseAdapter } from '../database/simple-adapter.js';
import type * as schema from '../schema/index.js';
import { type Domain, domains, type NewDomain } from '../schema/index.js';

export interface DomainFilter {
  tenantId?: string;
  zoneManagement?: 'managed' | 'unmanaged' | 'unknown';
  search?: string;
}

export class DomainRepository {
  constructor(private db: IDatabaseAdapter) {}

  /**
   * Find a domain by ID
   */
  async findById(id: string): Promise<Domain | undefined> {
    return this.db.selectOne(domains, eq(domains.id, id));
  }

  /**
   * Find a domain by its normalized name
   * Note: This returns the first matching domain. In multi-tenant mode,
   * use findByNameForTenant for tenant-scoped lookups.
   */
  async findByName(normalizedName: string): Promise<Domain | undefined> {
    return this.db.selectOne(domains, eq(domains.normalizedName, normalizedName.toLowerCase()));
  }

  /**
   * Find a domain by normalized name AND tenant ID.
   * This is the preferred method for multi-tenant lookups.
   */
  async findByNameAndTenant(normalizedName: string, tenantId: string): Promise<Domain | undefined> {
    const matches = await this.db.selectWhere(
      domains,
      eq(domains.normalizedName, normalizedName.toLowerCase())
    );
    const normalized = normalizedName.toLowerCase();
    const match = matches.find(
      (domain) => domain.normalizedName === normalized && domain.tenantId === tenantId
    );
    if (match) return match;

    // Compatibility for older/mock adapters that only implement selectOne for domain name lookup.
    const fallback = await this.findByName(normalized);
    return fallback?.tenantId === tenantId ? fallback : undefined;
  }

  /**
   * Find a domain by its exact name (case-insensitive)
   */
  async findByExactName(name: string): Promise<Domain | undefined> {
    return this.db.selectOne(domains, eq(domains.name, name.toLowerCase()));
  }

  /**
   * Find a domain by normalized name and tenant ownership.
   * Returns undefined for unscoped or foreign-tenant rows.
   */
  async findByNameForTenant(normalizedName: string, tenantId: string): Promise<Domain | undefined> {
    return this.findByNameAndTenant(normalizedName, tenantId);
  }

  /**
   * Search domains by name pattern
   */
  async searchByName(pattern: string, limit: number = 20): Promise<Domain[]> {
    const allDomains = await this.db.select(domains);
    return allDomains
      .filter((d) => d.normalizedName.includes(pattern.toLowerCase()))
      .slice(0, limit);
  }

  /**
   * Find all domains matching filter criteria
   */
  async findAll(
    filter: DomainFilter = {},
    options: { limit?: number; offset?: number } = {}
  ): Promise<Domain[]> {
    let results = await this.db.select(domains);

    if (filter.tenantId) {
      results = results.filter((d) => d.tenantId === filter.tenantId);
    }

    if (filter.zoneManagement) {
      results = results.filter((d) => d.zoneManagement === filter.zoneManagement);
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      results = results.filter(
        (d) => d.normalizedName.includes(searchLower) || d.name.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || results.length;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get domains by zone management type
   */
  async findByZoneManagement(
    zoneManagement: 'managed' | 'unmanaged' | 'unknown',
    limit: number = 100
  ): Promise<Domain[]> {
    const results = await this.db.selectWhere(domains, eq(domains.zoneManagement, zoneManagement));
    return results.slice(0, limit);
  }

  /**
   * Create a new domain
   */
  async create(data: NewDomain): Promise<Domain> {
    const result = await this.db.insert(domains, {
      ...data,
      normalizedName: data.normalizedName || data.name.toLowerCase(),
    });
    return result;
  }

  /**
   * Create a new domain or return existing if name already exists
   * Uses atomic upsert to prevent race conditions with concurrent calls.
   *
   * In multi-tenant mode, considers (normalizedName, tenantId) as unique.
   * For global domains (no tenantId), considers (normalizedName, NULL) as unique.
   */
  async findOrCreate(data: NewDomain): Promise<Domain> {
    const normalizedName = data.normalizedName || data.name.toLowerCase();
    const insertData = {
      ...data,
      normalizedName,
    };

    // Get raw Drizzle instance for atomic upsert
    // Cast through unknown to handle the complex union types
    const rawDb = this.db.getDrizzle() as unknown as NodePgDatabase<typeof schema>;

    // Try atomic insert with onConflictDoNothing targeting the unique constraint
    // The domains table has a unique index on (normalizedName, tenantId)
    // Without the target, onConflictDoNothing only handles primary key conflicts
    // We must specify the target to catch unique constraint violations
    const insertResult = await rawDb
      .insert(domains)
      .values(insertData)
      .onConflictDoNothing({ target: [domains.normalizedName, domains.tenantId] })
      .returning();

    // If insert succeeded, return the new record
    if (insertResult.length > 0) {
      return insertResult[0];
    }

    // Conflict occurred - another caller inserted first
    // Query for the existing record using normalizedName (not data.name)
    if (data.tenantId) {
      const existing = await this.findByNameAndTenant(normalizedName, data.tenantId);
      if (existing) {
        return existing;
      }
      // Fallback: query by normalized name directly (should exist after conflict)
      const fallback = await this.findByName(normalizedName);
      if (fallback) {
        return fallback;
      }
    } else {
      const existing = await this.findByName(normalizedName);
      if (existing) {
        return existing;
      }
    }
    // This shouldn't happen if insert failed due to conflict
    throw new Error(`Domain ${data.name} not found after conflict resolution`);
  }

  /**
   * Update domain metadata
   */
  async update(id: string, data: Partial<NewDomain>): Promise<Domain | undefined> {
    return this.db.updateOne(
      domains,
      {
        ...data,
      },
      eq(domains.id, id)
    );
  }

  /**
   * Update zone management status
   */
  async updateZoneManagement(
    id: string,
    zoneManagement: 'managed' | 'unmanaged' | 'unknown'
  ): Promise<Domain | undefined> {
    return this.update(id, { zoneManagement });
  }

  /**
   * List all domains with pagination
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<Domain[]> {
    const { limit = 100, offset = 0 } = options;
    const results = await this.db.select(domains);
    return results.slice(offset, offset + limit);
  }

  /**
   * Count total domains
   */
  async count(filter: DomainFilter = {}): Promise<number> {
    let results = await this.db.select(domains);

    if (filter.tenantId) {
      results = results.filter((d) => d.tenantId === filter.tenantId);
    }

    if (filter.zoneManagement) {
      results = results.filter((d) => d.zoneManagement === filter.zoneManagement);
    }

    return results.length;
  }

  /**
   * Delete a domain by ID
   */
  async delete(id: string): Promise<Domain | undefined> {
    return this.db.deleteOne(domains, eq(domains.id, id));
  }
}
