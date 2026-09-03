import { describe, expect, it } from 'vitest';
import { getMcpTool, MCP_TOOL_NAMES, MCP_TOOLS } from './mcp-tools.js';

describe('MCP Phase 1 tool contract', () => {
  it('exposes exactly the approved tool set (issues #61/#57: explain_case, fleet_tape)', () => {
    expect(MCP_TOOLS).toHaveLength(12);
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
  });

  it('requires idempotency only for command tools and scopes every tool', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.requiredScope).toBeTruthy();
      if (!tool.readOnly) expect(tool.inputSchema.required).toContain('idempotencyKey');
    }
  });

  it('assigns least-privilege Phase 1 read scopes', () => {
    expect(getMcpTool('domain_search')?.requiredScope).toBe('DOMAIN_READ');
    expect(getMcpTool('evidence_get')?.requiredScope).toBe('DOMAIN_READ');
    expect(getMcpTool('signal_list')?.requiredScope).toBe('SIGNAL_READ');
    expect(getMcpTool('case_get')?.requiredScope).toBe('CASE_READ');
    expect(getMcpTool('explain_case')?.requiredScope).toBe('CASE_READ');
  });

  it('keeps the fleet tape read-only at domain-read scope without arguments', () => {
    const tool = getMcpTool('fleet_tape');
    expect(tool).toBeDefined();
    expect(tool?.readOnly).toBe(true);
    expect(tool?.requiredScope).toBe('DOMAIN_READ');
    expect(tool?.inputSchema.required).toEqual([]);
  });

  it('does not resolve unapproved tools', () => {
    expect(getMcpTool('provider_mutate')).toBeUndefined();
  });
});
