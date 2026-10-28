'use strict';

const Org = require('../models/Org');
const { logEventSafe, AUDIT_EVENTS } = require('./auditLogger');
const { postJson } = require('./ml/http');
const {
  VALID_VERDICTS,
  VALID_FINDING_TYPES,
  VALID_INDEX_STATUSES,
  ML_RESPONSE_TYPES,
  checkUnitInterval,
  validateClaim,
  validateExtractClaimsResponse,
  validateFactCheckResponse,
  validateSummariseResponse,
  validateClassLabel,
  validateClassifyResponse,
  validateIndexResponse,
  validateSourceIndexResponse,
  validateSimilarityMatch,
  validateSimilarityResponse,
  validateRewriteResponse,
  ML_VALIDATORS,
  validateMlResponse,
  discardIfInvalid,
} = require('./ml/validators');
const {
  EXACT_SUPERLATIVE_RE,
  EXACT_OUTDATED_RETURN_RE,
  EXACT_COST_CLAIM_RE,
  extractExactRuleFindings,
  DEFAULT_RULE_REWORDINGS,
} = require('./ml/exactRules');
const {
  DEFAULT_ML_TIMEOUT_MS,
  ML_TIMEOUT_MS,
  ML_SERVICE_URL,
  ML_INTERNAL_TOKEN,
} = require('../config');

const DEFAULT_TIMEOUT_MS = ML_TIMEOUT_MS || DEFAULT_ML_TIMEOUT_MS;

function getMlBaseUrl() {
  const url = (process.env.ML_SERVICE_URL || ML_SERVICE_URL || '').replace(/\/$/, '');
  if (!url) {
    throw Object.assign(
      new Error(
        'ML_SERVICE_URL environment variable is not configured. ' +
        'Set it to the internal ML service address (e.g. http://ml:8000).'
      ),
      { code: 'ML_URL_NOT_CONFIGURED' }
    );
  }
  return url;
}

function getMlAuthHeader() {
  return { 'X-ML-Internal-Token': process.env.ML_INTERNAL_TOKEN || ML_INTERNAL_TOKEN || '' };
}

async function indexSource({
  sourceId,
  orgId,
  fileName,
  mimeType,
  version = '1.0',
  expiryDate = null,
  ownerName = '',
  status = 'ready',
  content,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const mlBaseUrl = getMlBaseUrl();

  const payload = {
    sourceId: String(sourceId),
    orgId: String(orgId),
    fileName: String(fileName),
    mimeType: mimeType || 'application/octet-stream',
    version: String(version || '1.0'),
    expiryDate: expiryDate || null,
    ownerName: String(ownerName || ''),
    status: String(status || 'ready'),
    contentBase64: Buffer.from(content || '').toString('base64'),
  };

  const rawResponse = await postJson(
    `${mlBaseUrl}/index-source`,
    payload,
    timeoutMs,
    getMlAuthHeader()
  );

  const validation = validateSourceIndexResponse(rawResponse, sourceId, orgId);
  if (!validation.valid) {
    throw Object.assign(
      new Error(`ML source index response failed schema validation: ${validation.error}`),
      { code: 'ML_SCHEMA_INVALID' }
    );
  }

  return rawResponse;
}

async function updateSourceMetadata({
  sourceId,
  orgId,
  status,
  expiryDate,
  ownerName,
  version,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const mlBaseUrl = getMlBaseUrl();
  const payload = { sourceId: String(sourceId), orgId: String(orgId) };

  if (status !== undefined) payload.status = status;
  if (expiryDate !== undefined) payload.expiryDate = expiryDate ? new Date(expiryDate).toISOString() : null;
  if (ownerName !== undefined) payload.ownerName = String(ownerName || '');
  if (version !== undefined) payload.version = String(version || '1.0');

  return postJson(
    `${mlBaseUrl}/source-metadata`,
    payload,
    timeoutMs,
    getMlAuthHeader()
  );
}

async function rewriteClaim({
  claim,
  rule = null,
  ruleId = null,
  description = '',
  originalText = '',
  intent = {},
  passages = [],
  orgId = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const rId = ruleId || rule || (typeof claim === 'object' ? claim?.ruleId : null);
  const mlBaseUrl = (process.env.ML_SERVICE_URL || ML_SERVICE_URL || '').replace(/\/$/, '');

  const defaultRewording =
    DEFAULT_RULE_REWORDINGS[rId] ||
    (description
      ? `Refine guideline: ${description}. Must include verifiable compliance criteria.`
      : 'Guideline rule must specify clear, verifiable compliance criteria.');

  if (!mlBaseUrl) {
    return {
      suggestedFix: defaultRewording,
      suggestedRewording: defaultRewording,
      meaningCheck: { kept: [], changed: [], dropped: [] },
    };
  }

  const targetUrl = `${mlBaseUrl}/rewrite`;
  const claimPayload =
    typeof claim === 'object' && claim !== null
      ? claim
      : { text: String(claim || originalText || description || '') };

  let allowExternalModel = false;
  if (orgId) {
    try {
      const org = await Org.findById(orgId).select('settings.allowExternalModel').lean();
      allowExternalModel = org?.settings?.allowExternalModel === true;
    } catch (_error) {
      allowExternalModel = false;
    }
  }

  const payload = {
    claim: claimPayload,
    allowExternalModel,
    rule: rId,
    ruleId: rId,
    originalText: String(originalText || claimPayload.text || description || ''),
    intent: {
      purpose: intent?.purpose || '',
      audience: intent?.audience || '',
      mustSay: Array.isArray(intent?.mustSay) ? intent.mustSay : [],
    },
    passages: Array.isArray(passages) ? passages : [],
    orgId: String(orgId || ''),
  };

  try {
    const rawResponse = await postJson(targetUrl, payload, timeoutMs, getMlAuthHeader());
    const suggestedFix = rawResponse?.suggestedFix || '';
    const suggestedRewording =
      rawResponse?.suggestedRewording ||
      suggestedFix ||
      defaultRewording;

    return {
      suggestedFix,
      suggestedRewording,
      meaningCheck: rawResponse?.meaningCheck || { kept: [], changed: [], dropped: [] },
    };
  } catch (err) {
    console.warn(`[mlOrchestrator] /rewrite call failed: ${err.message}. Using default rewording fallback.`);
    return {
      suggestedFix: defaultRewording,
      suggestedRewording: defaultRewording,
      meaningCheck: { kept: [], changed: [], dropped: [] },
    };
  }
}

async function extractClaims({
  redactedContent,
  orgId,
  intent = {},
  draftId = null,
  actor = null,
  rulesOnly = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  bannedTerms = [],
}) {
  if (rulesOnly) {
    console.log(`[mlOrchestrator] rules_only=true: skipping all LM calls for org ${orgId}`);

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.RULES_ONLY_FALLBACK,
      entityType: 'draft',
      entityId: draftId,
      metadata: {
        reason: 'Org setting rules_only enabled; skipped all LM calls',
        contentLength: (redactedContent || '').length,
      },
    });

    return extractExactRuleFindings(redactedContent, { orgId, intent, bannedTerms });
  }

  const mlBaseUrl = getMlBaseUrl();
  const targetUrl = `${mlBaseUrl}/extract-claims`;

  const payload = {
    content: String(redactedContent || ''),
    orgId: String(orgId),
    intent: {
      purpose: intent?.purpose || '',
      audience: intent?.audience || '',
      mustSay: Array.isArray(intent?.mustSay) ? intent.mustSay : [],
    },
  };

  console.log(
    `[mlOrchestrator] POST ${targetUrl} | org=${orgId}` +
    ` | contentLength=${payload.content.length} | timeout=${timeoutMs}ms`
  );

  let rawResponse;
  try {
    rawResponse = await postJson(targetUrl, payload, timeoutMs, getMlAuthHeader());
  } catch (httpErr) {
    console.error(`[mlOrchestrator] HTTP call failed [${httpErr.code}]: ${httpErr.message}`);

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.ML_RESPONSE_DISCARDED,
      entityType: 'draft',
      entityId: draftId,
      metadata: {
        reason: httpErr.message,
        errorCode: httpErr.code,
        targetUrl,
      },
    });

    throw httpErr;
  }

  const validation = validateExtractClaimsResponse(rawResponse, payload.content.length);

  if (!validation.valid) {
    const schemaErr = Object.assign(
      new Error(`ML service response failed schema validation: ${validation.error}`),
      { code: 'ML_SCHEMA_INVALID' }
    );

    console.error(`[mlOrchestrator] Schema validation failed: ${validation.error}`);
    console.error(
      '[mlOrchestrator] Raw response snippet:',
      JSON.stringify(rawResponse).slice(0, 500)
    );

    await logEventSafe({
      orgId,
      actor,
      eventType: AUDIT_EVENTS.ML_RESPONSE_DISCARDED,
      entityType: 'draft',
      entityId: draftId,
      metadata: {
        reason: validation.error,
        errorCode: 'ML_SCHEMA_INVALID',
        rawResponseSnippet: JSON.stringify(rawResponse).slice(0, 500),
        targetUrl,
      },
    });

    throw schemaErr;
  }

  const { claims } = rawResponse;
  console.log(`[mlOrchestrator] ${claims.length} validated claim(s) received for org=${orgId}`);

  return claims;
}

module.exports = {
  indexSource,
  updateSourceMetadata,
  extractClaims,
  rewriteClaim,
  extractExactRuleFindings,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RULE_REWORDINGS,
  ML_RESPONSE_TYPES,
  validateExtractClaimsResponse,
  validateFactCheckResponse,
  validateSummariseResponse,
  validateClassifyResponse,
  validateIndexResponse,
  validateSourceIndexResponse,
  validateSimilarityResponse,
  validateRewriteResponse,
  validateClaim,
  validateClassLabel,
  validateSimilarityMatch,
  validateMlResponse,
  discardIfInvalid,
  ML_VALIDATORS,
};
