export const MCP_TOOL_NAMES = [
  'domain_search',
  'domain_get_profile',
  'domain_get_posture',
  'snapshot_compare',
  'evidence_get',
  'signal_list',
  'case_get',
  'case_open',
  'case_set_disposition',
  'scan_request',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface McpToolDefinition {
  name: McpToolName;
  readOnly: boolean;
  requiredScope: 'CASE_READ' | 'CASE_WRITE' | 'SCAN_REQUEST';
  inputSchema: {
    type: 'object';
    required: readonly string[];
    properties: Record<string, { type: string }>;
  };
}

const id = { type: 'string' };
const idempotencyKey = { type: 'string' };

/** Phase 1's closed-world MCP contract. Never append ad-hoc tools. */
export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'domain_search',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: [], properties: { query: { type: 'string' } } },
  },
  {
    name: 'domain_get_profile',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: ['domainId'], properties: { domainId: id } },
  },
  {
    name: 'domain_get_posture',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: ['domainId'], properties: { domainId: id } },
  },
  {
    name: 'snapshot_compare',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: {
      type: 'object',
      required: ['domainId', 'leftSnapshotId', 'rightSnapshotId'],
      properties: { domainId: id, leftSnapshotId: id, rightSnapshotId: id },
    },
  },
  {
    name: 'evidence_get',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: ['snapshotId'], properties: { snapshotId: id } },
  },
  {
    name: 'signal_list',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: [], properties: { domainId: id } },
  },
  {
    name: 'case_get',
    readOnly: true,
    requiredScope: 'CASE_READ',
    inputSchema: { type: 'object', required: ['caseId'], properties: { caseId: id } },
  },
  {
    name: 'case_open',
    readOnly: false,
    requiredScope: 'CASE_WRITE',
    inputSchema: {
      type: 'object',
      required: ['domainId', 'conditionKey', 'idempotencyKey'],
      properties: { domainId: id, conditionKey: { type: 'string' }, idempotencyKey },
    },
  },
  {
    name: 'case_set_disposition',
    readOnly: false,
    requiredScope: 'CASE_WRITE',
    inputSchema: {
      type: 'object',
      required: ['caseId', 'disposition', 'expectedVersion', 'idempotencyKey'],
      properties: {
        caseId: id,
        disposition: { type: 'string' },
        expectedVersion: { type: 'number' },
        idempotencyKey,
      },
    },
  },
  {
    name: 'scan_request',
    readOnly: false,
    requiredScope: 'SCAN_REQUEST',
    inputSchema: {
      type: 'object',
      required: ['domainId', 'idempotencyKey'],
      properties: { domainId: id, idempotencyKey },
    },
  },
];

export function getMcpTool(name: string): McpToolDefinition | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}
