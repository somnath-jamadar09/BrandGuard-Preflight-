
'use strict';

const mongoose = require('mongoose');
const Draft = require('../models/Draft');
const DraftVersion = require('../models/DraftVersion');
const Finding = require('../models/Finding');
const { sha256 } = require('../utils/hash');
const { logEventSafe, AUDIT_EVENTS } = require('./auditLogger');

/**
 * Computes a line-by-line diff between two strings using Longest Common Subsequence (LCS).
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {Array<{ type: 'unchanged' | 'added' | 'removed', text: string }>}
 */
function computeLineDiff(oldText = '', newText = '') {
  const s1 = String(oldText || '').split(/\r?\n/);
  const s2 = String(newText || '').split(/\r?\n/);

  const n = s1.length;
  const m = s2.length;

  // Build LCS dynamic programming matrix
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (s1[i] === s2[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to assemble edit steps
  const result = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && s1[i - 1] === s2[j - 1]) {
      result.push({ type: 'unchanged', text: s1[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', text: s2[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.push({ type: 'removed', text: s1[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Computes a unified diff string between two text revisions.
 *
 * @param {string} oldText - Text of the baseline version
 * @param {string} newText - Text of the updated version
 * @param {object} [options]
 * @param {number|string} [options.oldVersion='old']
 * @param {number|string} [options.newVersion='new']
 * @returns {string} Unified diff string, or empty string if texts are identical
 */
function computeTextDiff(oldText = '', newText = '', options = {}) {
  if (oldText === newText) {
    return '';
  }

  const oldVer = options.oldVersion !== undefined ? options.oldVersion : 'old';
  const newVer = options.newVersion !== undefined ? options.newVersion : 'new';

  const lineDiff = computeLineDiff(oldText, newText);
  const hasModifications = lineDiff.some((l) => l.type === 'added' || l.type === 'removed');

  if (!hasModifications) {
    return '';
  }

  const header = [
    `--- v${oldVer}`,
    `+++ v${newVer}`,
  ];

  const body = lineDiff.map((line) => {
    if (line.type === 'added') return `+${line.text}`;
    if (line.type === 'removed') return `-${line.text}`;
    return ` ${line.text}`;
  });

  return [...header, ...body].join('\n');
}

/**
 * Creates and persists a new DraftVersion on an accepted fix.
 *
 * Steps:
 *   1. Resolve parent Draft and latest DraftVersion.
 *   2. Increment version number (v1 -> v2, etc.).
 *   3. Compute new text content by applying the fix or suggested rewrite.
 *   4. Generate cryptographic SHA-256 contentHash of the updated content.
 *   5. Compute unified text diff against the previous version.
 *   6. Persist new DraftVersion and update Draft.currentVersion.
 *   7. Emit AuditLog event ('version_created').
 *
 * @param {object} params
 * @param {object} [params.finding] - Finding being accepted
 * @param {mongoose.Types.ObjectId|string} [params.findingId] - ID of finding
 * @param {mongoose.Types.ObjectId|string} [params.draftId] - Draft ID
 * @param {mongoose.Types.ObjectId|string} [params.orgId] - Organisation tenant ID
 * @param {object|mongoose.Types.ObjectId|string} [params.actor] - User authorising the fix
 * @param {string} [params.suggestedFix] - Override suggested fix string
 * @param {string} [params.newContent] - Explicit new draft content (if already pre-assembled)
 * @param {string} [params.diff] - Precomputed diff if available
 * @returns {Promise<{ draftVersion: object, version: object, draft: object, diff: string, contentHash: string, versionNumber: number }>}
 */
async function createDraftVersionOnAcceptedFix(params) {
  if (!params || typeof params !== 'object') {
    throw new Error('[versionManager] params object is required.');
  }

  let {
    finding,
    findingId,
    draftId,
    orgId,
    actor,
    suggestedFix,
    newContent,
    diff,
  } = params;

  // Resolve finding if findingId was passed
  if (!finding && findingId) {
    const findingQuery = { _id: findingId };
    if (orgId) findingQuery.orgId = orgId;
    finding = await Finding.findOne(findingQuery);
  }

  if (finding) {
    if (!draftId) draftId = finding.draftId;
    if (!orgId) orgId = finding.orgId;
  }

  if (!draftId) {
    throw new Error('[versionManager] draftId is required.');
  }
  if (!orgId) {
    throw new Error('[versionManager] orgId is required.');
  }

  // Load parent draft
  const draft = await Draft.findOne({ _id: draftId, orgId });
  if (!draft) {
    throw new Error(`[versionManager] Draft "${draftId}" was not found in organisation "${orgId}".`);
  }

  // Retrieve current latest DraftVersion
  const latestVersion = await DraftVersion.findOne({ draftId, orgId })
    .sort({ versionNumber: -1 });

  const currentVersionNum = latestVersion ? latestVersion.versionNumber : (draft.currentVersion || 1);
  const nextVersionNum = currentVersionNum + 1;
  const previousContent = latestVersion ? (latestVersion.content || '') : '';

  // Determine updated content text
  let updatedContent = previousContent;

  if (newContent !== undefined && newContent !== null) {
    updatedContent = String(newContent);
  } else if (finding) {
    const fixText = suggestedFix !== undefined ? String(suggestedFix) : (finding.suggestedFix || '');
    const span = finding.span;

    if (
      span &&
      typeof span.start === 'number' &&
      typeof span.end === 'number' &&
      span.start >= 0 &&
      span.end >= span.start &&
      span.start <= previousContent.length
    ) {
      const start = span.start;
      const end = Math.min(span.end, previousContent.length);
      updatedContent = previousContent.slice(0, start) + fixText + previousContent.slice(end);
    } else if (fixText) {
      // If span is missing or invalid, replace matching text or append
      const originalSnippet = span && typeof span.start === 'number'
        ? previousContent.slice(span.start, span.end)
        : (finding.draftSpan || '');

      if (originalSnippet && previousContent.includes(originalSnippet)) {
        updatedContent = previousContent.replace(originalSnippet, fixText);
      } else if (finding.draftSpan && previousContent.includes(finding.draftSpan)) {
        updatedContent = previousContent.replace(finding.draftSpan, fixText);
      } else {
        updatedContent = previousContent ? `${previousContent}\n${fixText}` : fixText;
      }
    }
  } else if (suggestedFix !== undefined) {
    updatedContent = String(suggestedFix);
  }

  // Compute cryptographic SHA-256 hash of the updated content
  const contentHash = sha256(updatedContent);

  // Compute unified text diff against previous content
  const textDiff = diff !== undefined
    ? (typeof diff === 'string' ? diff : JSON.stringify(diff))
    : computeTextDiff(previousContent, updatedContent, {
        oldVersion: currentVersionNum,
        newVersion: nextVersionNum,
      });

  // Persist new DraftVersion
  const actorId = actor?._id || (mongoose.Types.ObjectId.isValid(actor) ? actor : null);
  const newDraftVersion = new DraftVersion({
    draftId,
    orgId,
    versionNumber: nextVersionNum,
    content: updatedContent,
    contentHash,
    diff: textDiff,
    author: actorId,
    createdAt: new Date(),
  });
  await newDraftVersion.save();

  // Update Draft document with new version counter
  draft.currentVersion = nextVersionNum;
  draft.updatedAt = new Date();
  await draft.save();

  // Write immutable AuditLog event
  await logEventSafe({
    orgId,
    actor,
    eventType: AUDIT_EVENTS.VERSION_CREATED || 'version_created',
    entityType: 'draft_version',
    entityId: newDraftVersion._id,
    metadata: {
      draftId,
      versionNumber: nextVersionNum,
      contentHash,
      findingId: finding?._id || findingId || null,
    },
  });

  return {
    draftVersion: newDraftVersion,
    version: newDraftVersion,
    draft,
    diff: textDiff,
    contentHash,
    versionNumber: nextVersionNum,
  };
}

/**
 * Lists all draft versions with diffs and cryptographic content hashes.
 *
 * @param {mongoose.Types.ObjectId|string} draftId
 * @param {mongoose.Types.ObjectId|string} orgId
 * @returns {Promise<Array<object>>}
 */
async function getVersions(draftId, orgId) {
  if (!draftId) throw new Error('[versionManager] draftId is required.');
  if (!orgId) throw new Error('[versionManager] orgId is required.');

  return DraftVersion.find({ draftId, orgId })
    .sort({ versionNumber: 1 })
    .lean();
}

module.exports = {
  computeLineDiff,
  computeTextDiff,
  createDraftVersionOnAcceptedFix,
  getVersions,
};
