'use strict';

const Org = require('../models/Org');

function inferFormat(req, content) {
  if (req.file) {
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (ext === 'docx') return 'docx';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    return 'text';
  }
  const bodyFormat = req.body?.format;
  if (typeof bodyFormat === 'string' && ['markdown', 'text', 'html', 'pdf', 'docx'].includes(bodyFormat.toLowerCase())) {
    return bodyFormat.toLowerCase();
  }
  return 'text';
}

function parseAndValidateIntent(body) {
  if (!body) {
    return { valid: false, error: 'Request body is missing.' };
  }

  let rawIntent = body.intent;

  if (typeof rawIntent === 'string') {
    try {
      rawIntent = JSON.parse(rawIntent);
    } catch (_err) {
      return {
        valid: false,
        error: 'Intent must be a valid JSON object or JSON-encoded string.',
      };
    }
  }

  let purpose = '';
  let audience = '';
  let mustSay = [];

  if (rawIntent && typeof rawIntent === 'object' && !Array.isArray(rawIntent)) {
    purpose = typeof rawIntent.purpose === 'string' ? rawIntent.purpose.trim() : '';
    audience = typeof rawIntent.audience === 'string' ? rawIntent.audience.trim() : '';

    if (Array.isArray(rawIntent.mustSay)) {
      mustSay = rawIntent.mustSay
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    } else if (typeof rawIntent.mustSay === 'string') {
      mustSay = rawIntent.mustSay
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else {
    purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
    audience = typeof body.audience === 'string' ? body.audience.trim() : '';

    if (Array.isArray(body.mustSay)) {
      mustSay = body.mustSay
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    } else if (typeof body.mustSay === 'string') {
      mustSay = body.mustSay
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  if (!purpose) {
    return {
      valid: false,
      error: 'Intent purpose is required and cannot be empty.',
    };
  }

  if (!audience) {
    return {
      valid: false,
      error: 'Intent audience is required and cannot be empty.',
    };
  }

  return {
    valid: true,
    intent: { purpose, audience, mustSay },
  };
}

function summariseVerdicts(findings) {
  return findings.reduce((acc, f) => {
    const v = f.verdict || 'Unknown';
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function mapCommentType(action) {
  if (action === 'approve') return 'approved';
  if (action === 'request-changes') return 'changes-requested';
  return action;
}

async function resolveRulesOnly(req, orgId) {
  let isRulesOnly = Boolean(
    req.org?.settings?.rules_only ||
    req.org?.rules_only ||
    req.body?.rulesOnly
  );

  if (!isRulesOnly && orgId) {
    try {
      const orgDoc = await Org.findById(orgId).select('settings').lean();
      if (orgDoc?.settings?.rules_only) {
        isRulesOnly = true;
      }
    } catch (err) {
      // Safe to ignore if orgDoc lookup fails; fall back to isRulesOnly boolean
      if (process.env.NODE_ENV === 'development') {
        console.debug('[drafts] Optional rules_only lookup failed:', err.message);
      }
    }
  }

  return isRulesOnly;
}

module.exports = {
  inferFormat,
  parseAndValidateIntent,
  summariseVerdicts,
  mapCommentType,
  resolveRulesOnly,
};
