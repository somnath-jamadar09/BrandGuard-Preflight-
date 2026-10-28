'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Fact = require('../models/Fact');
const { authenticate } = require('../middleware/auth');
const { orgIsolation } = require('../middleware/orgIsolation');
const { requireRole, CAN_MANAGE_FACTS } = require('../middleware/rbac');
const { logEvent, AUDIT_EVENTS } = require('../services/auditLogger');
const { sendError, getOrgId } = require('../utils/response');

const router = express.Router();

router.use(authenticate, orgIsolation);

const MAX_TAGS = 20;
const MAX_TAG_LEN = 80;

function validateBody(body, actorUserId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.', code: 'MISSING_BODY' };
  }

  const {
    label,
    statement,
    ownerId,
    category,
    status,
    expiresAt,
    sourceRef,
    tags,
    confidenceWeight,
  } = body;

  const errors = {};

  if (!label || typeof label !== 'string' || !label.trim()) {
    errors.label = 'label is required and must be a non-empty string.';
  } else if (label.trim().length > 200) {
    errors.label = 'label must be at most 200 characters.';
  }

  if (!statement || typeof statement !== 'string' || !statement.trim()) {
    errors.statement = 'statement is required and must be a non-empty string.';
  } else if (statement.trim().length < 5) {
    errors.statement = 'statement must be at least 5 characters.';
  } else if (statement.trim().length > 5000) {
    errors.statement = 'statement must be at most 5000 characters.';
  }

  let resolvedOwnerId = actorUserId;
  if (ownerId !== undefined) {
    if (typeof ownerId !== 'string' || !mongoose.Types.ObjectId.isValid(ownerId)) {
      errors.ownerId = 'ownerId must be a valid MongoDB ObjectId string.';
    } else {
      resolvedOwnerId = ownerId;
    }
  }

  let resolvedCategory = 'other';
  if (category !== undefined) {
    if (typeof category !== 'string' || !Fact.FACT_CATEGORIES.includes(category.trim().toLowerCase())) {
      errors.category = `category must be one of: ${Fact.FACT_CATEGORIES.join(', ')}.`;
    } else {
      resolvedCategory = category.trim().toLowerCase();
    }
  }

  let resolvedStatus = 'active';
  if (status !== undefined) {
    if (typeof status !== 'string' || !Fact.FACT_STATUSES.includes(status.trim().toLowerCase())) {
      errors.status = `status must be one of: ${Fact.FACT_STATUSES.join(', ')}.`;
    } else {
      resolvedStatus = status.trim().toLowerCase();
    }
  }

  let resolvedExpiresAt = null;
  if (expiresAt !== undefined && expiresAt !== null) {
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) {
      errors.expiresAt = 'expiresAt must be a valid ISO 8601 date string.';
    } else if (parsed <= new Date()) {
      errors.expiresAt = 'expiresAt must be a date in the future.';
    } else {
      resolvedExpiresAt = parsed;
    }
  }

  let resolvedSourceRef = null;
  if (sourceRef !== undefined && sourceRef !== null) {
    if (typeof sourceRef !== 'string') {
      errors.sourceRef = 'sourceRef must be a string.';
    } else if (sourceRef.trim().length > 500) {
      errors.sourceRef = 'sourceRef must be at most 500 characters.';
    } else {
      resolvedSourceRef = sourceRef.trim() || null;
    }
  }

  let resolvedTags = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      errors.tags = 'tags must be an array of strings.';
    } else if (tags.length > MAX_TAGS) {
      errors.tags = `tags may contain at most ${MAX_TAGS} items.`;
    } else {
      const invalidTags = [];
      const cleanedTags = [];

      for (let i = 0; i < tags.length; i++) {
        const t = tags[i];
        if (typeof t !== 'string') {
          invalidTags.push(`tags[${i}]: must be a string`);
        } else if (t.trim().length > MAX_TAG_LEN) {
          invalidTags.push(`tags[${i}]: must be at most ${MAX_TAG_LEN} characters`);
        } else if (t.trim()) {
          cleanedTags.push(t.trim());
        }
      }

      if (invalidTags.length > 0) {
        errors.tags = invalidTags.join('; ');
      } else {
        resolvedTags = [...new Set(cleanedTags)];
      }
    }
  }

  let resolvedConfidenceWeight = 1.0;
  if (confidenceWeight !== undefined) {
    if (typeof confidenceWeight !== 'number' || isNaN(confidenceWeight)) {
      errors.confidenceWeight = 'confidenceWeight must be a number.';
    } else if (confidenceWeight < 0 || confidenceWeight > 1) {
      errors.confidenceWeight = 'confidenceWeight must be between 0 and 1 (inclusive).';
    } else {
      resolvedConfidenceWeight = confidenceWeight;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      error: 'Request body failed validation.',
      code: 'VALIDATION_ERROR',
      details: errors,
    };
  }

  return {
    valid: true,
    data: {
      label: label.trim(),
      statement: statement.trim(),
      ownerId: resolvedOwnerId,
      category: resolvedCategory,
      status: resolvedStatus,
      expiresAt: resolvedExpiresAt,
      sourceRef: resolvedSourceRef,
      tags: resolvedTags,
      confidenceWeight: resolvedConfidenceWeight,
    },
  };
}

router.post('/', requireRole(CAN_MANAGE_FACTS), async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const actorId = req.user?._id;

    const validation = validateBody(req.body, actorId?.toString());

    if (!validation.valid) {
      return sendError(res, 400, validation.code, validation.error, {
        details: validation.details || undefined,
      });
    }

    const {
      label,
      statement,
      ownerId,
      category,
      status,
      expiresAt,
      sourceRef,
      tags,
      confidenceWeight,
    } = validation.data;

    const fact = new Fact({
      orgId,
      ownerId,
      label,
      statement,
      category,
      status,
      expiresAt,
      sourceRef,
      tags,
      confidenceWeight,
    });

    await fact.save();

    try {
      await logEvent({
        orgId,
        actor: actorId,
        eventType: AUDIT_EVENTS.FACT_ADDED,
        entityType: 'fact',
        entityId: fact._id,
        metadata: {
          label,
          category,
          status,
          ownerId: ownerId.toString(),
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          tagCount: tags.length,
          confidenceWeight,
        },
      });
    } catch (auditErr) {
      console.error('[facts] AuditLog write failed for fact_added:', auditErr.message);
    }

    return res.status(201).json({
      success: true,
      fact: fact.toObject(),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const details = Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      );
      return sendError(res, 422, 'VALIDATION_ERROR', 'Fact validation failed.', { details });
    }
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = { orgId };
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.category) {
      filter.category = req.query.category;
    }

    const [facts, total] = await Promise.all([
      Fact.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Fact.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: facts,
      total,
      page,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

