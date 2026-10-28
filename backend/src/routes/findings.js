'use strict';

const express = require('express');
const mongoose = require('mongoose');

const Finding = require('../models/Finding');
const { authenticate } = require('../middleware/auth');
const { orgIsolation } = require('../middleware/orgIsolation');
const { requireRole, hasRole, CAN_UPDATE_FINDING } = require('../middleware/rbac');
const { logEvent, AUDIT_EVENTS } = require('../services/auditLogger');
const { createDraftVersionOnAcceptedFix } = require('../services/versionManager');
const { sendError, getOrgId, isValidObjectId } = require('../utils/response');

const router = express.Router();

router.use(authenticate, orgIsolation);

const ALLOWED_TRANSITIONS = {
  open: ['accepted', 'edited', 'dismissed', 'escalated'],
  escalated: ['accepted', 'edited', 'dismissed'],
  accepted: [],
  edited: [],
  dismissed: [],
};

function isTransitionAllowed(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required.', code: 'MISSING_BODY' };
  }

  const { status, reason, editedText } = body;

  if (!status || typeof status !== 'string') {
    return {
      valid: false,
      error: 'Field "status" is required and must be a string.',
      code: 'MISSING_STATUS',
    };
  }

  const normalised = status.trim().toLowerCase();

  if (!Finding.FINDING_STATUSES.includes(normalised)) {
    return {
      valid: false,
      error: `Status "${status}" is not valid. Allowed values: ${Finding.FINDING_STATUSES.join(', ')}.`,
      code: 'INVALID_STATUS',
    };
  }

  if (normalised === 'dismissed') {
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return {
        valid: false,
        error: 'A non-empty reason is required when dismissing a finding.',
        code: 'REASON_REQUIRED',
      };
    }
  }

  if (normalised === 'edited') {
    if (!editedText || typeof editedText !== 'string' || !editedText.trim()) {
      return {
        valid: false,
        error: 'editedText is required and must be non-empty when status is "edited".',
        code: 'EDITED_TEXT_REQUIRED',
      };
    }
  }

  return { valid: true, normalisedStatus: normalised };
}

router.patch('/:id', requireRole(CAN_UPDATE_FINDING), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const actor = req.user?._id || null;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid finding ID "${id}".`);
    }

    const bodyValidation = validateBody(req.body);
    if (!bodyValidation.valid) {
      return sendError(res, 400, bodyValidation.code, bodyValidation.error);
    }

    const { normalisedStatus } = bodyValidation;

    if (normalisedStatus === 'escalated' && !hasRole(req.user?.role, ['reviewer', 'manager', 'brand_manager', 'admin', 'owner'])) {
      return sendError(
        res,
        403,
        'ROLE_INSUFFICIENT',
        'Forbidden: Insufficient privileges to escalate findings. Requires reviewer or manager role.',
        {
          requiredRoles: ['reviewer', 'manager'],
          userRole: req.user?.role,
        }
      );
    }

    const reason = req.body.reason ? String(req.body.reason).trim() : null;
    const editedText = req.body.editedText ? String(req.body.editedText).trim() : null;

    const finding = await Finding.findOne({ _id: id, orgId });
    if (!finding) {
      return sendError(res, 404, 'FINDING_NOT_FOUND', `Finding "${id}" was not found in your organisation.`);
    }

    const currentStatus = finding.status;

    if (currentStatus === normalisedStatus) {
      return sendError(
        res,
        409,
        'STATUS_UNCHANGED',
        `Finding is already in status "${currentStatus}". No change was made.`,
        { currentStatus }
      );
    }

    if (!isTransitionAllowed(currentStatus, normalisedStatus)) {
      const terminal = ALLOWED_TRANSITIONS[currentStatus]?.length === 0;
      return sendError(
        res,
        422,
        terminal ? 'TERMINAL_STATUS' : 'INVALID_TRANSITION',
        terminal
          ? `Finding is in terminal status "${currentStatus}" and cannot be changed.`
          : `Transition from "${currentStatus}" to "${normalisedStatus}" is not permitted.`,
        {
          currentStatus,
          targetStatus: normalisedStatus,
          allowedTargets: ALLOWED_TRANSITIONS[currentStatus] || [],
        }
      );
    }

    const previousStatus = finding.status;
    const previousSuggestedFix = finding.suggestedFix;

    finding.status = normalisedStatus;

    if (normalisedStatus === 'edited' && editedText) {
      finding.suggestedFix = editedText;
    }

    await finding.save();

    let createdVersion = null;
    if (normalisedStatus === 'accepted' || (normalisedStatus === 'edited' && (editedText || finding.suggestedFix))) {
      try {
        const versionResult = await createDraftVersionOnAcceptedFix({
          finding,
          orgId,
          actor: req.user,
          suggestedFix: (normalisedStatus === 'edited' && editedText) ? editedText : finding.suggestedFix,
        });
        createdVersion = versionResult.draftVersion;
      } catch (versionErr) {
        console.warn('[findings] Failed to create DraftVersion on accepted fix:', versionErr.message);
      }
    }

    const auditMetadata = {
      previousStatus,
      newStatus: normalisedStatus,
      draftId: finding.draftId,
      draftVersionId: createdVersion ? createdVersion._id : finding.draftVersionId,
      verdict: finding.verdict,
      type: finding.type,
      ruleId: finding.ruleId || null,
    };

    if (reason) auditMetadata.reason = reason;
    if (editedText) auditMetadata.editedText = editedText;
    if (normalisedStatus === 'edited' && previousSuggestedFix !== editedText) {
      auditMetadata.previousSuggestedFix = previousSuggestedFix;
    }
    if (createdVersion) {
      auditMetadata.newVersionNumber = createdVersion.versionNumber;
    }

    try {
      await logEvent({
        orgId,
        actor,
        eventType: AUDIT_EVENTS.FINDING_ACTIONED,
        entityType: 'finding',
        entityId: finding._id,
        metadata: auditMetadata,
      });
    } catch (auditErr) {
      console.error('[findings] AuditLog write failed for finding_actioned:', auditErr.message);
    }

    return res.json({
      success: true,
      finding: finding.toObject(),
      previousStatus,
      newStatus: normalisedStatus,
      version: createdVersion ? (createdVersion.toObject ? createdVersion.toObject() : createdVersion) : undefined,
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
      return sendError(res, 400, 'INVALID_ID', `Invalid finding ID "${id}".`);
    }

    const finding = await Finding.findOne({ _id: id, orgId }).lean();
    if (!finding) {
      return sendError(res, 404, 'FINDING_NOT_FOUND', `Finding "${id}" was not found in your organisation.`);
    }

    return res.json(finding);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
