'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const Source = require('../models/Source');
const { authenticate } = require('../middleware/auth');
const { orgIsolation } = require('../middleware/orgIsolation');
const { uploadScan } = require('../middleware/uploadScan');
const { uploadObject, getPresignedUrl } = require('../utils/minio');
const mlOrchestrator = require('../services/mlOrchestrator');
const { requireRole, CAN_MANAGE_SOURCE, CAN_EDIT_SOURCE } = require('../middleware/rbac');
const { sendError, getOrgId, isValidObjectId } = require('../utils/response');
const { DEFAULT_PRESIGN_EXPIRY_SECONDS } = require('../config');

const router = express.Router();

router.use(authenticate, orgIsolation);

router.post('/', requireRole(CAN_MANAGE_SOURCE), uploadScan, async (req, res, next) => {
  try {
    const orgId = getOrgId(req);

    if (!orgId) {
      return sendError(res, 400, 'MISSING_ORG', 'Organisation context is required to upload a source.');
    }

    const {
      type = 'guideline',
      owner,
      ownerName,
      version = '1.0',
      effectiveDate,
      expiryDate,
      status = 'ready',
    } = req.body;

    if (!Source.SOURCE_TYPES.includes(type)) {
      return sendError(
        res,
        400,
        'INVALID_SOURCE_TYPE',
        `Invalid source type "${type}". Allowed: ${Source.SOURCE_TYPES.join(', ')}`
      );
    }

    if (!['active', 'ready'].includes(status)) {
      return sendError(res, 400, 'INVALID_INITIAL_STATUS', 'New source uploads must use status active or ready.');
    }
    const requestedStatus = status;

    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const safeBaseName = path
      .basename(req.file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageRef = `sources/${orgId.toString()}/${Date.now()}-${randomSuffix}-${safeBaseName}`;

    try {
      await uploadObject(
        storageRef,
        req.file.buffer,
        req.file.size,
        req.file.mimetype || 'application/octet-stream'
      );
    } catch (storageErr) {
      console.error('[sources] MinIO upload error:', storageErr);
      return sendError(
        res,
        502,
        'STORAGE_UPLOAD_FAILED',
        `Failed to store file in object storage: ${storageErr.message}`
      );
    }

    let resolvedOwner = null;
    if (owner && isValidObjectId(owner)) {
      resolvedOwner = new mongoose.Types.ObjectId(owner);
    } else if (req.user?._id && isValidObjectId(req.user._id)) {
      resolvedOwner = req.user._id;
    }

    const resolvedOwnerName =
      (typeof ownerName === 'string' && ownerName.trim()) ||
      req.user?.name ||
      '';

    let parsedEffectiveDate = effectiveDate ? new Date(effectiveDate) : new Date();
    if (isNaN(parsedEffectiveDate.getTime())) {
      parsedEffectiveDate = new Date();
    }

    let parsedExpiryDate = null;
    if (expiryDate) {
      const d = new Date(expiryDate);
      if (!isNaN(d.getTime())) {
        parsedExpiryDate = d;
      }
    }

    const source = new Source({
      orgId,
      fileName: req.file.originalname,
      storageRef,
      fileSize: req.file.size,
      mimeType: req.file.mimetype || 'application/octet-stream',
      type,
      owner: resolvedOwner,
      ownerName: resolvedOwnerName,
      version: String(version).trim() || '1.0',
      effectiveDate: parsedEffectiveDate,
      expiryDate: parsedExpiryDate,
      status: 'processing',
    });

    await source.save();

    try {
      await mlOrchestrator.indexSource({
        sourceId: source._id,
        orgId,
        fileName: source.fileName,
        mimeType: source.mimeType,
        version: source.version,
        expiryDate: source.expiryDate,
        ownerName: source.ownerName,
        status: requestedStatus,
        content: req.file.buffer,
      });
      source.status = requestedStatus === 'active' ? 'active' : 'ready';
      await source.save();
    } catch (indexErr) {
      console.error('[sources] ML indexing error:', indexErr);
      source.status = 'error';
      await source.save();
      return sendError(res, 502, 'INDEXING_FAILED', `Failed to index source: ${indexErr.message}`, {
        sourceId: source._id,
      });
    }

    let downloadUrl = null;
    try {
      downloadUrl = await getPresignedUrl(storageRef, DEFAULT_PRESIGN_EXPIRY_SECONDS);
    } catch (_ignore) {
      // Non-fatal if presigning fails at upload time
    }

    const responseData = source.toObject();
    if (downloadUrl) {
      responseData.downloadUrl = downloadUrl;
    }

    return res.status(201).json(responseData);
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const filter = { orgId };

    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }

    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    if (req.query.owner) {
      filter.ownerName = req.query.owner;
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [sources, total] = await Promise.all([
      Source.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Source.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: sources,
      total,
      page,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid source ID format: "${id}".`);
    }

    const orgId = getOrgId(req);
    const source = await Source.findOne({ _id: id, orgId }).lean();

    if (!source) {
      return sendError(res, 404, 'NOT_FOUND', 'Source not found.');
    }

    let downloadUrl = null;
    try {
      downloadUrl = await getPresignedUrl(source.storageRef, DEFAULT_PRESIGN_EXPIRY_SECONDS);
    } catch (_ignore) {
      // Non-fatal
    }

    if (downloadUrl) {
      source.downloadUrl = downloadUrl;
    }

    return res.status(200).json(source);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', requireRole(CAN_EDIT_SOURCE), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid source ID format: "${id}".`);
    }

    const source = await Source.findOne({ _id: id, orgId });
    if (!source) {
      return sendError(res, 404, 'NOT_FOUND', 'Source not found.');
    }

    const { owner, expiryDate, status } = req.body || {};

    if (owner !== undefined) {
      if (owner && !isValidObjectId(owner)) {
        return sendError(res, 400, 'INVALID_OWNER', 'Invalid owner ObjectId format.');
      }
      source.owner = owner || null;
    }

    if (expiryDate !== undefined) {
      const parsedDate = new Date(expiryDate);
      if (isNaN(parsedDate.getTime())) {
        return sendError(res, 400, 'INVALID_DATE', 'Invalid expiryDate format.');
      }
      source.expiryDate = parsedDate;
    }

    if (status !== undefined) {
      if (!Source.SOURCE_STATUSES.includes(status)) {
        return sendError(
          res,
          400,
          'INVALID_STATUS',
          `Invalid status "${status}". Allowed: ${Source.SOURCE_STATUSES.join(', ')}`
        );
      }
      source.status = status;
    }

    try {
      await mlOrchestrator.updateSourceMetadata({
        sourceId: source._id,
        orgId,
        status: 'processing',
      });
    } catch (syncErr) {
      console.error('[sources] ML lifecycle quarantine error:', syncErr);
      return sendError(
        res,
        502,
        'SOURCE_METADATA_SYNC_FAILED',
        'Could not quarantine source passages before updating lifecycle metadata.'
      );
    }

    await source.save();

    try {
      await mlOrchestrator.updateSourceMetadata({
        sourceId: source._id,
        orgId,
        status: source.status,
        expiryDate: source.expiryDate,
        ownerName: source.ownerName,
        version: source.version,
      });
    } catch (syncErr) {
      console.error('[sources] ML metadata sync error; passages remain quarantined:', syncErr);
      return sendError(
        res,
        502,
        'SOURCE_METADATA_SYNC_FAILED',
        'Source was saved, but the ML index remains quarantined until metadata synchronization succeeds.'
      );
    }

    return res.status(200).json(source.toObject());
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
