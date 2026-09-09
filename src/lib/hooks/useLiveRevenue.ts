'use client';

/**
 * useLiveRevenue — Independent hook for the Live Revenue KPI.
 *
 * ARCHITECTURE:
 *   Completely decoupled from useDashboardLeads.
 *   Has its own loading / data / error state.
 *   A live_revenue timeout NEVER blocks any other Dashboard section.
 *
 * TIMEOUT HANDLING:
 *   Uses AbortController signal passed directly to fetch().
 *   The timeout timer calls controller.abort() on the SAME controller.
 *   On unmount: timer is cleared AND controller is aborted.
 *   Each fetch gets its OWN controller + timer — no shared state races.
 *
 * DEDUPLICATION:
 *   A requestInFlight ref prevents duplicate concurrent requests.
 *   React Strict Mode double-invocation is handled by the cleanup function
 *   cancelling the first request before the second starts.
 *
 * ZERO vs ERROR:
 *   liveRevenue = 0  → legitimate result (no won deals) → show "$0"
 *   error = true     → query failed → show "—" / "Unable to load"
 *
 * NO FETCH LOOP:
 *   useEffect depends only on [fetchRevenue].
 *   fetchRevenue (useCallback) depends only on [portfolioState].
 *   portfolioState is a primitive string — stable reference.
 *   No dependency on loading/error/liveRevenue state.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

export interface UseLiveRevenueResult {
  /** The live revenue value. 0 is a legitimate result (no won deals). */
  liveRevenue: number;
  /** true while the request is in flight */
  loading: boolean;
  /** true if the request failed — show "—" not "$0" */
  error: boolean;
  /** Error message for display / logging */
  errorMessage: string | null;
  /** Manually re-fetch */
  refresh: () => void;
}

const TIMEOUT_MS = 15_000;

export function useLiveRevenue(portfolioState?: string, enabled = true): UseLiveRevenueResult {
  const [liveRevenue, setLiveRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  // Holds the cleanup function for the current in-flight request
  const cleanupRef = useRef<(() => void) | null>(null);
  // Tracks whether a request is currently in flight to prevent duplicates
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any in-flight request on unmount
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const fetchRevenue = useCallback(() => {
    // Cancel any previous in-flight request before starting a new one.
    // This handles React Strict Mode double-invocation: the cleanup from
    // the first effect run cancels the first request before the second starts.
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    requestInFlightRef.current = false;

    if (!enabled) {
      if (mountedRef.current) {
        setLoading(false);
        setError(false);
        setErrorMessage(null);
      }
      return;
    }

    // Each request gets its own AbortController and timer — no shared state.
    const controller = new AbortController();
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        timedOut = true;
        controller.abort();
      }
    }, TIMEOUT_MS);

    // Store cleanup for this specific request
    cleanupRef.current = () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };

    requestInFlightRef.current = true;

    if (mountedRef.current) {
      setLoading(true);
      setError(false);
      setErrorMessage(null);
    }

    const pState = portfolioState && portfolioState !== 'all' ? portfolioState : null;
    const url = `/api/dashboard/live-revenue${pState ? `?state=${encodeURIComponent(pState)}` : ''}`;
    const requestStart = performance.now();

    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        settled = true;
        clearTimeout(timer);
        requestInFlightRef.current = false;

        if (!mountedRef.current) return;

        const clientMs = Math.round(performance.now() - requestStart);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body.error ?? `HTTP ${res.status}`;
          console.error(`[useLiveRevenue] API error (${clientMs}ms):`, msg);
          if (mountedRef.current) {
            setError(true);
            setErrorMessage(msg);
            setLoading(false);
          }
          return;
        }

        const body = await res.json();
        const revenue = typeof body.liveRevenue === 'number' ? body.liveRevenue : 0;

        // Log the server-side trace if available
        if (body.meta) {
          console.log(
            `[useLiveRevenue] requestId=${body.meta.requestId ?? 'n/a'} ` +
            `clientMs=${clientMs}ms serverTotalMs=${body.meta.totalMs ?? 'n/a'}ms ` +
            `clientInitMs=${body.meta.clientInitMs ?? 'n/a'}ms ` +
            `authMs=${body.meta.authMs ?? 'n/a'}ms dbMs=${body.meta.dbMs ?? 'n/a'}ms ` +
            `path=${body.meta.path ?? 'n/a'}`
          );
        } else {
          console.log(`[useLiveRevenue] clientMs=${clientMs}ms revenue=${revenue}`);
        }

        if (mountedRef.current) {
          setLiveRevenue(revenue);
          setError(false);
          setErrorMessage(null);
          setLoading(false);
        }
      })
      .catch((e) => {
        settled = true;
        clearTimeout(timer);
        requestInFlightRef.current = false;

        if (!mountedRef.current) return;

        // AbortError can mean either timeout or unmount — distinguish them
        if (e instanceof Error && e.name === 'AbortError') {
          if (timedOut) {
            const clientMs = Math.round(performance.now() - requestStart);
            const msg = `live_revenue timed out after ${TIMEOUT_MS}ms (clientMs=${clientMs})`;
            console.error('[useLiveRevenue] fetch threw:', msg);
            if (mountedRef.current) {
              setError(true);
              setErrorMessage(msg);
              setLoading(false);
              // IMPORTANT: do NOT set liveRevenue = 0 on timeout.
              // Timeout ≠ $0 revenue.
            }
          }
          // If not timedOut, the abort was from unmount or a superseded request — ignore silently
          return;
        }

        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('[useLiveRevenue] fetch threw:', msg);

        if (mountedRef.current) {
          setError(true);
          setErrorMessage(msg);
          setLoading(false);
          // IMPORTANT: do NOT set liveRevenue = 0 on error.
          // Error ≠ $0 revenue.
        }
      });
  }, [enabled, portfolioState]);

  useEffect(() => {
    fetchRevenue();
    // fetchRevenue is stable — only changes when portfolioState changes.
    // No dependency on loading/error/liveRevenue → no self-triggering loop.
    // Cleanup function cancels the in-flight request on effect re-run or unmount.
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [fetchRevenue]);

  return {
    liveRevenue,
    loading,
    error,
    errorMessage,
    refresh: fetchRevenue,
  };
}
