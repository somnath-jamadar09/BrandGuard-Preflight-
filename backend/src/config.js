'use strict';

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('[auth] JWT_SECRET environment variable is not set. Aborting.');
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || process.env.API_PORT || '4000', 10),
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '*',
  UPLOAD_MAX_BYTES: parseInt(process.env.UPLOAD_MAX_BYTES || `${MAX_FILE_SIZE}`, 10),
  MAX_FILE_SIZE,
  DEFAULT_PRESIGN_EXPIRY_SECONDS: 3600,
  DRAFT_STORAGE_PREFIX: 'drafts/',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://mongo:27017/brandguard',
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ML_SERVICE_URL: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
  ML_INTERNAL_TOKEN: process.env.ML_INTERNAL_TOKEN || '',
  ML_TIMEOUT_MS: parseInt(process.env.ML_TIMEOUT_MS, 10) || 30_000,
  DEFAULT_ML_TIMEOUT_MS: 30_000,
  GATE_API_KEY: process.env.GATE_API_KEY,
  RULES_VERSION: process.env.RULES_VERSION || 'v1.2',
  SHELF_LIFE_CRON_SCHEDULE: process.env.SHELF_LIFE_CRON_SCHEDULE || '0 0 * * *',
  TZ: process.env.TZ || 'UTC',
  DEMO_MODE: process.env.DEMO_MODE === 'true',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || 'minio',
  MINIO_PORT: parseInt(process.env.MINIO_PORT_INTERNAL || '9000', 10),
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',
  MINIO_ACCESS_KEY: process.env.MINIO_ROOT_USER || 'minioadmin',
  MINIO_SECRET_KEY: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
  MINIO_BUCKET: process.env.MINIO_BUCKET || 'brandguard',
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT_INTERNAL || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'brandguard',
  },
};

module.exports = config;
