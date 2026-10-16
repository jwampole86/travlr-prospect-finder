'use client';

import React from 'react';
import AppLayout from '@/components/AppLayout';
import IntegrationHealthClient from './components/IntegrationHealthClient';

export default function IntegrationHealthPage() {
  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <IntegrationHealthClient />
      </div>
    </AppLayout>
  );
}
