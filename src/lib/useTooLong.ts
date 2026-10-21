import { useCallback, useEffect, useState } from "react";

/** Minimal shape of a TanStack Query result that the load-state helpers read. */
export type LoadableQuery = {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
  refetch: () => unknown;
};

/**
 * True once `active` has stayed true for `ms` without a break. Used to stop a
 * page sitting on "Loading…" forever: a request that hangs, or one React Query
 * has paused offline, never settles, so neither isError nor data ever arrives.
 * `restart()` starts the clock again (after "Try again").
 */
export function useTooLong(active: boolean, ms = 10_000) {
  const [tooLong, setTooLong] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!active) { setTooLong(false); return; }
    const id = setTimeout(() => setTooLong(true), ms);
    return () => clearTimeout(id);
  }, [active, ms, round]);
  const restart = useCallback(() => { setTooLong(false); setRound((r) => r + 1); }, []);
  return { tooLong: active && tooLong, restart };
}

/** Still waiting for a first answer (fetching, or paused while offline). */
export function isFirstLoad(q: LoadableQuery): boolean {
  return q.isPending && q.fetchStatus !== "idle";
}

/**
 * Load state across one or more queries:
 * - `loading`: any query still waiting for its first answer;
 * - `failed`: any query errored with nothing to show, or loading ran past `ms`;
 * - `retry()`: refetches the ones that failed or are still loading and restarts the clock.
 * A query that errors on a background refetch but still has data is not a failure.
 */
export function useLoadState(queries: LoadableQuery[], ms = 10_000) {
  const loading = queries.some(isFirstLoad);
  const errored = queries.some((q) => q.isError && q.data === undefined);
  const { tooLong, restart } = useTooLong(loading && !errored, ms);
  const retry = () => {
    restart();
    for (const q of queries) if ((q.isError && q.data === undefined) || isFirstLoad(q)) void q.refetch();
  };
  return { loading: loading && !errored, failed: errored || tooLong, retry };
}
