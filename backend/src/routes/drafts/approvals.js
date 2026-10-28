'use strict';

const express = require('express');

const Draft = require('../../models/Draft');
const DraftVersion = require('../../models/DraftVersion');
const Finding = require('../../models/Finding');
const Comment = require('../../models/Comment');
const { requireRole, CAN_APPROVE, CAN_OVERRIDE } = require('../../middleware/rbac');
const { sha256 } = require('../../utils/hash');
const { logEventSafe, AUDIT_EVENTS } = require('../../services/auditLogger');
const { buildPassport } = require('../../services/passportBuilder');
const { sendError, getOrgId, isValidObjectId } = require('../../utils/response');
const { RULES_VERSION } = require('../../config');

const router = express.Router();

router.post('/:id/approve', requireRole(CAN_APPROVE), async (req, res, next) => {
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

    const openFindingsCount = await Finding.countDocuments({
      draftId: draft._id,
      orgId,
      status: 'open',
    });

    if (openFindingsCount > 0) {
      return sendError(
        res,
        409,
        'OPEN_FINDINGS_EXIST',
        `Open findings must be resolved before approval. Found ${openFindingsCount} open finding(s).`,
        { openFindingsCount }
      );
    }

    const latestVersion = await DraftVersion.findOne({ draftId: draft._id, orgId })
      .sort({ versionNumber: -1 });

    const currentVersionNum = latestVersion ? latestVersion.versionNumber : (draft.currentVersion || 1);
    const nextVersionNum = currentVersionNum + 1;

    const approvedContent =
      req.body?.content !== undefined
        ? String(req.body.content)
        : req.body?.approvedContent !== undefined
        ? String(req.body.approvedContent)
        : (latestVersion?.content || '');

    const contentHash = sha256(approvedContent);

    const newDraftVersion = new DraftVersion({
      draftId: draft._id,
      orgId,
      versionNumber: nextVersionNum,
      content: approvedContent,
      contentHash,
      diff: latestVersion ? `Approved version v${nextVersionNum}` : '',
      author: actor?._id || null,
      createdAt: new Date(),
    });
    await newDraftVersion.save();

    draft.status = 'approved';
    draft.currentVersion = nextVersionNum;
    await draft.save();

    const passport = await buildPassport({
      orgId,
      draftId: draft._id,
      draftVersionId: newDraftVersion._id,
      content: approvedContent,
      contentHash,
      checksRun: req.body?.checksRun || ['claim_match', 'contradiction', 'rules', 'premortem'],
      rulesVersion: req.body?.rulesVersion || RULES_VERSION || 'v1.2',
      approverId: actor?._id,
      aiUsed: req.body?.aiUsed !== undefined ? req.body.aiUsed : true,
    });

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.DRAFT_APPROVED,
      entityType: 'draft',
      entityId: draft._id,
      metadata: {
        draftVersionId: newDraftVersion._id,
        versionNumber: nextVersionNum,
        passportId: passport._id,
        contentHash,
      },
    });

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.PASSPORT_CREATED,
      entityType: 'passport',
      entityId: passport._id,
      metadata: {
        draftId: draft._id,
        draftVersionId: newDraftVersion._id,
        contentHash,
        rulesVersion: passport.rulesVersion,
        approvers: passport.approvers,
      },
    });

    try {
      const approvalCommentText = req.body?.comment || `${actor?.name || 'Manager'} approved this draft.`;
      const approvalComment = new Comment({
        orgId,
        draftId: draft._id,
        action: 'approve',
        type: 'approved',
        author: actor?._id || draft.author,
        authorName: actor?.name || 'Manager',
        authorRole: actor?.role || 'manager',
        text: approvalCommentText,
        thread: [
          {
            author: actor?._id || draft.author,
            authorName: actor?.name || 'Manager',
            authorRole: actor?.role || 'manager',
            text: approvalCommentText,
            timestamp: new Date(),
          },
        ],
        createdAt: new Date(),
      });
      await approvalComment.save();
    } catch (commErr) {
      console.warn('[drafts] Approval comment recording skipped:', commErr.message);
    }

    return res.status(200).json({
      success: true,
      draft: draft.toObject(),
      passport: passport.toObject(),
      version: newDraftVersion.toObject(),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/request-changes', requireRole(CAN_APPROVE), async (req, res, next) => {
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

    const reason = req.body?.reason || req.body?.text || 'Changes requested by reviewer.';

    draft.status = 'draft';
    await draft.save();

    const changeComment = new Comment({
      orgId,
      draftId: draft._id,
      action: 'request-changes',
      type: 'changes-requested',
      author: actor?._id || draft.author,
      authorName: actor?.name || 'Manager',
      authorRole: actor?.role || 'manager',
      text: reason,
      thread: [
        {
          author: actor?._id || draft.author,
          authorName: actor?.name || 'Manager',
          authorRole: actor?.role || 'manager',
          text: reason,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
    });
    await changeComment.save();

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.CHANGES_REQUESTED,
      entityType: 'draft',
      entityId: draft._id,
      metadata: {
        reason,
        commentId: changeComment._id,
      },
    });

    return res.status(200).json({
      success: true,
      draft: draft.toObject(),
      comment: changeComment.toObject(),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/override', requireRole(CAN_OVERRIDE), async (req, res, next) => {
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

    const reason = req.body?.reason || req.body?.text;
    if (!reason || !String(reason).trim()) {
      return sendError(res, 400, 'REASON_REQUIRED', 'A reason is required when overriding a finding.');
    }

    const findingId = req.body?.findingId;
    let findingDoc = null;
    if (findingId && isValidObjectId(findingId)) {
      findingDoc = await Finding.findOne({ _id: findingId, orgId });
      if (findingDoc && findingDoc.status === 'open') {
        findingDoc.status = 'dismissed';
        await findingDoc.save();
      }
    }

    const trimmedReason = String(reason).trim();
    const overrideComment = new Comment({
      orgId,
      draftId: draft._id,
      findingId: findingDoc?._id || (findingId && isValidObjectId(findingId) ? findingId : null),
      action: 'override',
      type: 'override',
      author: actor?._id || draft.author,
      authorName: actor?.name || 'Reviewer',
      authorRole: actor?.role || 'reviewer',
      text: trimmedReason,
      reason: trimmedReason,
      thread: [
        {
          author: actor?._id || draft.author,
          authorName: actor?.name || 'Reviewer',
          authorRole: actor?.role || 'reviewer',
          text: trimmedReason,
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
    });
    await overrideComment.save();

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.FINDING_OVERRIDDEN,
      entityType: 'finding',
      entityId: findingDoc?._id || draft._id,
      metadata: {
        draftId: draft._id,
        findingId: findingDoc?._id || null,
        ruleId: findingDoc?.ruleId || null,
        reason: trimmedReason,
        commentId: overrideComment._id,
      },
    });

    return res.status(200).json({
      success: true,
      comment: overrideComment.toObject(),
      finding: findingDoc ? findingDoc.toObject() : null,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
