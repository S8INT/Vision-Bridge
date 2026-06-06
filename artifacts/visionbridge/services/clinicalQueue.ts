/**
 * VisionBridge Clinical Offline Queue
 *
 * Persists pending patient registrations and screenings in AsyncStorage.
 * Survives app restarts; items are retried automatically when connectivity
 * returns. Separate from the image-upload queue (offlineQueue.ts).
 *
 * Item lifecycle: queued → syncing → synced | failed → (retry → syncing)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Patient, Screening } from "@/context/AppContext";

const QUEUE_KEY = "visionbridge_clinical_queue_v1";
const MAX_RETRIES = 6;

export type ClinicalItemType = "patient" | "screening";

export interface ClinicalQueueItem {
  queueId: string;
  type: ClinicalItemType;
  tempId: string;
  payload: Omit<Patient, "id" | "registeredAt"> | Omit<Screening, "id" | "capturedAt">;
  enqueuedAt: string;
  status: "queued" | "syncing" | "synced" | "failed";
  retries: number;
  lastAttemptAt?: string;
  errorMsg?: string;
}

export interface ClinicalQueueStats {
  total: number;
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
async function load(): Promise<ClinicalQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ClinicalQueueItem[]) : [];
  } catch {
    return [];
  }
}

async function save(items: ClinicalQueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("[clinicalQueue] save failed:", e);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
async function enqueuePatient(
  tempId: string,
  payload: Omit<Patient, "id" | "registeredAt">,
): Promise<string> {
  return _enqueue("patient", tempId, payload);
}

async function enqueueScreening(
  tempId: string,
  payload: Omit<Screening, "id" | "capturedAt">,
): Promise<string> {
  return _enqueue("screening", tempId, payload);
}

async function _enqueue(
  type: ClinicalItemType,
  tempId: string,
  payload: ClinicalQueueItem["payload"],
): Promise<string> {
  const queueId = `cq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item: ClinicalQueueItem = {
    queueId,
    type,
    tempId,
    payload,
    enqueuedAt: new Date().toISOString(),
    status: "queued",
    retries: 0,
  };
  const queue = await load();
  queue.push(item);
  await save(queue);
  return queueId;
}

async function getPending(): Promise<ClinicalQueueItem[]> {
  const queue = await load();
  return queue.filter(
    (i) =>
      i.status === "queued" ||
      i.status === "syncing" ||
      (i.status === "failed" && i.retries < MAX_RETRIES),
  );
}

async function markSyncing(queueId: string): Promise<void> {
  const queue = await load();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: "syncing", lastAttemptAt: new Date().toISOString() };
    await save(queue);
  }
}

async function markSynced(queueId: string): Promise<void> {
  const queue = await load();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: "synced" };
    await save(queue);
  }
}

async function markFailed(queueId: string, error: string): Promise<void> {
  const queue = await load();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = {
      ...queue[idx],
      status: "failed",
      retries: queue[idx].retries + 1,
      errorMsg: error,
      lastAttemptAt: new Date().toISOString(),
    };
    await save(queue);
  }
}

async function getStats(): Promise<ClinicalQueueStats> {
  const queue = await load();
  const pending = queue.filter(
    (i) =>
      i.status === "queued" ||
      i.status === "syncing" ||
      (i.status === "failed" && i.retries < MAX_RETRIES),
  ).length;
  return {
    total:   queue.length,
    pending,
    syncing: queue.filter((i) => i.status === "syncing").length,
    synced:  queue.filter((i) => i.status === "synced").length,
    failed:  queue.filter((i) => i.status === "failed").length,
  };
}

async function clearSynced(): Promise<void> {
  const queue = await load();
  await save(queue.filter((i) => i.status !== "synced"));
}

const clinicalQueue = {
  enqueuePatient,
  enqueueScreening,
  getPending,
  markSyncing,
  markSynced,
  markFailed,
  getStats,
  clearSynced,
  MAX_RETRIES,
};

export default clinicalQueue;
