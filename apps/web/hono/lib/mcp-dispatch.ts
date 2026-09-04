import type { IDatabaseAdapter } from '@dns-ops/db';
import type { Context } from 'hono';
import type { Env } from '../types.js';
import { type AuthenticatedMcpPrincipal, requireMcpScope } from './mcp-auth.js';
import { McpCaseCommandService } from './mcp-case-command-service.js';
import { McpNotFoundError, McpReadService } from './mcp-read-service.js';
import { McpScanService } from './mcp-scan-service.js';
import { getMcpTool } from './mcp-tools.js';

export class McpDispatchError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

function argumentsObject(value: unknown, toolName: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new McpDispatchError(-32602, `${toolName} arguments must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateArguments(name: string, value: unknown): Record<string, unknown> {
  const tool = getMcpTool(name);
  if (!tool) throw new McpDispatchError(-32601, 'Tool not found');
  const args = argumentsObject(value, name);
  for (const required of tool.inputSchema.required) {
    if (!(required in args)) throw new McpDispatchError(-32602, `${name} requires ${required}`);
  }
  for (const [key, argument] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[key];
    if (!schema || typeof argument !== schema.type) {
      throw new McpDispatchError(-32602, `${name} has invalid ${key}`);
    }
  }
  return args;
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

export async function dispatchMcpTool(
  context: Context<Env>,
  db: IDatabaseAdapter,
  principal: AuthenticatedMcpPrincipal,
  name: string,
  rawArguments: unknown
) {
  const tool = getMcpTool(name);
  if (!tool) throw new McpDispatchError(-32601, 'Tool not found');
  const args = validateArguments(name, rawArguments);
  requireMcpScope(principal, tool.requiredScope);
  const read = new McpReadService(db, principal);
  let value: unknown;
  switch (name) {
    case 'domain_search':
      value = await read.domainSearch((args.query as string | undefined) ?? '');
      break;
    case 'domain_get_profile':
      value = await read.domainProfile(args.domainId as string);
      break;
    case 'domain_get_posture':
      value = await read.domainPosture(args.domainId as string);
      break;
    case 'snapshot_compare':
      value = await read.snapshotCompare(
        args.domainId as string,
        args.leftSnapshotId as string,
        args.rightSnapshotId as string
      );
      break;
    case 'evidence_get':
      value = await read.evidence(args.snapshotId as string);
      break;
    case 'signal_list':
      value = await read.signalList(args.domainId as string | undefined);
      break;
    case 'fleet_tape':
      value = await read.fleetTape();
      break;
    case 'case_get':
      value = await read.caseGet(args.caseId as string);
      break;
    case 'explain_case':
      value = await read.explainCase(args.caseKind as string);
      break;
    case 'case_open':
      value = await new McpCaseCommandService(db, principal).caseOpen(
        args as { domainId: string; conditionKey: string; idempotencyKey: string }
      );
      break;
    case 'case_set_disposition':
      value = await new McpCaseCommandService(db, principal).caseSetDisposition(
        args as {
          caseId: string;
          disposition: string;
          expectedVersion: number;
          idempotencyKey: string;
        }
      );
      break;
    case 'scan_request':
      value = await new McpScanService(context, db, principal).request(
        args as { domainId: string; idempotencyKey: string }
      );
      break;
    default:
      throw new McpDispatchError(-32601, 'Tool not found');
  }
  return toolResult(value);
}

export function toMcpDispatchError(error: unknown): McpDispatchError {
  if (error instanceof McpDispatchError) return error;
  if (error instanceof McpNotFoundError) return new McpDispatchError(-32004, 'Resource not found');
  if (error instanceof Error && error.message === 'MCP scope denied')
    return new McpDispatchError(-32003, 'Scope denied');
  return new McpDispatchError(-32603, 'Tool execution failed');
}
