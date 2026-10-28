

const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');


const AUDIT_EVENTS = {
  SOURCE_UPLOADED: 'source_uploaded',
  SOURCE_INDEXED: 'source_indexed',
  EXPIRY_WARNING: 'expiry_warning',
  SOURCE_EXPIRED: 'source_expired',
  DRAFT_SUBMITTED: 'draft_submitted',
  REVIEW_COMPLETED: 'review_completed',
  FINDING_ACTIONED: 'finding_actioned',
  FINDING_ACCEPTED: 'finding_accepted',
  FINDING_OVERRIDDEN: 'finding_overridden',
  FINDING_DISMISSED: 'finding_dismissed',
  COMMENT_ADDED: 'comment_added',
  DRAFT_APPROVED: 'draft_approved',
  CHANGES_REQUESTED: 'changes_requested',
  PASSPORT_CREATED: 'passport_created',
  CONFIDENTIAL_TERM_BLOCKED: 'confidential_term_blocked',
  ML_RESPONSE_DISCARDED: 'ml_response_discarded',
  FACT_ADDED: 'fact_added',
  RULES_ONLY_FALLBACK: 'rules_only_fallback',
};

/**
 * Extracts a MongoDB ObjectId or null from an actor principal.
 *
 * @param {string|mongoose.Types.ObjectId|object|null} actor
 * @returns {mongoose.Types.ObjectId|null}
 */
function extractActorId(actor) {
  if (!actor) return null;
  if (actor instanceof mongoose.Types.ObjectId) return actor;
  if (typeof actor === 'object') {
    if (actor._id) return extractActorId(actor._id);
    if (actor.sub && mongoose.Types.ObjectId.isValid(actor.sub)) {
      return new mongoose.Types.ObjectId(actor.sub);
    }
  }
  if (typeof actor === 'string' && mongoose.Types.ObjectId.isValid(actor)) {
    return new mongoose.Types.ObjectId(actor);
  }
  return null;
}

/**
 * Creates an append-only audit log entry in MongoDB.
 *
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.orgId - Organisation ID (tenant isolation)
 * @param {string|mongoose.Types.ObjectId|object} [params.actor] - User who triggered the action
 * @param {string} params.eventType - Standard event type string
 * @param {string} params.entityType - Category of entity (e.g. 'source', 'draft', 'finding')
 * @param {string|mongoose.Types.ObjectId} [params.entityId] - Target entity identifier
 * @param {object} [params.metadata={}] - Structured metadata or details
 * @param {Date} [params.timestamp] - Optional event timestamp (defaults to Date.now)
 * @returns {Promise<import('mongoose').Document>} Created AuditLog document
 */
async function logEvent(params) {
  if (!params || typeof params !== 'object') {
    throw new Error('[auditLogger] logEvent requires an event parameters object.');
  }

  const {
    orgId,
    actor = null,
    eventType,
    entityType,
    entityId = null,
    metadata = {},
    timestamp = new Date(),
  } = params;

  if (!orgId) {
    throw new Error('[auditLogger] orgId is required for tenant isolation.');
  }

  if (!eventType) {
    throw new Error('[auditLogger] eventType is required.');
  }

  if (!entityType) {
    throw new Error('[auditLogger] entityType is required.');
  }

  const actorId = extractActorId(actor);

  const entry = new AuditLog({
    orgId: new mongoose.Types.ObjectId(orgId),
    actor: actorId,
    eventType,
    entityType,
    entityId,
    metadata,
    timestamp,
  });

  return await entry.save();
}

/**
 * Non-throwing safe logger wrapper. Logs warning to console if write fails.
 *
 * @param {object} params
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function logEventSafe(params) {
  try {
    return await logEvent(params);
  } catch (err) {
    console.error('[auditLogger] Failed to write audit event:', err.message);
    return null;
  }
}

/**
 * Queries audit events scoped to an organisation with pagination.
 *
 * @param {object} filter
 * @param {string|mongoose.Types.ObjectId} filter.orgId - Required organisation filter
 * @param {string} [filter.entityType] - Optional entity type filter
 * @param {string|mongoose.Types.ObjectId} [filter.entityId] - Optional entity ID filter
 * @param {string} [filter.eventType] - Optional event type filter
 * @param {number} [filter.limit=50] - Maximum records to return
 * @param {number} [filter.skip=0] - Offset for pagination
 * @returns {Promise<Array<import('mongoose').Document>>}
 */
async function getAuditTrail({ orgId, entityType, entityId, eventType, limit = 50, skip = 0 }) {
  if (!orgId) {
    throw new Error('[auditLogger] orgId is required to query audit trail.');
  }

  const query = { orgId: new mongoose.Types.ObjectId(orgId) };
  if (entityType) query.entityType = entityType;
  if (entityId) query.entityId = entityId;
  if (eventType) query.eventType = eventType;

  return await AuditLog.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

module.exports = {
  logEvent,
  logEventSafe,
  getAuditTrail,
  AUDIT_EVENTS,
  extractActorId,
};
