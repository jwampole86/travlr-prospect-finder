import AppLayout from '@/components/AppLayout';

import EscalatedLeadsClient from './components/EscalatedLeadsClient';
import { getEscalatedLeadsPageData } from './data';

export const dynamic = 'force-dynamic';

export default async function EscalatedLeadsPage() {
  const data = await getEscalatedLeadsPageData();

  return (
    <AppLayout>
      <EscalatedLeadsClient initialData={data} />
    </AppLayout>
  );
}
