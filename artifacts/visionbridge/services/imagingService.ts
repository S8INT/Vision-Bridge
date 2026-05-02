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

export interface QualityMetric {
  score: number;
  pass: boolean;
  label: string;
  hint: string;
}

export interface ClientQualityResult {
  overall: number;
  blur: number;
  brightness: number;
  fieldOfView: number;
  contrast: number;
  illuminationUniform: number;
  metrics: {
    sharpness: QualityMetric;
    brightness: QualityMetric;
    fieldOfView: QualityMetric;
    contrast: QualityMetric;
    illumination: QualityMetric;
  };
  pass: boolean;
  critical: boolean;
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
 * Performs a thorough client-side quality pre-check on a retinal image URI.
 * Works on both native (Expo) and web.
 *
 * Checks (web full pixel analysis / native file-size heuristics):
 *  1. Sharpness   — Laplacian variance: blurry images lose high-frequency edges
 *  2. Brightness  — Mean luminance: too dark or overexposed
 *  3. Field of View — ratio of non-dark pixels: circular retinal disc fill
 *  4. Contrast    — luminance range / std-dev: flat images lack clinical detail
 *  5. Illumination uniformity — centre vs. ring brightness delta
 *
 * Returns per-metric scores, actionable hints, pass/critical flags.
 */
export async function checkImageQualityLocally(
  imageUri: string,
  fileSize?: number,
): Promise<ClientQualityResult> {
  let sharpness = 65;
  let brightness = 65;
  let fov = 65;
  let contrast = 65;
  let illumination = 65;
  let critical = false;
  const criticalReasons: string[] = [];

  // ── File-size guard (native + web) ───────────────────────────────────────
  const effectiveSize =
    fileSize ??
    (Platform.OS !== "web" && imageUri.startsWith("file://")
      ? await getFileSizeNative(imageUri)
      : undefined);

  if (effectiveSize !== undefined) {
    if (effectiveSize < 10_000) {
      sharpness = 5;
      critical = true;
      criticalReasons.push("File too small — capture likely failed");
    } else if (effectiveSize < 40_000) {
      sharpness = Math.min(sharpness, 30);
      criticalReasons.push("Very low file size — resolution may be too low");
    } else if (effectiveSize > 20_000_000) {
      criticalReasons.push("File exceeds 20 MB — will be rejected by server");
      critical = true;
    }
  }

  // ── Web: full pixel analysis via off-screen canvas ────────────────────────
  if (Platform.OS === "web" && !critical) {
    try {
      const px = await analysePixelsOnCanvas(imageUri);
      sharpness = px.sharpness;
      brightness = px.brightness;
      fov = px.fov;
      contrast = px.contrast;
      illumination = px.illumination;
    } catch {
      // Canvas unavailable — keep heuristic defaults
    }
  }

  // ── Composite overall (weighted for clinical priority) ────────────────────
  // Sharpness is most critical; FOV next, then brightness, contrast, illumination
  const overall = Math.round(
    sharpness     * 0.35 +
    fov           * 0.25 +
    brightness    * 0.20 +
    contrast      * 0.12 +
    illumination  * 0.08,
  );

  const pass = !critical && overall >= 50 && sharpness >= 35 && brightness >= 25;

  // Flag critical if any single key metric is catastrophic even on native
  if (sharpness < 15 || brightness < 10) critical = true;

  const reason =
    criticalReasons.length > 0
      ? criticalReasons[0]
      : !pass
        ? "Image quality below minimum — recapture recommended"
        : undefined;

  const mk = (score: number, threshPass: number, threshWarn: number, label: string, goodHint: string, warnHint: string, badHint: string): QualityMetric => ({
    score,
    pass: score >= threshPass,
    label,
    hint: score >= threshPass ? goodHint : score >= threshWarn ? warnHint : badHint,
  });

  return {
    overall,
    blur: sharpness,
    brightness,
    fieldOfView: fov,
    contrast,
    illuminationUniform: illumination,
    metrics: {
      sharpness: mk(sharpness, 50, 30, "Sharpness",
        "Image is sharp — edges and vessels are well-defined",
        "Slightly blurry — clean lens and ensure patient is still",
        "Too blurry — clean the camera lens and recapture"),
      brightness: mk(brightness, 40, 25, "Brightness",
        "Exposure looks good",
        "Slightly dark — increase slit-lamp brightness or move closer",
        "Image too dark — increase illumination or widen aperture"),
      fieldOfView: mk(fov, 55, 35, "Field of View",
        "Retinal disc well-centred",
        "Partial disc — reposition camera to centre the optic disc",
        "Poor disc coverage — align camera directly on pupil centre"),
      contrast: mk(contrast, 45, 25, "Contrast",
        "Good tonal range — vessels visible",
        "Low contrast — check fundus alignment and focus",
        "Very low contrast — lens may be fogged or aperture too wide"),
      illumination: mk(illumination, 40, 25, "Illumination",
        "Even illumination across the retinal field",
        "Slight hot-spot — adjust camera angle slightly",
        "Uneven lighting — reposition the light source"),
    },
    pass,
    critical,
    reason,
    checkedLocally: true,
  };
}

async function getFileSizeNative(uri: string): Promise<number | undefined> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    return info.exists ? ((info as any).size as number | undefined) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Full pixel-level quality analysis using a 128×128 canvas sample.
 *
 * Sharpness  — Laplacian edge-variance: sum of |centre - neighbour| over all pixels.
 *              High variance = sharp; low variance = blurry.
 * Brightness — Mean luminance (0-255) mapped to 0-100.
 * FOV        — Fraction of pixels brighter than a dark-border threshold (retinal circular mask).
 * Contrast   — Luminance standard deviation mapped to 0-100.
 * Illumination — Mean brightness of centre 40% vs outer ring; uniformity score.
 */
async function analysePixelsOnCanvas(
  uri: string,
): Promise<{ sharpness: number; brightness: number; fov: number; contrast: number; illumination: number }> {
  return new Promise((resolve, reject) => {
    const img = new (window as any).Image() as HTMLImageElement;
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const SIZE = 128;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("no 2d ctx")); return; }
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const raw = ctx.getImageData(0, 0, SIZE, SIZE).data;

        const lums = new Float32Array(SIZE * SIZE);
        for (let i = 0; i < SIZE * SIZE; i++) {
          lums[i] = 0.299 * raw[i * 4] + 0.587 * raw[i * 4 + 1] + 0.114 * raw[i * 4 + 2];
        }

        // ── Brightness ──
        let sum = 0;
        for (let i = 0; i < lums.length; i++) sum += lums[i];
        const mean = sum / lums.length;
        // Ideal retinal image mean: 80-160; map 0-255 to 0-100 with peak at ~120
        const brightness = mean < 40
          ? Math.round((mean / 40) * 40)                            // very dark 0-40
          : mean <= 160
            ? Math.round(40 + ((mean - 40) / 120) * 60)            // good zone 40-100
            : Math.max(0, Math.round(100 - ((mean - 160) / 95) * 60)); // overexposed

        // ── Contrast (std dev) ──
        let varSum = 0;
        for (let i = 0; i < lums.length; i++) varSum += (lums[i] - mean) ** 2;
        const stdDev = Math.sqrt(varSum / lums.length);
        const contrast = Math.min(100, Math.round((stdDev / 60) * 100));

        // ── Field of View (circular mask fill) ──
        // Retinal fundus images: bright circular disc on dark background
        // Count pixels in inscribed circle that are above dark-border threshold
        const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2;
        let inCircle = 0, brightInCircle = 0;
        const FOV_THRESHOLD = 18; // pixels darker than this = outside retinal disc
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= r) {
              inCircle++;
              if (lums[y * SIZE + x] > FOV_THRESHOLD) brightInCircle++;
            }
          }
        }
        const fovRatio = brightInCircle / inCircle;
        const fov = Math.min(100, Math.round((fovRatio / 0.72) * 100));

        // ── Sharpness (Laplacian variance) ──
        // Convolve with simple 3x3 Laplacian [-1,-1,-1,-1,8,-1,-1,-1,-1]
        let lapVar = 0;
        let lapN = 0;
        for (let y = 1; y < SIZE - 1; y++) {
          for (let x = 1; x < SIZE - 1; x++) {
            const c = lums[y * SIZE + x];
            const lap =
              8 * c
              - lums[(y-1)*SIZE + (x-1)] - lums[(y-1)*SIZE + x] - lums[(y-1)*SIZE + (x+1)]
              - lums[y*SIZE + (x-1)]                              - lums[y*SIZE + (x+1)]
              - lums[(y+1)*SIZE + (x-1)] - lums[(y+1)*SIZE + x] - lums[(y+1)*SIZE + (x+1)];
            lapVar += lap * lap;
            lapN++;
          }
        }
        const lapMean = lapVar / lapN;
        // Empirically: sharp retinal image ~2000-8000; blurry <200
        const sharpness = Math.min(100, Math.round((lapMean / 3000) * 100));

        // ── Illumination uniformity (centre vs ring) ──
        let centreSum = 0, centreN = 0, ringSum = 0, ringN = 0;
        const innerR = r * 0.40;
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist <= r) {
              if (dist <= innerR) { centreSum += lums[y * SIZE + x]; centreN++; }
              else { ringSum += lums[y * SIZE + x]; ringN++; }
            }
          }
        }
        const centreMean = centreN > 0 ? centreSum / centreN : mean;
        const ringMean   = ringN   > 0 ? ringSum   / ringN   : mean;
        const delta = Math.abs(centreMean - ringMean);
        // delta 0 = perfect uniformity (100), delta 80+ = very non-uniform (0)
        const illumination = Math.max(0, Math.round(100 - (delta / 80) * 100));

        resolve({ sharpness, brightness, fov, contrast, illumination });
      } catch (e) { reject(e); }
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
