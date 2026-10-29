'use strict';

const express = require('express');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const Org     = require('../models/Org');
const { authenticate }           = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');
const { sendError }              = require('../utils/response');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Issue a signed JWT and return { token, user } */
function issueToken(user) {
  const orgIdStr = user.orgId?._id
    ? user.orgId._id.toString()
    : user.orgId?.toString?.() ?? '';

  const token = jwt.sign(
    {
      sub:   user._id.toString(),
      email: user.email,
      role:  user.role,
      orgId: orgIdStr,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.__v;
  delete userObj.passwordHash;  // never expose hash to client

  return { token, user: userObj };
}

/** Shared candidate-email resolution (supports @acme.com ↔ @stellara.com aliases) */
function candidateEmails(normalizedEmail) {
  const ALIAS_MAP = {
    'priya@acme.com':    'priya@stellara.com',
    'elena@acme.com':    'marcus@stellara.com',
    'marcus@acme.com':   'marcus@stellara.com',
    'admin@acme.com':    'admin@stellara.com',
    'audit@acme.com':    'viewer@stellara.com',
  };

  return [
    normalizedEmail,
    ALIAS_MAP[normalizedEmail],
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// POST /v1/auth/login  — password-based login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string') {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Field "email" is required.');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Field "password" must be at least 6 characters.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emails = candidateEmails(normalizedEmail);

    const user = await User.findOne({ email: { $in: emails } }).populate('orgId');

    if (!user) {
      return sendError(res, 401, 'INVALID_CREDENTIALS',
        'Invalid email or password.');
    }

    // Verify password
    const ok = await user.comparePassword(password);
    if (!ok) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (!user.active) {
      return sendError(res, 403, 'ACCOUNT_DEACTIVATED', 'Account is deactivated.');
    }
    if (user.orgId && user.orgId.active === false) {
      return sendError(res, 403, 'ORG_INACTIVE', 'Organisation is inactive.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const { token, user: userObj } = issueToken(user);
    return res.status(200).json({ success: true, token, user: userObj });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/auth/register  — self-service registration
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, orgName } = req.body || {};

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Field "name" must be at least 2 characters.');
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'A valid "email" address is required.');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Field "password" must be at least 6 characters.');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return sendError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }

    // Find or create org
    let org;
    if (orgName && typeof orgName === 'string' && orgName.trim().length > 0) {
      const slug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      org = await Org.findOne({ slug });
      if (!org) {
        org = new Org({ name: orgName.trim(), slug, active: true });
        await org.save();
      }
    } else {
      // Fall back to demo Stellara Brands org
      org = await Org.findOne({ slug: 'stellara-brands' });
      if (!org) {
        org = new Org({ name: 'Stellara Brands', slug: 'stellara-brands', active: true });
        await org.save();
      }
    }

    // Create user
    const user = new User({
      name:  name.trim(),
      email: normalizedEmail,
      orgId: org._id,
      role:  'creator',   // default role for self-registered users
      active: true,
    });
    await user.setPassword(password);
    await user.save();

    // Re-fetch with populated orgId for token
    const populated = await User.findById(user._id).populate('orgId');
    const { token, user: userObj } = issueToken(populated);

    return res.status(201).json({ success: true, token, user: userObj });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/auth/me  — return current user (authenticated)
// ---------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  const userObj = { ...req.user };
  delete userObj.passwordHash;
  return res.status(200).json(userObj);
});

module.exports = router;
