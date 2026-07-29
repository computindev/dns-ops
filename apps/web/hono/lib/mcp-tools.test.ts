import { describe, expect, it } from 'vitest';
import { getMcpTool, MCP_TOOL_NAMES, MCP_TOOLS } from './mcp-tools.js';

describe('MCP Phase 1 tool contract', () => {
  it('exposes exactly the approved ten tools', () => {
    expect(MCP_TOOLS).toHaveLength(10);
    expect(MCP_TOOLS.map((tool) => tool.name)).toEqual(MCP_TOOL_NAMES);
  });

  it('requires idempotency only for command tools and scopes every tool', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.requiredScope).toBeTruthy();
      if (!tool.readOnly) expect(tool.inputSchema.required).toContain('idempotencyKey');
    }
  });

  it('does not resolve unapproved tools', () => {
    expect(getMcpTool('provider_mutate')).toBeUndefined();
  });
});
