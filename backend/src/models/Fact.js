/**
 * Fact.js — Brand Knowledge Fact Mongoose model.
 *
 * Implements the "AI Central Memory" (Architectural Blueprint §8):
 * A Fact is an approved, expiry-bound brand statement that the ML pipeline
 * uses to verify claims in draft content.
 *
 * Ownership and lifecycle:
 *   - Every Fact is owned by a `knowledge_owner` or `admin` user (ownerId).
 *   - Facts carry an optional `expiresAt` date; the shelf-life scheduler will
 *     archive / flag them when that date passes.
 *   - Only facts with status 'active' are forwarded to the ML service.
 *
 * Multi-tenancy:
 *   All queries are scoped by `orgId` (enforced at the router level).
 */

'use strict';

const mongoose = require('mongoose');

// Enum constants (exported for use in routes / orchestrator)
const FACT_CATEGORIES = [
  'product',
  'pricing',
  'legal',
  'compliance',
  'brand',
  'technical',
  'clinical',
  'regulatory',
  'other',
];

const FACT_STATUSES = ['active', 'expired', 'archived', 'draft'];

// Fact schema

const factSchema = new mongoose.Schema(
  {
    /** Owning organisation — enforces tenant isolation */
    orgId: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'Org',
      required : [true, 'orgId is required for tenant isolation.'],
      index    : true,
    },

    /**
     * The knowledge owner or admin who approved and submitted this fact.
     * Persisted at creation time, immutable after that.
     */
    ownerId: {
      type     : mongoose.Schema.Types.ObjectId,
      ref      : 'User',
      required : [true, 'ownerId is required.'],
      index    : true,
    },

    /**
     * Human-readable label (title) for the fact.
     * E.g. "Q4 Pricing — Enterprise Tier".
     */
    label: {
      type      : String,
      required  : [true, 'A label / title for the fact is required.'],
      trim      : true,
      maxlength : [200, 'label must be at most 200 characters.'],
      index     : true,
    },

    /**
     * The canonical, approved statement text.
     * This is what the ML service compares draft claims against.
     */
    statement: {
      type      : String,
      required  : [true, 'statement is required.'],
      trim      : true,
      minlength : [5, 'statement must be at least 5 characters.'],
      maxlength : [5000, 'statement must be at most 5000 characters.'],
    },

    /**
     * Optional source citation: URL, document title, internal reference, etc.
     * Used for traceability to the authoritative source of truth.
     */
    sourceRef: {
      type      : String,
      default   : null,
      trim      : true,
      maxlength : [500, 'sourceRef must be at most 500 characters.'],
    },

    /**
     * Domain category for filtering and ML context prioritisation.
     */
    category: {
      type    : String,
      enum    : {
        values  : FACT_CATEGORIES,
        message : `category must be one of: ${FACT_CATEGORIES.join(', ')}.`,
      },
      default : 'other',
      index   : true,
    },

    /**
     * Arbitrary string tags for flexible search / grouping.
     * E.g. ['EMEA', 'BrandGuard Pro', 'Q4-2026']
     */
    tags: {
      type    : [String],
      default : [],
    },

    /**
     * Lifecycle status:
     *   active   — in use by the ML pipeline
     *   draft    — authored but not yet approved for pipeline use
     *   expired  — past expiresAt date (set automatically by scheduler)
     *   archived — manually retired by an admin
     */
    status: {
      type    : String,
      enum    : {
        values  : FACT_STATUSES,
        message : `status must be one of: ${FACT_STATUSES.join(', ')}.`,
      },
      default : 'active',
      index   : true,
    },

    /**
     * UTC date after which this fact is considered stale and will be
     * automatically transitioned to 'expired' by the shelf-life scheduler.
     * null = no expiry (permanent unless manually archived).
     */
    expiresAt: {
      type    : Date,
      default : null,
      index   : true,
    },

    /**
     * Optional confidence weight [0.0, 1.0] to signal to the ML service
     * how authoritative this fact is relative to others in the same category.
     * Defaults to 1.0 (fully authoritative).
     */
    confidenceWeight: {
      type    : Number,
      default : 1.0,
      min     : [0, 'confidenceWeight must be >= 0.'],
      max     : [1, 'confidenceWeight must be <= 1.'],
    },
  },
  {
    timestamps : true,       // createdAt, updatedAt
    collection : 'facts',
  }
);

// Compound indexes for tenant-scoped queries
factSchema.index({ orgId: 1, status: 1 });
factSchema.index({ orgId: 1, category: 1 });
factSchema.index({ orgId: 1, ownerId: 1 });
factSchema.index({ orgId: 1, expiresAt: 1 });
factSchema.index({ orgId: 1, createdAt: -1 });

// Virtual: isExpired
factSchema.virtual('isExpired').get(function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

const Fact = mongoose.model('Fact', factSchema);

Fact.FACT_CATEGORIES = FACT_CATEGORIES;
Fact.FACT_STATUSES   = FACT_STATUSES;

module.exports = Fact;
