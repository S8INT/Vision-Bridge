/**
 * VisionBridge Offline Upload Queue
 *
 * Persists pending image uploads in AsyncStorage.
 * Items survive app restarts and are retried when connectivity returns.
 *
 * Queue item lifecycle:
 *   queued → uploading → uploaded | failed → (retry → uploading)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { UploadMetadata } from "./imagingService";

const QUEUE_KEY = "visionbridge_image_queue_v1";
const MAX_RETRIES = 5;

export interface QueueItem {
  queueId: string;
  imageUri: string;
  metadata: UploadMetadata;
  enqueuedAt: string;
  status: "queued" | "uploading" | "uploaded" | "failed";
  retries: number;
  lastAttemptAt?: string;
  errorMsg?: string;
  resultImageId?: string;
}

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

async function enqueue(payload: { imageUri: string; metadata: UploadMetadata }): Promise<string> {
  const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item: QueueItem = {
    queueId,
    imageUri: payload.imageUri,
    metadata: payload.metadata,
    enqueuedAt: new Date().toISOString(),
    status: "queued",
    retries: 0,
  };
  const queue = await loadQueue();
  queue.push(item);
  await saveQueue(queue);
  return queueId;
}

async function getAll(): Promise<QueueItem[]> {
  return loadQueue();
}

async function getPending(): Promise<QueueItem[]> {
  const queue = await loadQueue();
  return queue.filter((i) => i.status === "queued" || (i.status === "failed" && i.retries < MAX_RETRIES));
}

async function markUploading(queueId: string): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: "uploading", lastAttemptAt: new Date().toISOString() };
    await saveQueue(queue);
  }
}

async function markUploaded(queueId: string, resultImageId: string): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], status: "uploaded", resultImageId };
    await saveQueue(queue);
  }
}

async function markFailed(queueId: string, error: string): Promise<void> {
  const queue = await loadQueue();
  const idx = queue.findIndex((i) => i.queueId === queueId);
  if (idx !== -1) {
    queue[idx] = {
      ...queue[idx],
      status: "failed",
      retries: queue[idx].retries + 1,
      errorMsg: error,
      lastAttemptAt: new Date().toISOString(),
    };
    await saveQueue(queue);
  }
}

async function remove(queueId: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((i) => i.queueId !== queueId));
}

async function clearUploaded(): Promise<number> {
  const queue = await loadQueue();
  const before = queue.length;
  await saveQueue(queue.filter((i) => i.status !== "uploaded"));
  return before - queue.filter((i) => i.status !== "uploaded").length;
}

async function getStats(): Promise<{
  total: number;
  queued: number;
  uploading: number;
  uploaded: number;
  failed: number;
  permanentlyFailed: number;
}> {
  const queue = await loadQueue();
  return {
    total: queue.length,
    queued: queue.filter((i) => i.status === "queued").length,
    uploading: queue.filter((i) => i.status === "uploading").length,
    uploaded: queue.filter((i) => i.status === "uploaded").length,
    failed: queue.filter((i) => i.status === "failed" && i.retries < MAX_RETRIES).length,
    permanentlyFailed: queue.filter((i) => i.status === "failed" && i.retries >= MAX_RETRIES).length,
  };
}

/**
 * Process the offline queue — upload all pending items.
 * Call this when connectivity is restored.
 */
async function processQueue(
  uploadFn: (item: QueueItem) => Promise<string>,
  onItemResult?: (queueId: string, success: boolean, error?: string) => void
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const pending = await getPending();
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    await markUploading(item.queueId);
    try {
      const resultImageId = await uploadFn(item);
      await markUploaded(item.queueId, resultImageId);
      onItemResult?.(item.queueId, true);
      succeeded++;
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";
      await markFailed(item.queueId, msg);
      onItemResult?.(item.queueId, false, msg);
      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}

const offlineQueue = {
  enqueue,
  getAll,
  getPending,
  markUploading,
  markUploaded,
  markFailed,
  remove,
  clearUploaded,
  getStats,
  processQueue,
  MAX_RETRIES,
};

export default offlineQueue;
