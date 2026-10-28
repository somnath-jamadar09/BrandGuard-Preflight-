/**
 * minio.js — MinIO client singleton + bucket-bootstrap helper.
 *
 * Import `minioClient` anywhere you need S3-compatible object storage,
 * and call `ensureBucket()` once at startup.
 * Includes local filesystem fallback when MinIO server is unreachable in development.
 */

const fs = require('fs');
const path = require('path');
const Minio = require('minio');
const { minio } = require('../config');

const MINIO_ENDPOINT = minio?.endpoint || process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = minio?.port || parseInt(process.env.MINIO_PORT_INTERNAL || '9000', 10);
const MINIO_USE_SSL = minio?.useSSL ?? (process.env.MINIO_USE_SSL === 'true');
const MINIO_ACCESS_KEY = minio?.accessKey || process.env.MINIO_ROOT_USER || 'minioadmin';
const MINIO_SECRET_KEY = minio?.secretKey || process.env.MINIO_ROOT_PASSWORD || 'minioadmin';
const MINIO_BUCKET = minio?.bucket || process.env.MINIO_BUCKET || 'brandguard';

const LOCAL_STORAGE_DIR = path.resolve(__dirname, '../../uploads');

function getLocalFilePath(bucket, objectName) {
  const parts = objectName.split('/').filter(Boolean);
  return path.join(LOCAL_STORAGE_DIR, bucket, ...parts);
}

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

/**
 * Ensures the default bucket exists, creating it when absent.
 * Safe to call multiple times — idempotent.
 *
 * @param {string} [bucket] - Bucket name; defaults to MINIO_BUCKET env var.
 * @param {string} [region] - AWS-style region tag (cosmetic for MinIO).
 * @returns {Promise<void>}
 */
async function ensureBucket(bucket = MINIO_BUCKET, region = 'us-east-1') {
  try {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, region);
      console.log(`[MinIO] Bucket "${bucket}" created.`);
    } else {
      console.log(`[MinIO] Bucket "${bucket}" already exists.`);
    }
  } catch (err) {
    console.warn(`[MinIO] MinIO offline or unreachable (${err.message}). Using local storage fallback.`);
    const fallbackDir = path.join(LOCAL_STORAGE_DIR, bucket);
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
  }
}

/**
 * Uploads a Buffer or stream to MinIO (with local disk fallback).
 *
 * @param {string} objectName   - Key path inside the bucket (e.g. "uploads/uuid.pdf").
 * @param {Buffer|stream.Readable} data
 * @param {number} size         - Byte length (-1 for unknown streams).
 * @param {string} [contentType]
 * @param {string} [bucket]
 * @returns {Promise<Minio.UploadedObjectInfo|{etag: string, versionId: null}>}
 */
async function uploadObject(objectName, data, size = -1, contentType = 'application/octet-stream', bucket = MINIO_BUCKET) {
  try {
    const metadata = { 'Content-Type': contentType };
    return await minioClient.putObject(bucket, objectName, data, size, metadata);
  } catch (err) {
    console.warn(`[MinIO] MinIO putObject failed (${err.message}), falling back to local storage.`);
    const localPath = getLocalFilePath(bucket, objectName);
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(localPath, data);
    } else if (typeof data?.pipe === 'function') {
      const ws = fs.createWriteStream(localPath);
      await new Promise((resolve, reject) => {
        data.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
      });
    } else {
      fs.writeFileSync(localPath, String(data));
    }
    return { etag: 'local-fallback', versionId: null };
  }
}

/**
 * Returns a presigned GET URL valid for `expirySeconds` (default 1 hour).
 *
 * @param {string} objectName
 * @param {number} [expirySeconds]
 * @param {string} [bucket]
 * @returns {Promise<string>}
 */
async function getPresignedUrl(objectName, expirySeconds = 3600, bucket = MINIO_BUCKET) {
  try {
    return await minioClient.presignedGetObject(bucket, objectName, expirySeconds);
  } catch (_err) {
    // Return relative url pointing to served static uploads if local file exists
    const localPath = getLocalFilePath(bucket, objectName);
    if (fs.existsSync(localPath)) {
      return `/uploads/${bucket}/${objectName}`;
    }
    return null;
  }
}

/**
 * Deletes an object from MinIO. No-op if the object doesn't exist.
 *
 * @param {string} objectName
 * @param {string} [bucket]
 * @returns {Promise<void>}
 */
async function deleteObject(objectName, bucket = MINIO_BUCKET) {
  try {
    await minioClient.removeObject(bucket, objectName);
  } catch (_err) {
    const localPath = getLocalFilePath(bucket, objectName);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  }
}

module.exports = {
  minioClient,
  MINIO_BUCKET,
  LOCAL_STORAGE_DIR,
  ensureBucket,
  uploadObject,
  getPresignedUrl,
  deleteObject,
};
