'use strict';

const EXACT_SUPERLATIVE_RE = /\b(?:best|only|fastest|leading|number one|#1)\b[^.!?,;:\n]*?(?=\s+(?:for|with|and|to|of)\b|[.!?,;:\n]|$)/gi;
const EXACT_OUTDATED_RETURN_RE = /\b(?:within\s+)?14[-\s]days?(?:\s+of\s+(?:the\s+)?delivery(?:\s+date)?)?\b/gi;
const EXACT_COST_CLAIM_RE = /\b(?:free\s+returns?|zero\s+restocking|free\s+delivery|zero[\s-]cost|free\s+of\s+charge)\b/gi;

function escapeRegexStr(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function extractExactRuleFindings(content, options = {}) {
  const text = String(content || '');
  const findings = [];
  const bannedTerms = Array.isArray(options.bannedTerms) ? options.bannedTerms : [];

  let match;
  const supRegex = new RegExp(EXACT_SUPERLATIVE_RE.source, 'gi');
  while ((match = supRegex.exec(text)) !== null) {
    const spanText = match[0].trim();
    findings.push({
      span: { start: match.index, end: match.index + spanText.length },
      type: 'violation',
      verdict: 'Contradicted',
      confidence: 1.0,
      ruleId: 'rule.superlative.unqualified',
      explanation: 'An unqualified superlative is not permitted without substantiation.',
      suggestedFix: 'We offer a 30-day returns policy.',
      draftSpan: spanText,
      meaningCheck: { kept: [], changed: [], dropped: [] },
    });
  }

  const retRegex = new RegExp(EXACT_OUTDATED_RETURN_RE.source, 'gi');
  while ((match = retRegex.exec(text)) !== null) {
    const spanText = match[0].trim();
    findings.push({
      span: { start: match.index, end: match.index + spanText.length },
      type: 'violation',
      verdict: 'Outdated',
      confidence: 0.95,
      ruleId: 'rule.date.outdated',
      explanation: 'Prior policy documents referencing a 14-day window are superseded. The standard window is 30 days.',
      suggestedFix: 'Our 30-day return window applies to eligible items.',
      draftSpan: spanText,
      meaningCheck: { kept: [], changed: [], dropped: [] },
    });
  }

  const costRegex = new RegExp(EXACT_COST_CLAIM_RE.source, 'gi');
  while ((match = costRegex.exec(text)) !== null) {
    const spanText = match[0].trim();
    findings.push({
      span: { start: match.index, end: match.index + spanText.length },
      type: 'question',
      verdict: 'Not Found',
      confidence: 0.85,
      ruleId: 'rule.cost.claim',
      explanation: 'Unverified pricing or free-of-charge claim without supporting documentation.',
      suggestedFix: '',
      draftSpan: spanText,
      meaningCheck: { kept: [], changed: [], dropped: [] },
    });
  }

  for (const term of bannedTerms) {
    if (!term || typeof term !== 'string' || !term.trim()) continue;
    const termRegex = new RegExp(`\\b${escapeRegexStr(term.trim())}\\b`, 'gi');
    while ((match = termRegex.exec(text)) !== null) {
      const spanText = match[0].trim();
      findings.push({
        span: { start: match.index, end: match.index + spanText.length },
        type: 'violation',
        verdict: 'Contradicted',
        confidence: 1.0,
        ruleId: 'rule.banned-term',
        explanation: `Restricted or embargoed term "${term}" detected.`,
        suggestedFix: '',
        draftSpan: spanText,
        meaningCheck: { kept: [], changed: [], dropped: [] },
      });
    }
  }

  findings.sort((a, b) => a.span.start - b.span.start);
  return findings;
}

const DEFAULT_RULE_REWORDINGS = {
  'rule.superlative.unqualified':
    'Claims must avoid unverified superlatives ("best", "market leader"). State verified benchmark numbers or certified laboratory test data instead.',
  'rule.date.outdated':
    'Specify standard 30-day return window from physical delivery timestamp, referencing current Customer Terms v4.0.',
  'rule.cost.claim':
    'Free return phrasing is allowed only for domestic orders with original packaging intact.',
  'rule.contradiction':
    'Ensure product availability and returns eligibility match current published support guidelines.',
  'rule.unsupported':
    'Every factual claim must cite an approved active source document with matching passage proof.',
  'rule.meaning.changed':
    'Preserve mandatory approved brand terminology without altering core meaning.',
};

module.exports = {
  EXACT_SUPERLATIVE_RE,
  EXACT_OUTDATED_RETURN_RE,
  EXACT_COST_CLAIM_RE,
  extractExactRuleFindings,
  DEFAULT_RULE_REWORDINGS,
};
