'use strict';

const express = require('express');

const Draft = require('../../models/Draft');
const DraftVersion = require('../../models/DraftVersion');
const Finding = require('../../models/Finding');
const { requireRole, CAN_REVIEW } = require('../../middleware/rbac');
const { redactContent, loadOrgWatchlist } = require('../../middleware/redactionGateway');
const { logEventSafe, AUDIT_EVENTS } = require('../../services/auditLogger');
const { extractClaims } = require('../../services/mlOrchestrator');
const { resolveFindingEvidence } = require('../../services/findingEvidence');
const { checkClaimShelfLife } = require('../../services/workflowEngine');
const { summariseVerdicts, resolveRulesOnly } = require('../../services/draftService');
const { sendError, getOrgId, isValidObjectId } = require('../../utils/response');

const router = express.Router();

router.post('/:id/review', requireRole(CAN_REVIEW), async (req, res, next) => {
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

    const draftVersion = await DraftVersion.findOne({ draftId: draft._id, orgId })
      .sort({ versionNumber: -1 })
      .lean();

    if (!draftVersion) {
      return sendError(res, 409, 'NO_VERSION', 'Draft has no content version to review. Submit content first.');
    }

    const watchlist = await loadOrgWatchlist(orgId, req.org);
    const redactionResult = redactContent(draftVersion.content || '', watchlist);

    if (redactionResult.hasRedactions) {
      try {
        await logEventSafe({
          orgId,
          actor,
          eventType: AUDIT_EVENTS.REDACTION_APPLIED,
          entityType: 'draft',
          entityId: draft._id,
          metadata: {
            draftVersionId: draftVersion._id,
            totalReplacements: redactionResult.totalReplacements,
            redactedTerms: redactionResult.redactedTerms,
          },
        });
      } catch (auditErr) {
        console.error('[drafts/review] AuditLog write failed for redaction_applied:', auditErr.message);
      }
    }

    const isRulesOnly = await resolveRulesOnly(req, orgId);

    let claims;
    try {
      claims = await extractClaims({
        redactedContent: redactionResult.redactedContent,
        orgId: orgId.toString(),
        intent: draft.intent,
        draftId: draft._id,
        actor: actor?._id,
        rulesOnly: isRulesOnly,
        bannedTerms: watchlist,
      });
    } catch (mlErr) {
      const mlCode = mlErr.code || 'ML_ERROR';

      if (mlCode === 'ML_URL_NOT_CONFIGURED') {
        return sendError(
          res,
          503,
          mlCode,
          'ML service is not configured. Contact the system administrator.'
        );
      }

      return sendError(
        res,
        502,
        mlCode,
        `ML service call failed: ${mlErr.message}`
      );
    }

    let savedFindings = [];
    let findingDocs = [];

    if (claims.length > 0) {
      findingDocs = await Promise.all(claims.map(async (claim) => {
        const resolved = await resolveFindingEvidence({ claim, orgId });
        return {
          orgId,
          draftId: draft._id,
          draftVersionId: draftVersion._id,
          span: {
            start: claim.span.start,
            end: claim.span.end,
          },
          type: resolved.proofPassageId ? claim.type : 'question',
          verdict: claim.verdict,
          confidence: claim.confidence,
          suggestedFix: claim.suggestedFix || null,
          ruleId: claim.ruleId || null,
          meaningCheck: claim.meaningCheck || null,
          explanation: claim.explanation || null,
          evidence: resolved.evidence,
          proofPassageId: resolved.proofPassageId,
          draftSpan: claim.draftSpan || claim.text || null,
          status: 'open',
        };
      }));
    }

    const shelfLifeFindings = await checkClaimShelfLife({
      claims,
      passages: req.body?.passages || [],
      draftId: draft._id,
      draftVersionId: draftVersion._id,
      orgId,
    });

    const allFindings = [...findingDocs, ...shelfLifeFindings];
    if (allFindings.length > 0) {
      savedFindings = await Finding.insertMany(allFindings, { ordered: false });
    }

    draft.status = 'checked';
    await draft.save();

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.REVIEW_COMPLETED,
      entityType: 'draft',
      entityId: draft._id,
      metadata: {
        draftVersionId: draftVersion._id,
        versionNumber: draftVersion.versionNumber,
        findingsCount: savedFindings.length,
        verdictSummary: summariseVerdicts(savedFindings),
        hasRedactions: redactionResult.hasRedactions,
        redactionsCount: redactionResult.totalReplacements,
        mlServiceUrl: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
      },
    });

    return res.status(200).json({
      success: true,
      draftId: draft._id,
      draftVersionId: draftVersion._id,
      status: draft.status,
      findingsCount: savedFindings.length,
      findings: savedFindings.map((f) => (f.toObject ? f.toObject() : f)),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
