'use strict';

const { logEventSafe, AUDIT_EVENTS } = require('../auditLogger');

const VALID_VERDICTS = new Set(['Supported', 'Contradicted', 'Outdated', 'Not Found', 'Unclear']);
const VALID_FINDING_TYPES = new Set(['violation', 'question']);
const VALID_INDEX_STATUSES = new Set(['queued', 'processing', 'indexed', 'failed']);

const ML_RESPONSE_TYPES = {
  EXTRACT_CLAIMS: 'extract-claims',
  FACT_CHECK: 'fact-check',
  SUMMARISE: 'summarise',
  CLASSIFY: 'classify',
  INDEX_PASSAGE: 'index-passage',
  SIMILARITY: 'similarity',
  REWRITE: 'rewrite',
};

function checkUnitInterval(value, fieldName) {
  if (typeof value !== 'number' || isNaN(value)) {
    return `${fieldName} must be a number`;
  }
  if (value < 0 || value > 1) {
    return `${fieldName} must be between 0 and 1, got ${value}`;
  }
  return null;
}

function validateClaim(claim, index, contentLength = null) {
  const prefix = `claims[${index}]`;

  if (!claim || typeof claim !== 'object') {
    return { valid: false, error: `${prefix}: must be an object` };
  }

  if (!claim.span || typeof claim.span !== 'object') {
    return { valid: false, error: `${prefix}.span: required object with start/end` };
  }
  if (typeof claim.span.start !== 'number' || typeof claim.span.end !== 'number') {
    return { valid: false, error: `${prefix}.span.start and .end must be numbers` };
  }
  if (claim.span.start < 0 || claim.span.end < claim.span.start) {
    return { valid: false, error: `${prefix}.span: start must be >= 0 and end >= start` };
  }
  if (contentLength !== null && claim.span.end > contentLength) {
    return {
      valid: false,
      error: `${prefix}.span: end must not exceed submitted content length ${contentLength}`,
    };
  }

  if (!VALID_FINDING_TYPES.has(claim.type)) {
    return {
      valid: false,
      error: `${prefix}.type: must be one of [${[...VALID_FINDING_TYPES].join(', ')}], got "${claim.type}"`,
    };
  }

  if (!VALID_VERDICTS.has(claim.verdict)) {
    return {
      valid: false,
      error: `${prefix}.verdict: must be one of [${[...VALID_VERDICTS].join(', ')}], got "${claim.verdict}"`,
    };
  }

  const confidenceErr = checkUnitInterval(claim.confidence, `${prefix}.confidence`);
  if (confidenceErr) {
    return { valid: false, error: confidenceErr };
  }

  if (claim.suggestedFix !== undefined && typeof claim.suggestedFix !== 'string') {
    return { valid: false, error: `${prefix}.suggestedFix: must be a string if provided` };
  }

  if (claim.ruleId !== undefined && typeof claim.ruleId !== 'string') {
    return { valid: false, error: `${prefix}.ruleId: must be a string if provided` };
  }

  if (claim.meaningCheck !== undefined) {
    const mc = claim.meaningCheck;
    if (typeof mc !== 'object' || mc === null) {
      return { valid: false, error: `${prefix}.meaningCheck: must be an object if provided` };
    }
    for (const field of ['kept', 'changed', 'dropped']) {
      if (mc[field] !== undefined && !Array.isArray(mc[field])) {
        return { valid: false, error: `${prefix}.meaningCheck.${field}: must be an array if provided` };
      }
    }
  }

  return { valid: true };
}

function validateExtractClaimsResponse(body, contentLength = null) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Response body must be a JSON object' };
  }

  if (!Array.isArray(body.claims)) {
    return { valid: false, error: 'Response must contain a "claims" array' };
  }

  for (let i = 0; i < body.claims.length; i++) {
    const result = validateClaim(body.claims[i], i, contentLength);
    if (!result.valid) return result;
  }

  return { valid: true };
}

function validateFactCheckResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'fact-check response body must be a JSON object' };
  }

  if (!VALID_VERDICTS.has(body.verdict)) {
    return {
      valid: false,
      error: `fact-check response: verdict must be one of [${[...VALID_VERDICTS].join(', ')}], got "${body.verdict}"`,
    };
  }

  const confidenceErr = checkUnitInterval(body.confidence, 'fact-check response: confidence');
  if (confidenceErr) {
    return { valid: false, error: confidenceErr };
  }

  if (body.evidence !== undefined && typeof body.evidence !== 'string') {
    return { valid: false, error: 'fact-check response: evidence must be a string if provided' };
  }

  if (body.explanation !== undefined && typeof body.explanation !== 'string') {
    return { valid: false, error: 'fact-check response: explanation must be a string if provided' };
  }

  return { valid: true };
}

function validateSummariseResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'summarise response body must be a JSON object' };
  }

  if (typeof body.summary !== 'string' || !body.summary.trim()) {
    return { valid: false, error: 'summarise response: summary must be a non-empty string' };
  }

  if (body.tokenCount !== undefined) {
    if (typeof body.tokenCount !== 'number' || !Number.isInteger(body.tokenCount) || body.tokenCount < 0) {
      return {
        valid: false,
        error: 'summarise response: tokenCount must be a non-negative integer if provided',
      };
    }
  }

  return { valid: true };
}

function validateClassLabel(item, index) {
  const prefix = `labels[${index}]`;

  if (!item || typeof item !== 'object') {
    return { valid: false, error: `${prefix}: must be an object` };
  }
  if (typeof item.label !== 'string' || !item.label.trim()) {
    return { valid: false, error: `${prefix}.label: must be a non-empty string` };
  }
  const scoreErr = checkUnitInterval(item.score, `${prefix}.score`);
  if (scoreErr) {
    return { valid: false, error: scoreErr };
  }

  return { valid: true };
}

function validateClassifyResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'classify response body must be a JSON object' };
  }

  if (!Array.isArray(body.labels) || body.labels.length === 0) {
    return { valid: false, error: 'classify response: labels must be a non-empty array' };
  }

  for (let i = 0; i < body.labels.length; i++) {
    const result = validateClassLabel(body.labels[i], i);
    if (!result.valid) return result;
  }

  if (typeof body.topLabel !== 'string' || !body.topLabel.trim()) {
    return { valid: false, error: 'classify response: topLabel must be a non-empty string' };
  }

  const labelStrings = body.labels.map((l) => l.label);
  if (!labelStrings.includes(body.topLabel)) {
    return {
      valid: false,
      error: `classify response: topLabel "${body.topLabel}" does not appear in labels array`,
    };
  }

  const scoreErr = checkUnitInterval(body.topScore, 'classify response: topScore');
  if (scoreErr) {
    return { valid: false, error: scoreErr };
  }

  return { valid: true };
}

function validateIndexResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'index-passage response body must be a JSON object' };
  }

  if (typeof body.passageId !== 'string' || !body.passageId.trim()) {
    return { valid: false, error: 'index-passage response: passageId must be a non-empty string' };
  }

  if (!VALID_INDEX_STATUSES.has(body.status)) {
    return {
      valid: false,
      error: `index-passage response: status must be one of [${[...VALID_INDEX_STATUSES].join(', ')}], got "${body.status}"`,
    };
  }

  if (body.indexed !== undefined && typeof body.indexed !== 'boolean') {
    return { valid: false, error: 'index-passage response: indexed must be a boolean if provided' };
  }

  return { valid: true };
}

function validateSourceIndexResponse(body, expectedSourceId, expectedOrgId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'index-source response body must be a JSON object' };
  }
  if (body.indexed !== true || body.status !== 'indexed') {
    return { valid: false, error: 'index-source response must confirm indexed status' };
  }
  if (String(body.sourceId) !== String(expectedSourceId)) {
    return { valid: false, error: 'index-source response sourceId does not match request' };
  }
  if (String(body.orgId) !== String(expectedOrgId)) {
    return { valid: false, error: 'index-source response orgId does not match request' };
  }
  if (!Number.isInteger(body.passageCount) || body.passageCount < 0) {
    return { valid: false, error: 'index-source response passageCount must be a non-negative integer' };
  }
  return { valid: true };
}

function validateSimilarityMatch(item, index) {
  const prefix = `matches[${index}]`;

  if (!item || typeof item !== 'object') {
    return { valid: false, error: `${prefix}: must be an object` };
  }
  if (typeof item.passageId !== 'string' || !item.passageId.trim()) {
    return { valid: false, error: `${prefix}.passageId: must be a non-empty string` };
  }
  const scoreErr = checkUnitInterval(item.score, `${prefix}.score`);
  if (scoreErr) {
    return { valid: false, error: scoreErr };
  }
  if (item.snippet !== undefined && typeof item.snippet !== 'string') {
    return { valid: false, error: `${prefix}.snippet: must be a string if provided` };
  }

  return { valid: true };
}

function validateSimilarityResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'similarity response body must be a JSON object' };
  }

  const scoreErr = checkUnitInterval(body.score, 'similarity response: score');
  if (scoreErr) {
    return { valid: false, error: scoreErr };
  }

  if (body.matches !== undefined) {
    if (!Array.isArray(body.matches)) {
      return { valid: false, error: 'similarity response: matches must be an array if provided' };
    }
    for (let i = 0; i < body.matches.length; i++) {
      const result = validateSimilarityMatch(body.matches[i], i);
      if (!result.valid) return result;
    }
  }

  return { valid: true };
}

function validateRewriteResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'rewrite response body must be a JSON object' };
  }
  if (body.suggestedFix !== undefined && typeof body.suggestedFix !== 'string') {
    return { valid: false, error: 'suggestedFix must be a string' };
  }
  if (body.suggestedRewording !== undefined && typeof body.suggestedRewording !== 'string') {
    return { valid: false, error: 'suggestedRewording must be a string' };
  }
  return { valid: true };
}

const ML_VALIDATORS = {
  [ML_RESPONSE_TYPES.EXTRACT_CLAIMS]: validateExtractClaimsResponse,
  [ML_RESPONSE_TYPES.FACT_CHECK]: validateFactCheckResponse,
  [ML_RESPONSE_TYPES.SUMMARISE]: validateSummariseResponse,
  [ML_RESPONSE_TYPES.CLASSIFY]: validateClassifyResponse,
  [ML_RESPONSE_TYPES.INDEX_PASSAGE]: validateIndexResponse,
  [ML_RESPONSE_TYPES.SIMILARITY]: validateSimilarityResponse,
  [ML_RESPONSE_TYPES.REWRITE]: validateRewriteResponse,
};

function validateMlResponse(responseType, body) {
  const validator = ML_VALIDATORS[responseType];

  if (!validator) {
    return {
      valid: false,
      error: `Unknown ML response type "${responseType}". Register a validator in ML_VALIDATORS.`,
    };
  }

  return validator(body);
}

async function discardIfInvalid({
  responseType,
  rawResponse,
  targetUrl,
  orgId,
  actor = null,
  entityId = null,
  entityType = 'draft',
}) {
  const validation = validateMlResponse(responseType, rawResponse);

  if (validation.valid) return;

  const schemaErr = Object.assign(
    new Error(`ML response [${responseType}] failed schema validation: ${validation.error}`),
    { code: 'ML_SCHEMA_INVALID' }
  );

  console.error(`[mlOrchestrator] Schema validation failed [${responseType}]: ${validation.error}`);
  console.error(
    '[mlOrchestrator] Raw response snippet:',
    JSON.stringify(rawResponse).slice(0, 500)
  );

  await logEventSafe({
    orgId,
    actor,
    eventType: AUDIT_EVENTS.ML_RESPONSE_DISCARDED,
    entityType,
    entityId,
    metadata: {
      responseType,
      reason: validation.error,
      errorCode: 'ML_SCHEMA_INVALID',
      rawResponseSnippet: JSON.stringify(rawResponse).slice(0, 500),
      targetUrl,
    },
  });

  throw schemaErr;
}

module.exports = {
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
};
