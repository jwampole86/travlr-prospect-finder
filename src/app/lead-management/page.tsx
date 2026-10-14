import { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import LeadManagementClient from './components/LeadManagementClient';
import { LeadTableSkeleton } from '@/components/ui/LoadingSkeleton';
import { cityRegulations } from '@/data/regulations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Leads load in the browser through the authenticated API, so nothing is read on the server for visitors who are not signed in.
export default async function LeadManagementPage() {

  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-2xl mx-auto w-full">
            <div className="mb-4">
              <div className="h-7 w-48 bg-muted animate-pulse rounded mb-1" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </div>
            <LeadTableSkeleton rows={12} />
          </div>
        }
      >
        <LeadManagementClient
          initialLeads={[]}
          totalLeads={0}
          regulations={cityRegulations}
        />
      </Suspense>
    </AppLayout>
  );
}