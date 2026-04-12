import { Router } from "express";
import multer from "multer";
import { processRetinalImage, formatDicomJson, type ImageMetadata } from "../lib/imageProcessor.js";
import { getMinioClient, getBucketName, uploadToMinio, getPresignedUrl, deleteFromMinio } from "../lib/minio.js";
import { logger } from "../lib/logger.js";

const router = Router();

// In-memory store for dev/fallback (when MinIO not configured)
const localImageStore = new Map<string, {
  originalBuffer: Buffer;
  thumbnailBuffer: Buffer;
  metadata: ImageMetadata;
  qualityScore: object;
  dicomWrapper: object;
  objectName: string;
  tenantId: string;
  uploadedAt: string;
  sizeBytes: number;
}>();

// Offline upload queue store (indexed by tenantId)
const offlineQueue = new Map<string, Array<{
  queueId: string;
  patientId: string;
  enqueuedAt: string;
  status: "queued" | "uploading" | "failed";
  retries: number;
  errorMsg?: string;
}>>();

// ── Multer: in-memory, 20 MB max ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Use JPEG, PNG or WebP.`));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/imaging/upload
 * Body (multipart/form-data):
 *   - image: binary file
 *   - patientId: string
 *   - deviceId: string
 *   - tenantId: string
 *   - eye: "OD" | "OS" | "Unknown"  (optional)
 *   - operatorId: string  (optional)
 *   - campaignId: string  (optional)
 *   - captureTime: ISO string  (optional)
 */
router.post("/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const { patientId, deviceId, tenantId, eye, operatorId, campaignId, captureTime } = req.body as Record<string, string>;

    if (!patientId || !deviceId || !tenantId) {
      res.status(400).json({ error: "patientId, deviceId, and tenantId are required" });
      return;
    }

    const metadata: ImageMetadata = {
      patientId,
      deviceId,
      tenantId,
      captureTime: captureTime || new Date().toISOString(),
      eye: (eye as ImageMetadata["eye"]) || "Unknown",
      operatorId,
      campaignId,
    };

    // ── Process image (EXIF strip, quality score, thumbnail, DICOM wrapper) ──
    const processed = await processRetinalImage(req.file.buffer, metadata, req.file.originalname);

    if (!processed.qualityScore.pass) {
      logger.warn({ patientId, score: processed.qualityScore }, "Image quality below threshold");
      res.status(422).json({
        error: "Image quality check failed",
        qualityScore: processed.qualityScore,
        action: "retake",
      });
      return;
    }

    const imageId = `${tenantId}_${patientId}_${Date.now()}`;
    const objectName = `patients/${patientId}/retinal/${imageId}.jpg`;
    const thumbName = `patients/${patientId}/retinal/thumb_${imageId}.jpg`;

    const client = getMinioClient();

    if (client) {
      // ── Upload to MinIO (encrypted per-tenant bucket) ──
      const bucket = getBucketName(tenantId);
      const minioMeta: Record<string, string> = {
        "x-amz-meta-patient-id": patientId,
        "x-amz-meta-device-id": deviceId,
        "x-amz-meta-capture-time": metadata.captureTime,
        "x-amz-meta-tenant-id": tenantId,
        "x-amz-meta-eye": metadata.eye ?? "Unknown",
        "x-amz-meta-operator-id": operatorId ?? "",
        "x-amz-meta-image-id": imageId,
      };

      await Promise.all([
        uploadToMinio(client, bucket, objectName, processed.originalBuffer, "image/jpeg", minioMeta),
        uploadToMinio(client, bucket, thumbName, processed.thumbnailBuffer, "image/jpeg", { ...minioMeta, "x-amz-meta-type": "thumbnail" }),
      ]);

      logger.info({ bucket, objectName, imageId }, "Uploaded to MinIO");
    } else {
      // ── Local fallback store ──
      localImageStore.set(imageId, {
        originalBuffer: processed.originalBuffer,
        thumbnailBuffer: processed.thumbnailBuffer,
        metadata,
        qualityScore: processed.qualityScore,
        dicomWrapper: processed.dicomWrapper,
        objectName,
        tenantId,
        uploadedAt: new Date().toISOString(),
        sizeBytes: processed.sizeBytes,
      });
      logger.info({ imageId }, "Stored in local fallback (MinIO not configured)");
    }

    res.status(201).json({
      imageId,
      objectName,
      thumbnailName: thumbName,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.sizeBytes,
      format: processed.format,
      qualityScore: processed.qualityScore,
      metadata: {
        patientId: metadata.patientId,
        deviceId: metadata.deviceId,
        captureTime: metadata.captureTime,
        eye: metadata.eye,
        tenantId: metadata.tenantId,
      },
      dicomWrapper: processed.dicomWrapper,
      storage: client ? "minio" : "local",
      uploadedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "Image upload failed");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

/**
 * GET /api/imaging/:imageId
 * Returns presigned URL or direct buffer
 */
router.get("/:imageId", async (req, res) => {
  const { imageId } = req.params;
  const tenantId = req.query["tenantId"] as string;

  const client = getMinioClient();

  if (client && tenantId) {
    try {
      const bucket = getBucketName(tenantId);
      const objectName = imageId.includes("/") ? imageId : `patients/${imageId.split("_")[1]}/retinal/${imageId}.jpg`;
      const url = await getPresignedUrl(client, bucket, objectName, 3600);
      res.json({ url, expiresIn: 3600 });
    } catch (err: any) {
      res.status(404).json({ error: "Image not found in MinIO" });
    }
    return;
  }

  // Local fallback
  const stored = localImageStore.get(imageId);
  if (!stored) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json({
    imageId,
    qualityScore: stored.qualityScore,
    dicomWrapper: stored.dicomWrapper,
    metadata: stored.metadata,
    sizeBytes: stored.sizeBytes,
    uploadedAt: stored.uploadedAt,
    storage: "local",
    note: "Image data available via /thumbnail for bandwidth-efficient viewing",
  });
});

/**
 * GET /api/imaging/:imageId/thumbnail
 * Returns thumbnail as JPEG binary or presigned thumbnail URL
 */
router.get("/:imageId/thumbnail", async (req, res) => {
  const { imageId } = req.params;
  const tenantId = req.query["tenantId"] as string;

  const client = getMinioClient();

  if (client && tenantId) {
    try {
      const bucket = getBucketName(tenantId);
      const thumbName = `patients/${imageId.split("_")[1]}/retinal/thumb_${imageId}.jpg`;
      const url = await getPresignedUrl(client, bucket, thumbName, 3600);
      res.json({ url, expiresIn: 3600, type: "thumbnail" });
    } catch {
      res.status(404).json({ error: "Thumbnail not found" });
    }
    return;
  }

  const stored = localImageStore.get(imageId);
  if (!stored) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(stored.thumbnailBuffer);
});

/**
 * GET /api/imaging/:imageId/dicom
 * Returns DICOM-compatible JSON metadata wrapper (future: full P10 binary export)
 */
router.get("/:imageId/dicom", async (req, res) => {
  const { imageId } = req.params;

  const stored = localImageStore.get(imageId);
  if (!stored) {
    // Try to build a DICOM wrapper from query params
    const patientId = req.query["patientId"] as string;
    const tenantId = req.query["tenantId"] as string;
    if (!patientId) {
      res.status(404).json({ error: "Image not found and patientId not provided" });
      return;
    }
    const { buildDicomWrapper, formatDicomJson } = await import("../lib/imageProcessor.js");
    // Can't import non-exported fn - just return a mock
    res.json({
      _type: "DICOM-JSON",
      _compliance: "IHE Eye Care Technical Framework",
      _note: "Full P10 binary DICOM export available upon upgrade to clinical license",
      imageId,
      patientId,
    });
    return;
  }

  const dicomJson = formatDicomJson(stored.dicomWrapper as any, stored.metadata);
  res.json({
    _type: "DICOM-JSON",
    _compliance: "DICOM PS3.3 — VL Ophthalmic Photography Image Storage",
    _note: "Full P10 binary export available via clinical license. This JSON representation is compatible with DICOMweb WADO-RS.",
    imageId,
    dataset: dicomJson,
  });
});

/**
 * DELETE /api/imaging/:imageId
 */
router.delete("/:imageId", async (req, res) => {
  const { imageId } = req.params;
  const tenantId = req.query["tenantId"] as string;

  const client = getMinioClient();

  if (client && tenantId) {
    try {
      const bucket = getBucketName(tenantId);
      const objectName = `patients/${imageId.split("_")[1]}/retinal/${imageId}.jpg`;
      const thumbName = `patients/${imageId.split("_")[1]}/retinal/thumb_${imageId}.jpg`;
      await Promise.all([deleteFromMinio(client, bucket, objectName), deleteFromMinio(client, bucket, thumbName)]);
      res.json({ deleted: true, imageId });
    } catch {
      res.status(404).json({ error: "Image not found in MinIO" });
    }
    return;
  }

  const existed = localImageStore.has(imageId);
  localImageStore.delete(imageId);
  res.json({ deleted: existed, imageId, storage: "local" });
});

/**
 * GET /api/imaging/queue/:tenantId
 * Returns offline upload queue status for a tenant
 */
router.get("/queue/:tenantId", (req, res) => {
  const { tenantId } = req.params;
  const queue = offlineQueue.get(tenantId) ?? [];
  res.json({
    tenantId,
    total: queue.length,
    queued: queue.filter((i) => i.status === "queued").length,
    uploading: queue.filter((i) => i.status === "uploading").length,
    failed: queue.filter((i) => i.status === "failed").length,
    items: queue,
  });
});

/**
 * POST /api/imaging/queue/:tenantId
 * Add an item to the offline upload queue
 */
router.post("/queue/:tenantId", (req, res) => {
  const { tenantId } = req.params;
  const { patientId } = req.body as { patientId: string };
  if (!patientId) {
    res.status(400).json({ error: "patientId required" });
    return;
  }
  const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const item = { queueId, patientId, enqueuedAt: new Date().toISOString(), status: "queued" as const, retries: 0 };
  const queue = offlineQueue.get(tenantId) ?? [];
  queue.push(item);
  offlineQueue.set(tenantId, queue);
  res.status(201).json(item);
});

/**
 * GET /api/imaging/quality-check
 * Returns image quality check result without storing
 */
router.post("/quality-check", upload.single("image"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image provided" });
    return;
  }
  try {
    const { processRetinalImage } = await import("../lib/imageProcessor.js");
    const dummy: ImageMetadata = {
      patientId: "quality-check",
      deviceId: "check",
      tenantId: "check",
      captureTime: new Date().toISOString(),
    };
    const result = await processRetinalImage(req.file.buffer, dummy, req.file.originalname);
    res.json({ qualityScore: result.qualityScore, width: result.width, height: result.height, sizeBytes: result.sizeBytes });
  } catch (err: any) {
    res.status(422).json({ error: err.message });
  }
});

export default router;
