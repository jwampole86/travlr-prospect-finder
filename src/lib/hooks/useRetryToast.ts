'use client';

import { toast } from 'sonner';

/**
 * useRetryToast — shows a specific error toast with a one-click retry button.
 * Use this for any async action that can fail: sync jobs, enrichment, email sends.
 */

export interface RetryToastOptions {
  /** Short, specific error message shown to the user */
  message: string;
  /** Optional detail (e.g. HTTP status, server message) */
  detail?: string;
  /** The async function to re-run on retry */
  onRetry?: () => void | Promise<void>;
  /** Toast duration in ms (default: 8000) */
  duration?: number;
}

export function showErrorWithRetry({
  message,
  detail,
  onRetry,
  duration = 8000,
}: RetryToastOptions): string | number {
  const id = toast.error(message, {
    description: detail,
    duration,
    action: onRetry
      ? {
          label: 'Retry',
          onClick: () => {
            toast.dismiss(id);
            Promise.resolve(onRetry()).catch(() => {});
          },
        }
      : undefined,
  });
  return id;
}

/**
 * Wraps an async function with automatic error-toast-with-retry on failure.
 * Returns the result or undefined on failure.
 */
export async function withRetryToast<T>(
  fn: () => Promise<T>,
  errorMessage: string,
  onRetry?: () => void | Promise<void>
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    showErrorWithRetry({ message: errorMessage, detail, onRetry });
    return undefined;
  }
}
