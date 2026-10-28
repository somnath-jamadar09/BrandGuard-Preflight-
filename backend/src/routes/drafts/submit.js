'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');

const Draft = require('../../models/Draft');
const DraftVersion = require('../../models/DraftVersion');
const Passport = require('../../models/Passport');
const Finding = require('../../models/Finding');
const { requireRole, CAN_SUBMIT_DRAFT } = require('../../middleware/rbac');
const { performAvScan, MAX_FILE_SIZE } = require('../../middleware/uploadScan');
const { redactContent, loadOrgWatchlist } = require('../../middleware/redactionGateway');
const { sha256 } = require('../../utils/hash');
const { logEvent, AUDIT_EVENTS } = require('../../services/auditLogger');
const { uploadObject, getPresignedUrl } = require('../../utils/minio');
const { getVersions } = require('../../services/versionManager');
const { inferFormat, parseAndValidateIntent } = require('../../services/draftService');
const { sendError, getOrgId, isValidObjectId } = require('../../utils/response');
const { DEFAULT_PRESIGN_EXPIRY_SECONDS, DRAFT_STORAGE_PREFIX } = require('../../config');

const router = express.Router();

const ALLOWED_DRAFT_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_DRAFT_EXTENSIONS.includes(ext)) {
      const err = new Error(
        `File format "${ext || 'unknown'}" is not supported. Allowed formats: PDF (.pdf), Word (.docx), Markdown (.md), Text (.txt).`
      );
      err.code = 'INVALID_FILE_TYPE';
      return cb(err, false);
    }
    return cb(null, true);
  },
}).single('file');

const FILE_TOO_LARGE_MESSAGE = `File size exceeds ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB limit.`;

function handleDraftUpload(req, res, next) {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 400, 'FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
      }
      return sendError(res, 400, 'UPLOAD_ERROR', `Upload error: ${err.message}`);
    } else if (err) {
      return sendError(res, 400, err.code || 'INVALID_UPLOAD', err.message || 'File upload failed.');
    }
    return next();
  });
}

router.post('/', requireRole(CAN_SUBMIT_DRAFT), handleDraftUpload, async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) {
      return sendError(res, 400, 'MISSING_ORG', 'Organisation context is required to submit a draft.');
    }

    const intentValidation = parseAndValidateIntent(req.body);
    if (!intentValidation.valid) {
      return sendError(res, 400, 'INVALID_INTENT', intentValidation.error);
    }
    const validatedIntent = intentValidation.intent;

    let content = typeof req.body.content === 'string' ? req.body.content : '';
    let storageRef = null;
    let fileName = null;
    let fileSize = null;

    if (req.file) {
      fileName = req.file.originalname;
      fileSize = req.file.size;

      try {
        await performAvScan(req.file.buffer, fileName);
      } catch (avErr) {
        return sendError(res, 400, 'AV_SCAN_FAILED', avErr.message);
      }

      const ext = path.extname(fileName).toLowerCase();
      if (['.txt', '.md', '.markdown'].includes(ext)) {
        content = req.file.buffer.toString('utf-8');
      } else if (!content) {
        content = `Extracted text from binary document ${fileName} (${fileSize} bytes)`;
      }

      const randomSuffix = crypto.randomBytes(8).toString('hex');
      const safeBaseName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      storageRef = `${DRAFT_STORAGE_PREFIX}${orgId.toString()}/${Date.now()}-${randomSuffix}-${safeBaseName}`;

      try {
        await uploadObject(
          storageRef,
          req.file.buffer,
          fileSize,
          req.file.mimetype || 'application/octet-stream'
        );
      } catch (storageErr) {
        console.error('[drafts] MinIO upload error:', storageErr);
        return sendError(
          res,
          502,
          'STORAGE_UPLOAD_FAILED',
          `Failed to store file in object storage: ${storageErr.message}`
        );
      }
    }

    if (!content || !content.trim()) {
      return sendError(
        res,
        400,
        'MISSING_CONTENT',
        'Draft content is required. Provide raw content in the request body or attach a readable text/markdown file.'
      );
    }

    const contentHash = sha256(content);
    const watchlist = await loadOrgWatchlist(orgId, req.org);
    const redactionResult = redactContent(content, watchlist);

    const title =
      (typeof req.body.title === 'string' && req.body.title.trim()) ||
      (fileName ? path.basename(fileName, path.extname(fileName)) : 'Untitled Draft');

    const author = req.user?._id || null;
    const authorName = req.user?.name || 'Creator';
    const authorRole = req.user?.role || 'creator';
    const detectedFormat = inferFormat(req, content);

    const draft = new Draft({
      orgId,
      title,
      content,
      storageRef,
      fileName,
      fileSize,
      format: detectedFormat,
      author,
      authorName,
      authorRole,
      status: 'draft',
      currentVersion: 1,
      intent: validatedIntent,
      redactionLog: redactionResult.redactedTerms,
    });

    await draft.save();

    const draftVersion = new DraftVersion({
      draftId: draft._id,
      orgId,
      versionNumber: 1,
      content,
      contentHash,
      diff: '',
      author,
      createdAt: draft.createdAt,
    });

    await draftVersion.save();

    try {
      await logEvent({
        orgId,
        actor: req.user,
        eventType: AUDIT_EVENTS.DRAFT_SUBMITTED,
        entityType: 'draft',
        entityId: draft._id,
        metadata: {
          draftVersionId: draftVersion._id,
          versionNumber: 1,
          contentHash,
          hasFile: Boolean(req.file),
          fileName,
          fileSize,
          format: detectedFormat,
          storageRef,
          hasRedactions: redactionResult.hasRedactions,
          redactionsCount: redactionResult.totalReplacements,
          redactedTerms: redactionResult.redactedTerms,
          intentPurpose: validatedIntent.purpose,
          intentAudience: validatedIntent.audience,
        },
      });
    } catch (auditErr) {
      console.error('[drafts] AuditLog write failed for draft_submitted:', auditErr.message);
    }

    let downloadUrl = null;
    if (storageRef) {
      try {
        downloadUrl = await getPresignedUrl(storageRef, DEFAULT_PRESIGN_EXPIRY_SECONDS);
      } catch (_ignore) {
        // Non-fatal
      }
    }

    const responseData = {
      ...draft.toObject(),
      currentVersion: 1,
      contentHash,
      version: draftVersion.toObject(),
      redactedContent: redactionResult.redactedContent,
      redactions: redactionResult.redactions,
    };

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

    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.author) {
      filter.authorName = req.query.author;
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [drafts, total] = await Promise.all([
      Draft.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Draft.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      data: drafts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const draft = await Draft.findOne({ _id: id, orgId }).lean();
    if (!draft) {
      return sendError(res, 404, 'NOT_FOUND', `Draft with ID "${id}" was not found.`);
    }

    let downloadUrl = null;
    if (draft.storageRef) {
      try {
        downloadUrl = await getPresignedUrl(draft.storageRef, DEFAULT_PRESIGN_EXPIRY_SECONDS);
      } catch (_ignore) {
        // Non-fatal
      }
    }

    if (downloadUrl) {
      draft.downloadUrl = downloadUrl;
    }

    const latestVersion = await DraftVersion.findOne({ draftId: id, orgId })
      .sort({ versionNumber: -1 })
      .lean();
    draft.latestVersion = latestVersion;

    return res.json(draft);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/versions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const draft = await Draft.findOne({ _id: id, orgId }).lean();
    if (!draft) {
      return sendError(res, 404, 'NOT_FOUND', `Draft with ID "${id}" was not found.`);
    }

    const versions = await getVersions(id, orgId);

    return res.json({ success: true, data: versions, versions });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/passport', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const passport = await Passport.findOne({ draftId: id, orgId })
      .populate('approvers', 'name email role')
      .sort({ timestamp: -1 })
      .lean();

    if (!passport) {
      return sendError(res, 404, 'NOT_FOUND', `Brand Passport was not found for draft "${id}".`);
    }

    return res.json(passport);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/findings', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const draft = await Draft.findOne({ _id: id, orgId }).lean();
    if (!draft) {
      return sendError(res, 404, 'DRAFT_NOT_FOUND', `Draft "${id}" was not found in your organisation.`);
    }

    const filter = { draftId: id, orgId };

    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    if (req.query.verdict && req.query.verdict !== 'all') {
      filter.verdict = req.query.verdict;
    }
    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [findings, total] = await Promise.all([
      Finding.find(filter)
        .sort({ 'span.start': 1, createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Finding.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      data: findings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/redaction-preview', async (req, res, next) => {
  try {
    const orgId = getOrgId(req) || req.user?.orgId;
    const content = req.body?.content || req.body?.draftContent || req.draftContent;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return sendError(res, 400, 'MISSING_CONTENT', 'Validation error: "content" is required and must be a non-empty string.');
    }

    const watchlist = await loadOrgWatchlist(orgId, req.org);
    const result = redactContent(content, watchlist);

    return res.status(200).json({
      success: true,
      data: {
        original: result.original,
        redactedContent: result.redactedContent,
        hasRedactions: result.hasRedactions,
        totalReplacements: result.totalReplacements,
        redactions: result.redactions,
        whatWasRemoved: result.redactions.map((r) => ({
          term: r.term,
          count: r.count,
          category: 'confidential_watchlist',
          replacement: '[REDACTED]',
        })),
        provider: {
          name: 'BrandGuard ML Service / External LLM',
          type: 'Language Model Inference',
          destination: 'External Review Service',
        },
        rulesOnlyRecommended: result.hasRedactions,
      },
    });
  } catch (err) {
    return next(err);
  }
});

async function getDraftRedactionPreview(req, res, next) {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const draft = await Draft.findOne({ _id: id, orgId }).lean();
    if (!draft) {
      return sendError(res, 404, 'DRAFT_NOT_FOUND', `Draft "${id}" was not found in your organisation.`);
    }

    let content = req.body?.content;
    if (typeof content !== 'string') {
      const draftVersion = await DraftVersion.findOne({ draftId: draft._id, orgId })
        .sort({ versionNumber: -1 })
        .lean();
      content = draftVersion?.content || '';
    }

    const watchlist = await loadOrgWatchlist(orgId, req.org);
    const result = redactContent(content, watchlist);

    return res.status(200).json({
      success: true,
      data: {
        draftId: id,
        original: result.original,
        redactedContent: result.redactedContent,
        hasRedactions: result.hasRedactions,
        totalReplacements: result.totalReplacements,
        redactions: result.redactions,
        whatWasRemoved: result.redactions.map((r) => ({
          term: r.term,
          count: r.count,
          category: 'confidential_watchlist',
          replacement: '[REDACTED]',
        })),
        provider: {
          name: 'BrandGuard ML Service / External LLM',
          type: 'Language Model Inference',
          destination: 'External Review Service',
        },
        rulesOnlyRecommended: result.hasRedactions,
      },
    });
  } catch (err) {
    return next(err);
  }
}

router.get('/:id/redaction-preview', getDraftRedactionPreview);
router.post('/:id/redaction-preview', getDraftRedactionPreview);

module.exports = router;
