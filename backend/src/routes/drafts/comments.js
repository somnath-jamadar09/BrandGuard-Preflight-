'use strict';

const express = require('express');

const Draft = require('../../models/Draft');
const Comment = require('../../models/Comment');
const Finding = require('../../models/Finding');
const { hasRole } = require('../../middleware/rbac');
const { logEventSafe, AUDIT_EVENTS } = require('../../services/auditLogger');
const { mapCommentType } = require('../../services/draftService');
const { sendError, getOrgId, isValidObjectId } = require('../../utils/response');

const router = express.Router();

router.post('/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);
    const actor = req.user;

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${id}".`);
    }

    const draft = await Draft.findOne({ _id: id, orgId });
    if (!draft) {
      return sendError(res, 404, 'DRAFT_NOT_FOUND', `Draft "${id}" was not found in your organisation.`);
    }

    const {
      text,
      action = 'comment',
      findingId = null,
      reason = null,
      commentId,
      parentCommentId,
    } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return sendError(res, 400, 'MISSING_TEXT', 'Comment text is required and cannot be empty.');
    }

    const trimmedText = text.trim();
    const allowedActions = Comment.COMMENT_ACTIONS;
    const normalisedAction = action ? String(action).trim().toLowerCase() : 'comment';

    if (!allowedActions.includes(normalisedAction)) {
      return sendError(
        res,
        400,
        'INVALID_ACTION',
        `Action "${action}" is invalid. Allowed actions: ${allowedActions.join(', ')}.`
      );
    }

    if (normalisedAction === 'approve' && !hasRole(actor?.role, 'manager')) {
      return sendError(
        res,
        403,
        'ROLE_INSUFFICIENT',
        'Forbidden: Insufficient privileges. Only managers can record approval actions.',
        {
          requiredRoles: ['manager'],
          userRole: actor?.role,
        }
      );
    }

    if (normalisedAction === 'override' && !hasRole(actor?.role, ['reviewer', 'manager'])) {
      return sendError(
        res,
        403,
        'ROLE_INSUFFICIENT',
        'Forbidden: Insufficient privileges. Only reviewers or managers can record override actions.',
        {
          requiredRoles: ['reviewer', 'manager'],
          userRole: actor?.role,
        }
      );
    }

    if (normalisedAction === 'override' && (!reason || !String(reason).trim())) {
      return sendError(res, 400, 'REASON_REQUIRED', 'A reason is required when action is "override".');
    }

    if (findingId) {
      if (!isValidObjectId(findingId)) {
        return sendError(res, 400, 'INVALID_FINDING_ID', `Invalid finding ID "${findingId}".`);
      }
      const existingFinding = await Finding.findOne({ _id: findingId, orgId, draftId: draft._id });
      if (!existingFinding) {
        return sendError(
          res,
          404,
          'FINDING_NOT_FOUND',
          `Finding "${findingId}" was not found for this draft in your organisation.`
        );
      }
    }

    const targetCommentId = commentId || parentCommentId;
    let commentDoc;

    const threadEntry = {
      author: actor?._id,
      authorName: actor?.name || 'User',
      authorRole: actor?.role || 'reviewer',
      text: trimmedText,
      timestamp: new Date(),
    };

    if (targetCommentId) {
      if (!isValidObjectId(targetCommentId)) {
        return sendError(res, 400, 'INVALID_COMMENT_ID', `Invalid comment ID "${targetCommentId}".`);
      }

      commentDoc = await Comment.findOne({
        _id: targetCommentId,
        draftId: draft._id,
        orgId,
      });

      if (!commentDoc) {
        return sendError(res, 404, 'COMMENT_NOT_FOUND', `Comment thread "${targetCommentId}" not found.`);
      }

      commentDoc.thread.push(threadEntry);
      commentDoc.updatedAt = new Date();
      await commentDoc.save();
    } else {
      commentDoc = new Comment({
        orgId,
        draftId: draft._id,
        findingId: findingId || null,
        action: normalisedAction,
        type: mapCommentType(normalisedAction),
        author: actor?._id,
        authorName: actor?.name || 'User',
        authorRole: actor?.role || 'reviewer',
        text: trimmedText,
        reason: reason ? String(reason).trim() : null,
        thread: [threadEntry],
        createdAt: new Date(),
      });
      await commentDoc.save();
    }

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.COMMENT_ADDED,
      entityType: 'comment',
      entityId: commentDoc._id,
      metadata: {
        draftId: draft._id,
        findingId: findingId || null,
        action: commentDoc.action,
        commentId: commentDoc._id,
        threadLength: commentDoc.thread.length,
      },
    });

    const populated = await Comment.findById(commentDoc._id)
      .populate('author', 'name email role')
      .populate('thread.author', 'name email role')
      .lean();

    // Contract preservation (Finding C7):
    // Tests and client code inspect both top-level properties and nested `data: populated`.
    // Returning both keeps contracts 100% compatible.
    return res.status(201).json({
      success: true,
      ...populated,
      data: populated,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/comments', async (req, res, next) => {
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
    if (req.query.findingId) {
      if (!isValidObjectId(req.query.findingId)) {
        return sendError(res, 400, 'INVALID_FINDING_ID', `Invalid finding ID "${req.query.findingId}".`);
      }
      filter.findingId = req.query.findingId;
    }

    const comments = await Comment.find(filter)
      .sort({ createdAt: 1 })
      .populate('author', 'name email role')
      .populate('thread.author', 'name email role')
      .lean();

    return res.status(200).json({
      success: true,
      count: comments.length,
      data: comments,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
