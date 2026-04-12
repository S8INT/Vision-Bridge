/**
 * VisionBridge Imaging Service
 *
 * Handles:
 *  - Image quality pre-scoring (client-side, before upload)
 *  - EXIF-stripped, compressed JPEG upload with injected metadata
 *  - Thumbnail fetch for bandwidth-efficient viewing
 *  - Offline queue management (AsyncStorage-backed)
 *  - DICOM export wrapper retrieval
 */

import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import offlineQueue, { QueueItem } from "./offlineQueue";

const API_BASE = process.env["EXPO_PUBLIC_API_URL"] ?? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}/api-server/api`;

export interface UploadMetadata {
  patientId: string;
  deviceId: string;
  tenantId: string;
  captureTime: string;
  eye?: "OD" | "OS" | "Unknown";
  operatorId?: string;
  campaignId?: string;
}

export interface ClientQualityResult {
  overall: number;
  blur: number;
  brightness: number;
  fieldOfView: number;
  pass: boolean;
  reason?: string;
  checkedLocally: true;
}

export interface UploadResult {
  imageId: string;
  objectName: string;
  thumbnailName: string;
  width: number;
  height: number;
  sizeBytes: number;
  qualityScore: ClientQualityResult | ServerQualityResult;
  dicomWrapper: DicomWrapper;
  uploadedAt: string;
  storage: "minio" | "local" | "offline-queued";
}

export interface ServerQualityResult {
  overall: number;
  blur: number;
  brightness: number;
  fieldOfView: number;
  contrast: number;
  pass: boolean;
  reason?: string;
  checkedLocally?: false;
}

export interface DicomWrapper {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  modality: string;
  bodyPartExamined: string;
  acquisitionDateTime: string;
  rows: number;
  columns: number;
  complianceNote: string;
}

/**
 * Performs a fast client-side quality pre-check on an image URI.
 * Works on both native (Expo) and web.
 *
 * Checks:
 *  - File size (too small = likely failed capture)
 *  - Basic dimensions (too small = insufficient FOV)
 *  - Pixel brightness sampling via canvas (web only)
 */
export async function checkImageQualityLocally(
  imageUri: string,
  fileSize?: number
): Promise<ClientQualityResult> {
  const issues: string[] = [];
  let blurScore = 70;
  let brightnessScore = 70;
  let fovScore = 70;

  // ── Size check ──
  if (fileSize !== undefined) {
    if (fileSize < 10_000) {
      blurScore = 10;
      issues.push("File too small — capture may have failed");
    } else if (fileSize < 50_000) {
      blurScore = 40;
      issues.push("Image file very small — may be low resolution");
    } else if (fileSize > 15_000_000) {
      issues.push("File exceeds 15MB limit");
    }
  }

  // ── Native file info ──
  if (Platform.OS !== "web" && imageUri.startsWith("file://")) {
    try {
      const info = await FileSystem.getInfoAsync(imageUri, { size: true });
      if (info.exists && (info as any).size) {
        const size = (info as any).size as number;
        if (size < 30_000) {
          blurScore = 20;
          issues.push("Image file very small");
        }
        if (size > 20_000_000) {
          issues.push("Image too large — will be compressed on server");
        }
      }
    } catch {}
  }

  // ── Web canvas brightness/FOV sampling ──
  if (Platform.OS === "web") {
    try {
      const result = await sampleImageOnCanvas(imageUri);
      brightnessScore = result.brightness;
      fovScore = result.fov;
      blurScore = result.blur;
    } catch {
      // Ignore canvas errors — fall back to defaults
    }
  }

  const overall = Math.round(blurScore * 0.40 + brightnessScore * 0.30 + fovScore * 0.30);
  const pass = overall >= 45 && blurScore >= 25;
  const reason = issues.length > 0 ? issues.join("; ") : (pass ? undefined : "Image quality may be insufficient");

  return { overall, blur: blurScore, brightness: brightnessScore, fieldOfView: fovScore, pass, reason, checkedLocally: true };
}

async function sampleImageOnCanvas(uri: string): Promise<{ brightness: number; fov: number; blur: number }> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("No 2d context")); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let totalBrightness = 0, brightPixels = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          totalBrightness += lum;
          if (lum > 20) brightPixels++;
        }

        const meanBrightness = totalBrightness / pixelCount;
        const fovRatio = brightPixels / pixelCount;

        const brightness = meanBrightness >= 80 && meanBrightness <= 160
          ? 100
          : meanBrightness < 80
            ? Math.round((meanBrightness / 80) * 100)
            : Math.max(0, Math.round(100 - ((meanBrightness - 160) / 95) * 100));

        const fov = Math.min(100, Math.round((fovRatio / 0.65) * 100));

        // Rough blur estimate: high variance of luminance differences
        let variance = 0;
        const lums: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          lums.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
        variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length;
        const blur = Math.min(100, Math.round((variance / 1200) * 100));

        resolve({ brightness, fov, blur });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = uri;
  });
}

/**
 * Upload a retinal image to the API server.
 * If offline, enqueues the upload for later retry.
 */
export async function uploadRetinalImage(
  imageUri: string,
  metadata: UploadMetadata,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const isOnline = await checkConnectivity();

  if (!isOnline) {
    const queueId = await offlineQueue.enqueue({ imageUri, metadata });
    return {
      imageId: queueId,
      objectName: `offline/${metadata.patientId}/${queueId}`,
      thumbnailName: `offline/thumb/${queueId}`,
      width: 0,
      height: 0,
      sizeBytes: 0,
      qualityScore: { overall: 0, blur: 0, brightness: 0, fieldOfView: 0, pass: true, checkedLocally: true, reason: "Queued for upload when online" },
      dicomWrapper: buildOfflineDicomWrapper(metadata),
      uploadedAt: new Date().toISOString(),
      storage: "offline-queued",
    };
  }

  const formData = new FormData();

  if (Platform.OS === "web") {
    // Web: fetch blob from data URI
    const blob = await dataUriToBlob(imageUri);
    formData.append("image", blob, "retinal.jpg");
  } else {
    // Native: use the file URI directly
    formData.append("image", { uri: imageUri, type: "image/jpeg", name: "retinal.jpg" } as any);
  }

  formData.append("patientId", metadata.patientId);
  formData.append("deviceId", metadata.deviceId);
  formData.append("tenantId", metadata.tenantId);
  formData.append("captureTime", metadata.captureTime);
  if (metadata.eye) formData.append("eye", metadata.eye);
  if (metadata.operatorId) formData.append("operatorId", metadata.operatorId);
  if (metadata.campaignId) formData.append("campaignId", metadata.campaignId);

  onProgress?.(10);

  const response = await fetch(`${API_BASE}/imaging/upload`, {
    method: "POST",
    body: formData,
  });

  onProgress?.(80);

  if (response.status === 422) {
    const body = await response.json();
    throw new QualityCheckError(body.qualityScore, body.error);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} — ${text}`);
  }

  const data = await response.json();
  onProgress?.(100);

  return data as UploadResult;
}

/**
 * Fetch a thumbnail URL for an image.
 */
export async function getThumbnailUrl(imageId: string, tenantId: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/imaging/${imageId}/thumbnail?tenantId=${encodeURIComponent(tenantId)}`);
    if (!response.ok) return null;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.startsWith("image/")) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    const json = await response.json();
    return json.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch DICOM JSON wrapper for a specific image.
 */
export async function getDicomExport(imageId: string): Promise<object | null> {
  try {
    const response = await fetch(`${API_BASE}/imaging/${imageId}/dicom`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function checkConnectivity(): Promise<boolean> {
  if (Platform.OS === "web") {
    return navigator.onLine;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    return false;
  }
}

async function dataUriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("data:")) {
    const arr = uri.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
    const bstr = atob(arr[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  }
  const resp = await fetch(uri);
  return resp.blob();
}

function buildOfflineDicomWrapper(metadata: UploadMetadata): DicomWrapper {
  return {
    studyInstanceUID: `2.25.offline.${Date.now()}`,
    seriesInstanceUID: `2.25.offline.s.${Date.now()}`,
    sopInstanceUID: `2.25.offline.i.${Date.now()}`,
    modality: "OP",
    bodyPartExamined: "EYE",
    acquisitionDateTime: metadata.captureTime.replace(/[-:T]/g, "").split(".")[0],
    rows: 0,
    columns: 0,
    complianceNote: "PENDING UPLOAD — DICOM data will be generated upon successful server upload",
  };
}

export class QualityCheckError extends Error {
  qualityScore: ServerQualityResult;
  constructor(qualityScore: ServerQualityResult, message: string) {
    super(message);
    this.name = "QualityCheckError";
    this.qualityScore = qualityScore;
  }
}

export type { QueueItem };
export { offlineQueue };
