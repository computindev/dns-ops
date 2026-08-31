import { describe, expect, it } from 'vitest';
import { statusBadge } from './FleetReportsPanel.js';

describe('FleetReportsPanel status badges', () => {
  it('renders unknown with unknown styling, never success styling', () => {
    expect(statusBadge('unknown')).toEqual({ style: 'ds-badge--unknown', icon: '?' });
    expect(statusBadge('unknown').style).not.toBe('ds-badge--success');
  });

  it('keeps affirmative outcomes distinct from unknown', () => {
    expect(statusBadge('pass')).toEqual({ style: 'ds-badge--success', icon: '✓' });
    expect(statusBadge('fail')).toEqual({ style: 'ds-badge--danger', icon: '✗' });
    expect(statusBadge('warning')).toEqual({ style: 'ds-badge--warning', icon: '!' });
    expect(statusBadge('missing')).toEqual({ style: 'ds-badge--unknown', icon: '?' });
  });
});
