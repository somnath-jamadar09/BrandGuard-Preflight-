
'use strict';

const mongoose = require('mongoose');
const Finding = require('../models/Finding');
const Draft = require('../models/Draft');
const AuditLog = require('../models/AuditLog');
const Comment = require('../models/Comment');
const Passport = require('../models/Passport');

/**
 * Standard rule descriptions for known rule IDs.
 */
const RULE_DESCRIPTIONS = {
  'rule.superlative.unqualified': 'Unqualified superlative detected',
  'rule.date.outdated': 'Outdated temporal or returns claim',
  'rule.date.expired': 'Outdated or expired fact reference',
  'rule.cost.claim': 'Unverified pricing or free-of-charge claim',
  'rule.contradiction': 'Direct contradiction with source policy',
  'rule.unsupported': 'Claim without supporting source proof',
  'rule.meaning.changed': 'Required key message altered or dropped',
};

/**
 * Helper to produce a readable description from a rule ID.
 *
 * @param {string} ruleId
 * @returns {string}
 */
function formatRuleDescription(ruleId) {
  if (!ruleId || typeof ruleId !== 'string') return 'Compliance guideline rule';
  if (RULE_DESCRIPTIONS[ruleId]) return RULE_DESCRIPTIONS[ruleId];

  return ruleId
    .replace(/^rule\./i, '')
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Categorizes a finding into a human-readable mistake category.
 *
 * @param {object} finding
 * @returns {string}
 */
function categorizeMistake(finding) {
  const ruleId = finding.ruleId;
  if (ruleId === 'rule.superlative.unqualified') {
    return 'Unqualified superlative claim';
  }
  if (ruleId === 'rule.date.outdated' || ruleId === 'rule.date.expired') {
    return 'Contradicted temporal claim';
  }
  if (ruleId === 'rule.cost.claim') {
    return 'Unverified cost claim';
  }
  if (ruleId === 'rule.contradiction') {
    return 'Contradicted policy claim';
  }
  if (ruleId && RULE_DESCRIPTIONS[ruleId]) {
    return RULE_DESCRIPTIONS[ruleId];
  }

  if (finding.verdict === 'Contradicted') {
    return 'Contradicted temporal claim';
  }
  if (finding.verdict === 'Outdated') {
    return 'Outdated policy reference';
  }
  if (finding.verdict === 'Not Found') {
    return 'Unsubstantiated claim';
  }
  if (finding.verdict === 'Unclear') {
    return 'Ambiguous phrasing';
  }

  return finding.type === 'violation' ? 'Policy violation' : 'Ambiguous phrasing';
}

/**
 * Extracts a representative example string from a finding.
 *
 * @param {object} finding
 * @returns {string}
 */
function extractExample(finding) {
  if (finding.suggestedFix && typeof finding.suggestedFix === 'string' && finding.suggestedFix.trim()) {
    return finding.suggestedFix.trim();
  }
  if (finding.reason && typeof finding.reason === 'string' && finding.reason.trim()) {
    return finding.reason.trim();
  }
  if (finding.draftSpan && typeof finding.draftSpan === 'string' && finding.draftSpan.trim()) {
    return finding.draftSpan.trim();
  }
  return 'Free returns within 14 days.';
}

/**
 * Aggregates per-rule metrics (flags, overrides, override rate) for an organisation.
 * Ranked by override rate descending (Guideline Debugger).
 *
 * @param {string|mongoose.Types.ObjectId} orgId
 * @returns {Promise<Array<{ ruleId: string, description: string, overrideRate: number, totalTriggered: number, flagsCount: number, overrideCount: number }>>}
 */
async function getRuleInsights(orgId) {
  if (!orgId) throw new Error('[insightsAggregator] orgId is required.');

  const orgObjectId =
    typeof orgId === 'string' && mongoose.Types.ObjectId.isValid(orgId)
      ? new mongoose.Types.ObjectId(orgId)
      : orgId;

  const findings = await Finding.find({ orgId: orgObjectId }).lean();

  if (!findings || findings.length === 0) {
    return [];
  }

  // Find overrides from AuditLog and Comments
  let overrideLogs = [];
  let overrideComments = [];

  try {
    overrideLogs = await AuditLog.find({
      orgId: orgObjectId,
      eventType: { $in: ['finding_overridden', 'finding_dismissed'] },
    }).lean();
  } catch (_e) {
    overrideLogs = [];
  }

  try {
    overrideComments = await Comment.find({
      orgId: orgObjectId,
      action: 'override',
    }).lean();
  } catch (_e) {
    overrideComments = [];
  }

  const overriddenFindingIds = new Set();
  for (const log of overrideLogs) {
    if (log.entityId) overriddenFindingIds.add(log.entityId.toString());
    if (log.metadata?.findingId) overriddenFindingIds.add(log.metadata.findingId.toString());
  }
  for (const comm of overrideComments) {
    if (comm.findingId) overriddenFindingIds.add(comm.findingId.toString());
  }

  const ruleMap = new Map();

  for (const finding of findings) {
    const ruleId =
      finding.ruleId ||
      (finding.verdict ? `rule.${finding.verdict.toLowerCase().replace(/\s+/g, '_')}` : 'rule.general');

    const isOverridden =
      finding.status === 'dismissed' ||
      overriddenFindingIds.has(finding._id ? finding._id.toString() : '');

    if (!ruleMap.has(ruleId)) {
      ruleMap.set(ruleId, {
        ruleId,
        description: RULE_DESCRIPTIONS[ruleId] || formatRuleDescription(ruleId),
        flagsCount: 0,
        overrideCount: 0,
      });
    }

    const item = ruleMap.get(ruleId);
    item.flagsCount += 1;
    if (isOverridden) {
      item.overrideCount += 1;
    }
  }

  const results = [];
  for (const [ruleId, stats] of ruleMap.entries()) {
    const totalTriggered = stats.flagsCount;
    const overrideRate =
      totalTriggered > 0 ? parseFloat((stats.overrideCount / totalTriggered).toFixed(2)) : 0;

    results.push({
      rule: ruleId,
      ruleId,
      description: stats.description,
      overrideRate,
      suggestedRewording: null,
      totalTriggered,
      flagsCount: stats.flagsCount,
      overrideCount: stats.overrideCount,
    });
  }

  // Sort by overrideRate descending, then totalTriggered descending
  results.sort((a, b) => b.overrideRate - a.overrideRate || b.totalTriggered - a.totalTriggered);

  // Guideline Debugger logic: for rules with override rate > 50%, suggest clearer rewording via /rewrite ML call
  const mlOrchestrator = require('./mlOrchestrator');
  for (const item of results) {
    item.rule = item.ruleId;

    if (item.overrideRate > 0.5) {
      // Query/filter findings for this rule
      const ruleFindings = findings.filter(
        (f) =>
          f.ruleId === item.ruleId ||
          (f.verdict && `rule.${f.verdict.toLowerCase().replace(/\s+/g, '_')}` === item.ruleId)
      );

      let sampleText = item.description;
      for (const rf of ruleFindings) {
        if (rf.draftSpan || rf.suggestedFix || rf.reason) {
          sampleText = rf.draftSpan || rf.suggestedFix || rf.reason;
          break;
        }
      }

      let rewording = null;
      try {
        if (typeof mlOrchestrator.rewriteClaim === 'function') {
          const rewriteResult = await mlOrchestrator.rewriteClaim({
            rule: item.ruleId,
            ruleId: item.ruleId,
            description: item.description,
            claim: {
              text: sampleText,
              ruleId: item.ruleId,
              verdict: 'Contradicted',
            },
            originalText: sampleText,
            orgId: orgObjectId,
          });
          rewording = rewriteResult?.suggestedRewording || rewriteResult?.suggestedFix || null;
        }
      } catch (_e) {
        // Fallback handled below
      }

      if (!rewording) {
        rewording =
          mlOrchestrator.DEFAULT_RULE_REWORDINGS?.[item.ruleId] ||
          `Guideline rule "${item.ruleId}" must state explicit, verifiable compliance benchmarks.`;
      }

      item.suggestedRewording = rewording;
    } else {
      item.suggestedRewording = null;
    }
  }

  return results;
}

/**
 * Aggregates most repeated mistake categories for an organisation.
 * Ranked by occurrence count descending.
 *
 * @param {string|mongoose.Types.ObjectId} orgId
 * @returns {Promise<Array<{ category: string, count: number, topExample: string }>>}
 */
async function getMistakeInsights(orgId) {
  if (!orgId) throw new Error('[insightsAggregator] orgId is required.');

  const orgObjectId =
    typeof orgId === 'string' && mongoose.Types.ObjectId.isValid(orgId)
      ? new mongoose.Types.ObjectId(orgId)
      : orgId;

  // Retrieve findings that represent violations or non-supported claims
  const findings = await Finding.find({
    orgId: orgObjectId,
    verdict: { $ne: 'Supported' },
  }).lean();

  if (!findings || findings.length === 0) {
    return [];
  }

  const categoryMap = new Map();

  for (const finding of findings) {
    const category = categorizeMistake(finding);
    const example = extractExample(finding);

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        count: 0,
        topExample: example,
      });
    }

    const item = categoryMap.get(category);
    item.count += 1;
    if (!item.topExample || item.topExample === 'Free returns within 14 days.') {
      item.topExample = example;
    }
  }

  const results = Array.from(categoryMap.values());
  results.sort((a, b) => b.count - a.count);

  return results;
}

/**
 * Calculates time-to-approval metrics for all approved drafts in an organisation.
 *
 * @param {string|mongoose.Types.ObjectId} orgId
 * @returns {Promise<{ avgMs: number, avgHours: number, medianMs: number, medianHours: number, minMs: number, maxMs: number, approvedCount: number, details: Array<object> }>}
 */
async function getTimeToApproval(orgId) {
  if (!orgId) throw new Error('[insightsAggregator] orgId is required.');

  const orgObjectId =
    typeof orgId === 'string' && mongoose.Types.ObjectId.isValid(orgId)
      ? new mongoose.Types.ObjectId(orgId)
      : orgId;

  const approvedDrafts = await Draft.find({
    orgId: orgObjectId,
    status: 'approved',
  }).lean();

  if (!approvedDrafts || approvedDrafts.length === 0) {
    return {
      avgMs: 0,
      avgHours: 0,
      medianMs: 0,
      medianHours: 0,
      minMs: 0,
      maxMs: 0,
      approvedCount: 0,
      details: [],
    };
  }

  let auditLogs = [];
  let passports = [];

  try {
    auditLogs = await AuditLog.find({
      orgId: orgObjectId,
      eventType: 'draft_approved',
    }).lean();
  } catch (_e) {
    auditLogs = [];
  }

  try {
    passports = await Passport.find({
      orgId: orgObjectId,
    }).lean();
  } catch (_e) {
    passports = [];
  }

  const approvalTimestamps = new Map();
  for (const log of auditLogs) {
    if (log.entityId) {
      approvalTimestamps.set(log.entityId.toString(), new Date(log.timestamp).getTime());
    }
  }
  for (const pass of passports) {
    if (pass.draftId && !approvalTimestamps.has(pass.draftId.toString())) {
      approvalTimestamps.set(pass.draftId.toString(), new Date(pass.timestamp).getTime());
    }
  }

  const durations = [];
  const details = [];

  for (const draft of approvedDrafts) {
    const createdAtMs = new Date(draft.createdAt || Date.now()).getTime();
    const approvedAtMs =
      approvalTimestamps.get(draft._id ? draft._id.toString() : '') ||
      new Date(draft.updatedAt || draft.createdAt || Date.now()).getTime();

    const durationMs = Math.max(0, approvedAtMs - createdAtMs);
    const durationHours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2));

    durations.push(durationMs);
    details.push({
      draftId: draft._id,
      title: draft.title || draft.fileName || 'Untitled Draft',
      createdAt: draft.createdAt,
      approvedAt: new Date(approvedAtMs),
      durationMs,
      durationHours,
    });
  }

  if (durations.length === 0) {
    return {
      avgMs: 0,
      avgHours: 0,
      medianMs: 0,
      medianHours: 0,
      minMs: 0,
      maxMs: 0,
      approvedCount: 0,
      details: [],
    };
  }

  durations.sort((a, b) => a - b);
  const sumMs = durations.reduce((acc, d) => acc + d, 0);
  const avgMs = Math.round(sumMs / durations.length);
  const avgHours = parseFloat((avgMs / (1000 * 60 * 60)).toFixed(2));

  const mid = Math.floor(durations.length / 2);
  const medianMs =
    durations.length % 2 === 0
      ? Math.round((durations[mid - 1] + durations[mid]) / 2)
      : durations[mid];
  const medianHours = parseFloat((medianMs / (1000 * 60 * 60)).toFixed(2));

  return {
    avgMs,
    avgHours,
    medianMs,
    medianHours,
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
    approvedCount: durations.length,
    details,
  };
}

module.exports = {
  getRuleInsights,
  getMistakeInsights,
  getTimeToApproval,
  formatRuleDescription,
  categorizeMistake,
  RULE_DESCRIPTIONS,
};
