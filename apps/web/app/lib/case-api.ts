import type {
  InternalCaseStatus,
  InternalSignalKind,
  InternalSignalStatus,
} from '@dns-ops/contracts';

export interface CaseRecord {
  id: string;
  domainId: string;
  signalId: string;
  status: InternalCaseStatus;
  version: number;
  disposition: string | null;
  note: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  verificationSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalRecord {
  id: string;
  domainId: string;
  kind: InternalSignalKind;
  conditionKey: string;
  status: InternalSignalStatus;
  firstSeenSnapshotId: string | null;
  lastSeenSnapshotId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface CaseEventRecord {
  id: string;
  caseId: string;
  actorId: string;
  fromStatus: InternalCaseStatus | null;
  toStatus: InternalCaseStatus;
  note: string | null;
  disposition: string | null;
  verificationSnapshotId: string | null;
  createdAt: string;
}

export interface CaseListItem {
  case: CaseRecord;
  signal: SignalRecord;
}

export interface CaseDetail extends CaseListItem {
  events: CaseEventRecord[];
}

type ApiError = Error & { status?: number; code?: string };

function timeoutFetch(input: RequestInfo, init: RequestInit, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });

  return fetch(input, { ...init, credentials: 'include', signal: controller.signal }).finally(
    () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abort);
    }
  );
}

async function responseError(response: Response, fallback: string): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  const error = new Error(body.error || fallback) as ApiError;
  error.status = response.status;
  error.code = body.code;
  return error;
}

export async function fetchCases(signal?: AbortSignal): Promise<CaseListItem[]> {
  const response = await timeoutFetch('/api/cases', {}, signal);
  if (!response.ok) throw await responseError(response, 'Cases are unavailable');
  const body = (await response.json()) as { cases?: CaseListItem[] };
  return body.cases ?? [];
}

export async function fetchCase(caseId: string, signal?: AbortSignal): Promise<CaseDetail> {
  const response = await timeoutFetch(`/api/cases/${encodeURIComponent(caseId)}`, {}, signal);
  if (!response.ok) throw await responseError(response, 'Case is unavailable');
  return (await response.json()) as CaseDetail;
}

export async function saveCaseDisposition(input: {
  caseId: string;
  disposition: string;
  expectedVersion: number;
}): Promise<CaseRecord> {
  const response = await timeoutFetch(
    `/api/cases/${encodeURIComponent(input.caseId)}/disposition`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disposition: input.disposition,
        expectedVersion: input.expectedVersion,
      }),
    }
  );
  if (!response.ok) throw await responseError(response, 'Could not save the case disposition');
  const body = (await response.json()) as { case: CaseRecord };
  return body.case;
}
