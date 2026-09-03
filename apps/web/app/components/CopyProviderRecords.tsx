/**
 * Copy provider records (issue #59).
 *
 * Clipboard-only affordance on the finding and guidance surfaces: copies the
 * provider-aligned MX/SPF/DKIM records so operators stop retyping them.
 * No DNS apply — nothing is sent to any API.
 */

import { useState } from 'react';
import {
  type CopyableProvider,
  providerName,
  recordsToClipboardText,
} from '../lib/provider-records.js';

const PROVIDERS: CopyableProvider[] = ['google-workspace', 'microsoft-365'];

export function CopyProviderRecords({ domain }: { domain: string }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const copy = async (provider: CopyableProvider) => {
    setError('');
    try {
      await navigator.clipboard.writeText(recordsToClipboardText(provider, domain));
      setStatus(
        `${providerName(provider)} MX, SPF, and DKIM records for ${domain} copied. Fill the <placeholders> from your provider admin; nothing is applied here.`
      );
    } catch {
      setStatus('');
      setError('Clipboard access was blocked by the browser.');
    }
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <h6 className="text-xs font-semibold text-blue-900 uppercase tracking-wider">
        Copy provider records
      </h6>
      <p className="mt-1 text-xs text-blue-900">
        Copy provider-aligned MX, SPF, and DKIM records for {domain} to paste into your DNS
        provider. Tenant-specific values are marked {'<like this>'}. No DNS changes are applied.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            aria-label={`Copy ${providerName(provider)} records for ${domain}`}
            onClick={() => void copy(provider)}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Copy {providerName(provider)} records
          </button>
        ))}
      </div>
      {status && (
        <p className="mt-2 text-xs text-green-700" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
