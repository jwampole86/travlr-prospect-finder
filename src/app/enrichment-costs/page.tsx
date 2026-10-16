'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import EnrichmentCostsClient from './components/EnrichmentCostsClient';

export default function EnrichmentCostPage() {
  return (
    <AppLayout>
      <div className="px-3 py-4 sm:px-6 sm:py-5">
        <EnrichmentCostsClient />
      </div>
    </AppLayout>
  );
}
