import { Client as MinioClient } from "minio";
import { logger } from "./logger.js";

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region: string;
}

function getMinioConfig(): MinioConfig | null {
  const endPoint = process.env["MINIO_ENDPOINT"];
  const accessKey = process.env["MINIO_ACCESS_KEY"];
  const secretKey = process.env["MINIO_SECRET_KEY"];

  if (!endPoint || !accessKey || !secretKey) {
    logger.warn("MinIO not configured — MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY missing. Storage will use local fallback.");
    return null;
  }

  return {
    endPoint,
    port: parseInt(process.env["MINIO_PORT"] ?? "9000", 10),
    useSSL: process.env["MINIO_USE_SSL"] === "true",
    accessKey,
    secretKey,
    region: process.env["MINIO_REGION"] ?? "af-south-1",
  };
}

let _client: MinioClient | null = null;

export function getMinioClient(): MinioClient | null {
  if (_client) return _client;
  const config = getMinioConfig();
  if (!config) return null;
  _client = new MinioClient(config);
  return _client;
}

export function getBucketName(tenantId: string): string {
  const prefix = process.env["MINIO_BUCKET_PREFIX"] ?? "visionbridge";
  const sanitized = tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 20);
  return `${prefix}-${sanitized}`;
}

export async function ensureBucketExists(client: MinioClient, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, process.env["MINIO_REGION"] ?? "af-south-1");
    // Apply server-side encryption policy
    await client.setBucketEncryption(bucket, {
      Rule: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
    });
    // Apply versioning for audit trail
    await client.setBucketVersioning(bucket, { Status: "Enabled" });
    logger.info({ bucket }, "Created encrypted MinIO bucket with versioning");
  }
}

export async function uploadToMinio(
  client: MinioClient,
  bucket: string,
  objectName: string,
  data: Buffer,
  contentType: string,
  metadata: Record<string, string>
): Promise<string> {
  await ensureBucketExists(client, bucket);
  await client.putObject(bucket, objectName, data, data.length, {
    "Content-Type": contentType,
    ...metadata,
  });
  return objectName;
}

export async function getPresignedUrl(
  client: MinioClient,
  bucket: string,
  objectName: string,
  expirySeconds = 3600
): Promise<string> {
  return client.presignedGetObject(bucket, objectName, expirySeconds);
}

export async function deleteFromMinio(
  client: MinioClient,
  bucket: string,
  objectName: string
): Promise<void> {
  await client.removeObject(bucket, objectName);
}
