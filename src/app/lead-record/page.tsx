'use client';

import React, { Suspense } from 'react';
import LeadRecordContent from './components/LeadRecordContent';

export default function LeadRecordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LeadRecordContent />
    </Suspense>
  );
}
