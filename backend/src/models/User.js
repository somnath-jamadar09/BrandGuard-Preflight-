/**
 * User.js — User Mongoose model with password authentication.
 *
 * Users are always members of exactly one Org (orgId).
 * Passwords are bcrypt-hashed and verified via comparePassword().
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const ROLES = [
  'admin',
  'editor',
  'reviewer',
  'viewer',
  'creator',
  'brand_manager',
  'manager',
  'knowledge_owner',
  'authorised_reviewer',
];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    /** Bcrypt-hashed password. Null for legacy/SSO-only users. */
    passwordHash: {
      type: String,
      default: null,
      select: true,   // included explicitly when needed
    },

    /** Reference to the Org this user belongs to. */
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Org',
      required: true,
    },

    /**
     * Role-based access control.
     * - admin:    full CRUD + org settings
     * - editor:   create/update drafts & brand guides
     * - reviewer: approve / reject findings
     * - viewer:   read-only
     */
    role: {
      type: String,
      enum: ROLES,
      default: 'viewer',
    },

    /** Soft-delete — deactivated users cannot obtain new tokens. */
    active: { type: Boolean, default: true },

    /** ISO timestamp of the last successful login (informational). */
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Compound index: look up users within an org efficiently.
userSchema.index({ orgId: 1, email: 1 });
userSchema.index({ orgId: 1, role: 1 });

/**
 * Set (hash) the user's password.
 * @param {string} plaintext
 */
userSchema.methods.setPassword = async function (plaintext) {
  this.passwordHash = await bcrypt.hash(plaintext, 10);
};

/**
 * Verify a plaintext password against the stored hash.
 * Returns true if password matches OR if no password is set (demo/legacy mode).
 * @param {string} plaintext
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (plaintext) {
  if (!this.passwordHash) return true;   // demo/legacy: any password accepted
  return bcrypt.compare(plaintext, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
