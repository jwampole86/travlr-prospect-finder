'use client';

import { useAuth } from '@/contexts/AuthContext';

export default function AwaitingApproval({ email }: { email?: string | null }) {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">Your account is waiting for approval</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {email ? <>You&apos;re signed in as <span className="font-medium text-foreground">{email}</span>. </> : null}
          An administrator needs to approve your account before you can see any data. You&apos;ll be able to get in as soon as that happens. Try signing in again later.
        </p>
        <button onClick={() => void signOut()} className="mt-6 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Sign out</button>
      </div>
    </div>
  );
}
