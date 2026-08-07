import { createFileRoute } from '@tanstack/react-router';
import { AuthPending } from '../components/AuthPending.js';
import { CasesWorkspace } from '../components/CasesWorkspace.js';
import { requireAuthGuard } from '../lib/auth-guard.js';

export const Route = createFileRoute('/cases')({
  beforeLoad: async () => {
    await requireAuthGuard();
  },
  pendingComponent: AuthPending,
  component: CasesRoute,
});

function CasesRoute() {
  return <CasesWorkspace />;
}
