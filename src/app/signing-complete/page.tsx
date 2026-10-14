'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';

// DocuSign sends the signer here when they finish. Inside our signing window it tells the parent how it ended.
function Result() {
  const event = useSearchParams().get('event') ?? '';
  const done = event === 'signing_complete';

  useEffect(() => {
    if (window.parent !== window) window.parent.postMessage({ type: 'docusign-return', event }, window.location.origin);
  }, [event]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm">
        {done ? <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" /> : <XCircle className="w-12 h-12 text-muted-foreground mx-auto" />}
        <h1 className="mt-4 text-lg font-semibold text-foreground">{done ? 'Thank you, your signature is recorded' : 'Signing was not completed'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {done ? 'You will receive a copy of the signed agreement from DocuSign once everyone has signed.' : 'You can reopen the agreement from your email or ask your agent to resend it.'}
        </p>
      </div>
    </div>
  );
}

export default function SigningCompletePage() {
  return <Suspense fallback={null}><Result /></Suspense>;
}
