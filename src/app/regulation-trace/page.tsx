import AppLayout from '@/components/AppLayout';

import RegulationTraceClient from './components/RegulationTraceClient';
import { getRecentTraceCandidates } from './data';

export const dynamic = 'force-dynamic';

export default async function RegulationTracePage() {
  const recentCandidates = await getRecentTraceCandidates();

  return (
    <AppLayout>
      <RegulationTraceClient recentCandidates={recentCandidates} />
    </AppLayout>
  );
}
