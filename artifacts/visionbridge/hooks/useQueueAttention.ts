/**
 * useQueueAttention — count of upload-queue items needing attention
 * (queued, uploading, or failed). Polls AsyncStorage-backed stats so
 * tab badges stay current without a context provider.
 */
import { useCallback, useEffect, useState } from "react";
import offlineQueue from "@/services/offlineQueue";

const POLL_MS = 15_000;

export function useQueueAttention(enabled = true): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const s = await offlineQueue.getStats();
      setCount(s.queued + s.uploading + s.failed + s.permanentlyFailed);
    } catch {
      // ignore — badge is best-effort
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  return enabled ? count : 0;
}
