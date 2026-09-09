'use client';

import React, { Suspense } from 'react';
import SMSInboundThreadsClient from './SMSInboundThreadsClient';

export default function SMSInboundThreadsPage() {
  return (
    <Suspense fallback={null}>
      <SMSInboundThreadsClient />
    </Suspense>
  );
}
