/**
 * Probe Allowlist Tenant Isolation Tests - AUTH-003
 *
 * Tests tenant-scoped allowlist functionality:
 * - Tenant isolation (entries are scoped by tenantId)
 * - Tenant-scoped allowlist creation
 * - Cross-tenant isolation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTenantAllowlist, ProbeAllowlistManager } from './allowlist.js';

describe('Tenant-Scoped Allowlist - AUTH-003', () => {
  describe('createTenantAllowlist', () => {
    it('should create tenant-scoped allowlist', () => {
      const allowlist = createTenantAllowlist('tenant-123');

      expect(allowlist).toBeDefined();
      expect(typeof allowlist.isAllowed).toBe('function');
      expect(typeof allowlist.addCustomEntry).toBe('function');
      expect(typeof allowlist.getAllEntries).toBe('function');
      expect(typeof allowlist.clear).toBe('function');
    });

    it('should add entries with correct tenantId', () => {
      const allowlist = createTenantAllowlist('tenant-abc');

      allowlist.addCustomEntry('mail.example.com', 25, 'test', 'testing');

      const entries = allowlist.getAllEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].tenantId).toBe('tenant-abc');
    });

    it('should isolate entries between tenants', () => {
      const allowlist1 = createTenantAllowlist('tenant-1');
      const allowlist2 = createTenantAllowlist('tenant-2');

      // Add entry to tenant 1
      allowlist1.addCustomEntry('mail.tenant1.com', 25, 'test', 'tenant 1');

      // Tenant 2 should not see tenant 1's entries
      expect(allowlist2.isAllowed('mail.tenant1.com', 25)).toBe(false);

      // Tenant 1 should see its own entry
      expect(allowlist1.isAllowed('mail.tenant1.com', 25)).toBe(true);
    });

    it('should allow same hostname for different tenants', () => {
      const allowlist1 = createTenantAllowlist('tenant-a');
      const allowlist2 = createTenantAllowlist('tenant-b');

      allowlist1.addCustomEntry('mx.example.com', 25, 'user-a', 'tenant a');
      allowlist2.addCustomEntry('mx.example.com', 25, 'user-b', 'tenant b');

      // Both should allow their own entries
      expect(allowlist1.isAllowed('mx.example.com', 25)).toBe(true);
      expect(allowlist2.isAllowed('mx.example.com', 25)).toBe(true);
    });

    it('should clear only affects current tenant', () => {
      const allowlist1 = createTenantAllowlist('tenant-x');
      const allowlist2 = createTenantAllowlist('tenant-y');

      allowlist1.addCustomEntry('a.com', 25, 'test', 'x');
      allowlist2.addCustomEntry('b.com', 25, 'test', 'y');

      // Clear tenant 1
      allowlist1.clear();

      // Tenant 1 should be empty
      expect(allowlist1.getAllEntries()).toHaveLength(0);

      // Tenant 2 should still have entries
      expect(allowlist2.getAllEntries()).toHaveLength(1);
    });
  });

  describe('ProbeAllowlistManager', () => {
    let manager: ProbeAllowlistManager;

    beforeEach(() => {
      manager = new ProbeAllowlistManager();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should get or create tenant allowlist', () => {
      const allowlist1 = manager.getTenantAllowlist('tenant-new');
      const allowlist2 = manager.getTenantAllowlist('tenant-new');

      // Should return same instance for same tenant
      expect(allowlist1).toBe(allowlist2);
    });

    it('should isolate tenants via manager', () => {
      manager.getTenantAllowlist('tenant-1').addCustomEntry('host1.com', 25, 'test', '1');
      manager.getTenantAllowlist('tenant-2').addCustomEntry('host2.com', 25, 'test', '2');

      expect(manager.isAllowed('tenant-1', 'host1.com', 25)).toBe(true);
      expect(manager.isAllowed('tenant-1', 'host2.com', 25)).toBe(false);
      expect(manager.isAllowed('tenant-2', 'host2.com', 25)).toBe(true);
      expect(manager.isAllowed('tenant-2', 'host1.com', 25)).toBe(false);
    });

    it('should clear specific tenant', () => {
      manager.getTenantAllowlist('tenant-to-clear').addCustomEntry('x.com', 25, 'test', 'x');
      manager.getTenantAllowlist('tenant-to-keep').addCustomEntry('y.com', 25, 'test', 'y');

      manager.clearTenant('tenant-to-clear');

      expect(manager.isAllowed('tenant-to-clear', 'x.com', 25)).toBe(false);
      expect(manager.isAllowed('tenant-to-keep', 'y.com', 25)).toBe(true);
    });

    it('should list active tenants', () => {
      manager.getTenantAllowlist('tenant-a');
      manager.getTenantAllowlist('tenant-b');

      const tenants = manager.getActiveTenants();
      expect(tenants).toContain('tenant-a');
      expect(tenants).toContain('tenant-b');
    });

    it('should clear all tenants', () => {
      manager.getTenantAllowlist('tenant-1').addCustomEntry('a.com', 25, 'test', '1');
      manager.getTenantAllowlist('tenant-2').addCustomEntry('b.com', 25, 'test', '2');

      manager.clearAll();

      expect(manager.getActiveTenants()).toHaveLength(0);
    });
  });

  describe('DNS result generation with tenant isolation', () => {
    it('should tag entries from DNS results with tenantId', () => {
      const allowlist = createTenantAllowlist('tenant-dns-test');

      const mockDnsResults = [
        {
          success: true,
          query: { name: 'example.com', type: 'MX' as const },
          answers: [
            { name: 'example.com', type: 'MX' as const, ttl: 300, data: '10 mail.example.com' },
          ],
        },
      ];

      const entries = allowlist.generateFromDnsResults('example.com', mockDnsResults);

      expect(entries).toHaveLength(1);
      expect(entries[0].tenantId).toBe('tenant-dns-test');
      expect(entries[0].hostname).toBe('mail.example.com');
      expect(entries[0].type).toBe('mx');
    });
  });

  describe('hostname canonicalization (Issue #67 review)', () => {
    it('canonicalizes mixed-case MX answers so lowercase probes are allowed', () => {
      const allowlist = createTenantAllowlist('tenant-mixed-case');

      const entries = allowlist.generateFromDnsResults('example.com', [
        {
          success: true,
          query: { name: 'example.com', type: 'MX' as const },
          answers: [
            {
              name: 'example.com',
              type: 'MX' as const,
              ttl: 300,
              data: '10 MAIL.EXAMPLE.COM.',
            },
          ],
        },
      ]);

      // Entry is stored canonical, matching the lowercase hosts the
      // persisted-evidence loader produces.
      expect(entries[0].hostname).toBe('mail.example.com');

      // Lookups are canonicalized too: raw-case and canonical queries both hit.
      expect(allowlist.isAllowed('mail.example.com', 25)).toBe(true);
      expect(allowlist.isAllowed('MAIL.EXAMPLE.COM', 25)).toBe(true);
      expect(allowlist.getEntry('Mail.Example.Com', 25)).toBeDefined();
    });

    it('canonicalizes custom entries', () => {
      const allowlist = createTenantAllowlist('tenant-custom-case');

      allowlist.addCustomEntry('RELAY.Example.ORG.', 25, 'ops', 'break-glass');

      expect(allowlist.isAllowed('relay.example.org', 25)).toBe(true);
      expect(allowlist.isAllowed('RELAY.EXAMPLE.ORG', 25)).toBe(true);
    });
  });
});
