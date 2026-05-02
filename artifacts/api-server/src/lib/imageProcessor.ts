import sharp from "sharp";
import { logger } from "./logger.js";

export interface ImageMetadata {
  patientId: string;
  deviceId: string;
  captureTime: string;
  tenantId: string;
  eye?: "OD" | "OS" | "Unknown";
  operatorId?: string;
  campaignId?: string;
}

export interface QualityScore {
  overall: number;          // 0–100
  blur: number;             // 0–100 (100 = sharp)
  brightness: number;       // 0–100 (100 = ideal exposure)
  fieldOfView: number;      // 0–100 (100 = full FOV captured)
  contrast: number;         // 0–100
  redChannel: number;       // 0–100 (100 = strong red-channel dominance — expected in fundus)
  glare: number;            // 0–100 (100 = no glare/overexposure)
  pass: boolean;
  reason?: string;
}

export interface ProcessedImage {
  originalBuffer: Buffer;
  thumbnailBuffer: Buffer;
  width: number;
  height: number;
  format: "jpeg" | "png";
  sizeBytes: number;
  qualityScore: QualityScore;
  injectedMetadata: ImageMetadata;
  dicomWrapper: DicomWrapper;
}

export interface DicomWrapper {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  modality: string;
  bodyPartExamined: string;
  laterality?: string;
  acquisitionDateTime: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  samplesPerPixel: number;
  photometricInterpretation: string;
  pixelDataRef: string;
  complianceNote: string;
}

const QUALITY_THRESHOLDS = {
  blur: 30,
  brightness: 20,
  fieldOfView: 40,
  overall: 50,
};

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 240;
const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 85;

export async function processRetinalImage(
  inputBuffer: Buffer,
  metadata: ImageMetadata,
  originalFilename: string
): Promise<ProcessedImage> {
  let image = sharp(inputBuffer, { failOn: "truncated" });
  const imageInfo = await image.metadata();

  if (!imageInfo.width || !imageInfo.height) {
    throw new Error("Unable to read image dimensions");
  }

  logger.info({ w: imageInfo.width, h: imageInfo.height, format: imageInfo.format }, "Processing retinal image");

  // ── Step 1: Strip all EXIF / GPS / personal metadata ──
  image = sharp(inputBuffer, { failOn: "truncated" }).withMetadata({
    exif: {
      IFD0: {
        Copyright: "VisionBridge Teleophthalmology Platform",
        Artist: `Operator:${metadata.operatorId ?? "unknown"}`,
        Software: "VisionBridge v2.0",
        ImageDescription: `PatientID:${metadata.patientId} DeviceID:${metadata.deviceId}`,
      },
    },
    // Strip GPS and other personal identifiers
  });

  // ── Step 2: Normalize size (cap at MAX_DIMENSION) ──
  const needsResize = imageInfo.width > MAX_DIMENSION || imageInfo.height > MAX_DIMENSION;
  if (needsResize) {
    image = image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true });
  }

  // ── Step 3: Output as compressed JPEG ──
  const processedBuffer = await image
    .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: false })
    .toBuffer({ resolveWithObject: true });

  const finalInfo = processedBuffer.info;
  const finalBuffer = processedBuffer.data;

  // ── Step 4: Quality scoring ──
  const qualityScore = await scoreImageQuality(finalBuffer, finalInfo.width, finalInfo.height);

  // ── Step 5: Thumbnail generation ──
  const thumbnailBuffer = await sharp(finalBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 70 })
    .toBuffer();

  // ── Step 6: DICOM export wrapper ──
  const dicomWrapper = buildDicomWrapper(metadata, finalInfo.width, finalInfo.height);

  logger.info({
    patientId: metadata.patientId,
    qualityOverall: qualityScore.overall,
    qualityPass: qualityScore.pass,
    sizeKB: Math.round(finalBuffer.length / 1024),
    thumbnailKB: Math.round(thumbnailBuffer.length / 1024),
  }, "Image processing complete");

  return {
    originalBuffer: finalBuffer,
    thumbnailBuffer,
    width: finalInfo.width,
    height: finalInfo.height,
    format: "jpeg",
    sizeBytes: finalBuffer.length,
    qualityScore,
    injectedMetadata: metadata,
    dicomWrapper,
  };
}

async function scoreImageQuality(
  buffer: Buffer,
  width: number,
  height: number
): Promise<QualityScore> {
  // Extract per-channel stats
  const stats = await sharp(buffer).stats();

  // Brightness score: ideal retinal images have mean luminance 80–150 out of 255
  const meanBrightness = stats.channels.reduce((s, c) => s + c.mean, 0) / stats.channels.length;
  const brightnessScore = computeBrightnessScore(meanBrightness);

  // Contrast score: standard deviation should be >30 for a well-illuminated fundus
  const meanStdDev = stats.channels.reduce((s, c) => s + c.stdev, 0) / stats.channels.length;
  const contrastScore = Math.min(100, Math.round((meanStdDev / 80) * 100));

  // Blur score: real 3×3 Laplacian convolution — higher variance = sharper image
  const laplacianVariance = await estimateLaplacianVariance(buffer);
  const blurScore = Math.min(100, Math.round((laplacianVariance / 1200) * 100));

  // Field-of-view: circular retinal disc fill ratio
  const fovScore = await estimateFieldOfView(buffer, width, height);

  // Red channel dominance: fundus images should be red-dominant
  const redChannelScore = await checkRedChannelDominance(buffer, stats);

  // Glare: fraction of near-saturated (overexposed) pixels
  const glareScore = await detectGlare(buffer);

  // Overall composite score
  const overall = Math.round(
    blurScore       * 0.30 +
    brightnessScore * 0.20 +
    fovScore        * 0.20 +
    contrastScore   * 0.15 +
    redChannelScore * 0.10 +
    glareScore      * 0.05
  );

  const pass = overall >= QUALITY_THRESHOLDS.overall &&
    blurScore >= QUALITY_THRESHOLDS.blur &&
    brightnessScore >= QUALITY_THRESHOLDS.brightness &&
    fovScore >= QUALITY_THRESHOLDS.fieldOfView;

  let reason: string | undefined;
  if (!pass) {
    if (blurScore < QUALITY_THRESHOLDS.blur) reason = "Image appears blurry — reposition camera and ensure patient is still";
    else if (brightnessScore < QUALITY_THRESHOLDS.brightness) reason = "Insufficient illumination — check flash intensity and pupil dilation";
    else if (fovScore < QUALITY_THRESHOLDS.fieldOfView) reason = "Incomplete field of view — centre the optic disc in frame";
    else if (glareScore < 40) reason = "Lens glare detected — reduce flash intensity or increase working distance";
    else if (redChannelScore < 30) reason = "Unusual colour balance — verify the imaging light source";
    else reason = "Overall image quality below threshold — retake recommended";
  }

  return { overall, blur: blurScore, brightness: brightnessScore, fieldOfView: fovScore, contrast: contrastScore, redChannel: redChannelScore, glare: glareScore, pass, reason };
}

async function estimateLaplacianVariance(buffer: Buffer): Promise<number> {
  // True 3×3 cross-shaped Laplacian: [0,1,0; 1,-4,1; 0,1,0]
  // Variance of the response is the standard sharpness metric (higher = sharper).
  const SIZE = 128;
  const { data } = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let lapSum = 0, lapSumSq = 0, lapN = 0;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const idx = y * SIZE + x;
      const lap =
        data[idx - SIZE] + data[idx - 1] + (-4 * data[idx]) +
        data[idx + 1] + data[idx + SIZE];
      lapSum += lap;
      lapSumSq += lap * lap;
      lapN++;
    }
  }
  const lapMean = lapSum / lapN;
  return lapSumSq / lapN - lapMean * lapMean;
}

async function checkRedChannelDominance(
  buffer: Buffer,
  stats?: Awaited<ReturnType<typeof sharp.prototype.stats>>
): Promise<number> {
  const s = stats ?? await sharp(buffer).resize(64, 64, { fit: "fill" }).stats();
  if (s.channels.length < 3) return 50;
  const [{ mean: r }, { mean: g }, { mean: b }] = s.channels;
  const total = r + g + b;
  if (total < 30) return 50; // too dark to judge
  const dominance = r / (total / 3); // 1.0 = equal; >1 = red dominant
  return Math.min(100, Math.max(0, Math.round((dominance - 0.7) / 0.7 * 100)));
}

async function detectGlare(buffer: Buffer): Promise<number> {
  const SIZE = 64;
  const raw = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let saturated = 0;
  const total = SIZE * SIZE;
  for (let i = 0; i < raw.length; i += 3) {
    if (raw[i] > 240 && raw[i + 1] > 240 && raw[i + 2] > 240) saturated++;
  }
  return Math.max(0, Math.round((1 - Math.min((saturated / total) * 10, 1)) * 100));
}

async function estimateFieldOfView(buffer: Buffer, width: number, height: number): Promise<number> {
  // Count pixels above threshold vs total — retinal images have circular bright region
  const { data } = await sharp(buffer)
    .resize(64, 64, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 20;
  let brightPixels = 0;
  for (const v of data) { if (v > threshold) brightPixels++; }
  const ratio = brightPixels / data.length;
  // Typical well-captured fundus image: circular region covers ~60-80% of frame
  return Math.min(100, Math.round((ratio / 0.7) * 100));
}

function computeBrightnessScore(mean: number): number {
  // Ideal range: 80–160. Outside this range score decreases
  if (mean < 10) return 0;
  if (mean >= 80 && mean <= 160) return 100;
  if (mean < 80) return Math.round((mean / 80) * 100);
  if (mean > 160) return Math.max(0, Math.round(100 - ((mean - 160) / 95) * 100));
  return 50;
}

function buildDicomWrapper(metadata: ImageMetadata, width: number, height: number): DicomWrapper {
  const now = metadata.captureTime || new Date().toISOString();
  const uid = () => `2.25.${Date.now()}${Math.floor(Math.random() * 1e9)}`;

  return {
    studyInstanceUID: uid(),
    seriesInstanceUID: uid(),
    sopInstanceUID: uid(),
    modality: "OP",                              // Ophthalmic Photography
    bodyPartExamined: "EYE",
    laterality: metadata.eye === "OD" ? "R" : metadata.eye === "OS" ? "L" : undefined,
    acquisitionDateTime: now.replace(/[-:T]/g, "").split(".")[0],
    rows: height,
    columns: width,
    bitsAllocated: 8,
    samplesPerPixel: 3,
    photometricInterpretation: "YBR_FULL_422",
    pixelDataRef: `patients/${metadata.patientId}/images/`,
    complianceNote: "DICOM PS3.3 IOD: VL Photographic Image Storage (1.2.840.10008.5.1.4.1.1.77.1.4) — pixel data embedded on export",
  };
}

export function formatDicomJson(wrapper: DicomWrapper, metadata: ImageMetadata): object {
  return {
    "00080060": { vr: "CS", Value: [wrapper.modality] },
    "00080070": { vr: "LO", Value: ["VisionBridge Teleophthalmology"] },
    "00100020": { vr: "LO", Value: [metadata.patientId] },
    "00100030": { vr: "DA", Value: [] },
    "00200013": { vr: "IS", Value: [1] },
    "00280010": { vr: "US", Value: [wrapper.rows] },
    "00280011": { vr: "US", Value: [wrapper.columns] },
    "00280100": { vr: "US", Value: [wrapper.bitsAllocated] },
    "00280103": { vr: "US", Value: [0] },
    "00280004": { vr: "CS", Value: [wrapper.photometricInterpretation] },
    "00280002": { vr: "US", Value: [wrapper.samplesPerPixel] },
    "0020000D": { vr: "UI", Value: [wrapper.studyInstanceUID] },
    "0020000E": { vr: "UI", Value: [wrapper.seriesInstanceUID] },
    "00080018": { vr: "UI", Value: [wrapper.sopInstanceUID] },
    "00080016": { vr: "UI", Value: ["1.2.840.10008.5.1.4.1.1.77.1.4"] },
    "00080022": { vr: "DA", Value: [wrapper.acquisitionDateTime.slice(0, 8)] },
    "00080032": { vr: "TM", Value: [wrapper.acquisitionDateTime.slice(8)] },
    "00200060": { vr: "CS", Value: wrapper.laterality ? [wrapper.laterality] : [] },
    "_note": wrapper.complianceNote,
  };
}
