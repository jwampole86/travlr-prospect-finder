import React, { Suspense } from 'react';
import LeadProfileContent from './components/LeadProfileContent';

interface LeadProfilePageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function LeadProfilePage({ searchParams }: LeadProfilePageProps) {
  const params = await searchParams;
  const leadId = params.id ?? null;

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <LeadProfileContent leadId={leadId} />
    </Suspense>
  );
}
