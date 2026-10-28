
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');
const { sendError } = require('../utils/response');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string') {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Validation error: Field "email" is required.');
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Validation error: Field "password" must be at least 8 characters long.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).populate('orgId');

    if (!user) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (!user.active) {
      return sendError(res, 403, 'ACCOUNT_DEACTIVATED', 'Forbidden: Account is deactivated.');
    }

    if (user.orgId && user.orgId.active === false) {
      return sendError(res, 403, 'ORG_INACTIVE', 'Forbidden: Organisation is inactive.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const orgIdStr = user.orgId?._id ? user.orgId._id.toString() : user.orgId?.toString();
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        orgId: orgIdStr,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const userObj = user.toObject();
    delete userObj.__v;

    return res.status(200).json({
      success: true,
      token,
      user: userObj,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticate, async (req, res) => {
  return res.status(200).json(req.user);
});

module.exports = router;

