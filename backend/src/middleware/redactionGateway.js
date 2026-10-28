
const mongoose = require('mongoose');
const Org = require('../models/Org');

/**
 * Escapes special regex characters in a search term.
 *
 * @param {string} string
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces all occurrences of watchlist terms with '[REDACTED]' in a content copy.
 * Evaluates longer terms first to prevent partial word or sub-phrase truncation.
 *
 * @param {string} content - Raw input text
 * @param {Array<string>} [watchlist=[]] - Array of confidential/embargoed terms
 * @returns {{
 *   original: string,
 *   redactedContent: string,
 *   redactions: Array<{ term: string, count: number }>,
 *   totalReplacements: number,
 *   hasRedactions: boolean
 * }}
 */
function redactContent(content, watchlist = []) {
  if (typeof content !== 'string') {
    content = content ? String(content) : '';
  }

  if (!Array.isArray(watchlist) || watchlist.length === 0 || !content) {
    return {
      original: content,
      redactedContent: content,
      redactions: [],
      totalReplacements: 0,
      hasRedactions: false,
    };
  }

  // Filter out empty or non-string terms, trim whitespace
  const cleanTerms = watchlist
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter((term) => term.length > 0);

  // Sort terms by descending length so "Project Nova" matches before "Nova"
  cleanTerms.sort((a, b) => b.length - a.length);

  let redactedContent = content;
  const redactions = [];
  let totalReplacements = 0;

  for (const term of cleanTerms) {
    const escaped = escapeRegExp(term);

    // If term consists of word characters, apply word boundaries to avoid matching substrings in unrelated words
    const isWordTerm = /^[\w\s-]+$/u.test(term);
    const pattern = isWordTerm
      ? `\\b${escaped}\\b`
      : escaped;

    const regex = new RegExp(pattern, 'gi');
    const matches = redactedContent.match(regex);

    if (matches && matches.length > 0) {
      const count = matches.length;
      redactedContent = redactedContent.replace(regex, '[REDACTED]');
      redactions.push({ term, count });
      totalReplacements += count;
    }
  }

  return {
    original: content,
    redactedContent,
    redactions,
    totalReplacements,
    hasRedactions: totalReplacements > 0,
  };
}

/**
 * Loads the watchlist array for the specified organisation.
 * Uses populated `req.org` if available, or fetches from MongoDB.
 *
 * @param {string|mongoose.Types.ObjectId} orgId
 * @param {object} [cachedOrg] - Optional pre-loaded org document
 * @returns {Promise<Array<string>>}
 */
async function loadOrgWatchlist(orgId, cachedOrg = null) {
  if (cachedOrg && Array.isArray(cachedOrg.watchlist)) {
    return cachedOrg.watchlist;
  }

  if (!orgId) {
    return [];
  }

  try {
    const org = await Org.findById(orgId).select('watchlist').lean();
    return (org && Array.isArray(org.watchlist)) ? org.watchlist : [];
  } catch (err) {
    console.error(`[redactionGateway] Failed to load watchlist for org ${orgId}:`, err.message);
    return [];
  }
}


async function redactionGateway(req, res, next) {
  try {
    const orgId = req.org?._id || req.orgId || req.user?.orgId;

    // Load org watchlist
    const watchlist = await loadOrgWatchlist(orgId, req.org);
    req.watchlist = watchlist;

    // Determine content to redact (inspect body.content, draftContent, or plain-text file buffer)
    let rawContent = req.body?.content || req.draftContent || '';

    if (!rawContent && req.file && Buffer.isBuffer(req.file.buffer)) {
      const mimetype = req.file.mimetype || '';
      const originalname = (req.file.originalname || '').toLowerCase();
      if (
        mimetype.startsWith('text/') ||
        originalname.endsWith('.txt') ||
        originalname.endsWith('.md') ||
        originalname.endsWith('.markdown')
      ) {
        rawContent = req.file.buffer.toString('utf-8');
      }
    }

    const result = redactContent(rawContent, watchlist);

    if (result.hasRedactions) {
      console.log(
        `[redactionGateway] Org ${orgId || 'unknown'}: Redacted ${result.totalReplacements} confidential term match(es): ` +
        result.redactions.map((r) => `"${r.term}" (${r.count})`).join(', ')
      );
    }

    // Attach redaction copy and metadata to request
    req.redactedContent = result.redactedContent;
    req.redactions = result.redactions;
    req.hasRedactions = result.hasRedactions;

    if (req.body && typeof req.body === 'object') {
      req.body.redactedContent = result.redactedContent;
      req.body.redactions = result.redactions;
    }

    return next();
  } catch (err) {
    console.error('[redactionGateway] Middleware error:', err);
    return next(err);
  }
}

module.exports = {
  redactionGateway,
  redactContent,
  loadOrgWatchlist,
  escapeRegExp,
};
