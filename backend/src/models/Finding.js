/**
 * Finding.js — Compliance Finding Mongoose model.
 *
 * Implements the Finding entity from OpenAPI spec (Section: Findings) and SDD:
 * A Finding is a single compliance issue or question surfaced by the ML pipeline
 * for a specific span of text within a DraftVersion.
 *
 * Lifecycle: open → accepted | edited | dismissed | escalated
 *
 * Multi-tenancy: all queries are scoped by orgId (enforced at the router level).
 */

'use strict';

const mongoose = require('mongoose');

// Enum constants (exported for use in routes / orchestrator)
const FINDING_TYPES = ['violation', 'question'];
const FINDING_STATUSES = ['open', 'accepted', 'edited', 'dismissed', 'escalated'];
const FINDING_VERDICTS = ['Supported', 'Contradicted', 'Outdated', 'Not Found', 'Unclear'];

// Sub-document schemas

const meaningCheckSchema = new mongoose.Schema(
  {
    /** mustSay phrases that are still present in the rewrite */
    kept: {
      type: [String],
      default: [],
    },
    /** Phrases that changed meaning between original and suggested fix */
    changed: {
      type: [String],
      default: [],
    },
    /** mustSay phrases that were dropped from the rewrite */
    dropped: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    passageId: { type: String, trim: true },
    sourceId: { type: String, trim: true },
    fileName: { type: String, trim: true },
    page: Number,
    version: { type: String, trim: true },
    expiryDate: Date,
    ownerName: { type: String, trim: true },
    passage: { type: String, trim: true },
  },
  { _id: false }
);

// Main finding schema

const findingSchema = new mongoose.Schema(
  {
    /** Owning organisation — enforces tenant isolation */
    orgId: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Org',
      required : true,
      index    : true,
    },

    /** Parent draft container */
    draftId: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Draft',
      required : true,
      index    : true,
    },

    /** Specific draft version this finding was generated against */
    draftVersionId: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'DraftVersion',
      required : true,
      index    : true,
    },

    /**
     * Character offset span within the draft version content string.
     *   start : inclusive start index
     *   end   : exclusive end index (compatible with JS String.slice)
     */
    span: {
      start: {
        type     : Number,
        required : true,
        min      : 0,
      },
      end: {
        type     : Number,
        required : true,
        min      : 0,
      },
    },

    /** Original text snippet from the draft corresponding to span */
    draftSpan: {
      type    : String,
      default : null,
      trim    : true,
    },

    /**
     * Finding category:
     *   'violation' — a concrete breach (contradicted claim, outdated fact, etc.)
     *   'question'  — a flagged ambiguity or request for human judgement
     */
    type: {
      type     : String,
      enum     : FINDING_TYPES,
      required : true,
      index    : true,
    },

    /**
     * ML model verdict for this span:
     *   Supported | Contradicted | Outdated | Not Found | Unclear
     */
    verdict: {
      type     : String,
      enum     : FINDING_VERDICTS,
      required : true,
      index    : true,
    },

    /**
     * Model confidence score for this verdict.
     * Float in [0, 1].  Persisted at full precision.
     */
    confidence: {
      type     : Number,
      required : true,
      min      : 0,
      max      : 1,
    },

    /**
     * Optional reference to the source passage that supports / contradicts the claim.
     * Populated by the ML pipeline; null when no source evidence is available.
     */
    proofPassageId: {
      type    : mongoose.Schema.Types.ObjectId,
      ref     : 'Source',
      default : null,
    },

    /**
     * ML-generated corrected phrasing.
     * null when not applicable (e.g. for 'Supported' verdicts).
     */
    suggestedFix: {
      type    : String,
      default : null,
      trim    : true,
    },

    /**
     * Semantic meaning-preservation check.
     * Documents which mustSay phrases were kept, changed, or dropped
     * in the suggestedFix relative to the original draft intent.
     */
    meaningCheck: {
      type    : meaningCheckSchema,
      default : null,
    },

    /** Explanation and evidence snapshot returned by the deterministic ML pipeline. */
    explanation: {
      type    : String,
      default : null,
      trim    : true,
    },
    evidence: {
      type    : evidenceSchema,
      default : null,
    },

    /**
     * Stable rule identifier that triggered this finding.
     * e.g. "rule.superlative.unqualified" or "rule.date.expired"
     */
    ruleId: {
      type    : String,
      default : null,
      trim    : true,
      index   : true,
    },

    /**
     * Human review status:
     *   open       → newly created, awaiting reviewer action
     *   accepted   → reviewer accepted the finding as-is
     *   edited     → reviewer applied a manual edit
     *   dismissed  → reviewer dismissed (with required rationale)
     *   escalated  → routed to senior reviewer or legal
     */
    status: {
      type    : String,
      enum    : FINDING_STATUSES,
      default : 'open',
      index   : true,
    },
  },
  {
    timestamps : true,        // createdAt, updatedAt
    collection : 'findings',
  }
);

// Compound indexes for tenant-scoped queries
findingSchema.index({ orgId: 1, draftId: 1 });
findingSchema.index({ orgId: 1, draftVersionId: 1 });
findingSchema.index({ orgId: 1, status: 1 });
findingSchema.index({ orgId: 1, verdict: 1 });
findingSchema.index({ orgId: 1, createdAt: -1 });

const Finding = mongoose.model('Finding', findingSchema);

Finding.FINDING_TYPES    = FINDING_TYPES;
Finding.FINDING_STATUSES = FINDING_STATUSES;
Finding.FINDING_VERDICTS = FINDING_VERDICTS;

module.exports = Finding;
