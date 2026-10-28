
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../config');
const { sendError } = require('../utils/response');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return header.trim() || null;
}

async function authenticate(req, res, next) {
  const raw = extractToken(req);

  if (!raw) {
    return sendError(res, 401, null, 'Authentication required. Provide a Bearer token.');
  }

  let payload;
  try {
    payload = jwt.verify(raw, JWT_SECRET);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Token has expired. Please sign in again.'
        : 'Invalid or malformed token.';
    return sendError(res, 401, null, message);
  }

  if (!payload.sub) {
    return sendError(res, 401, null, 'Token missing subject (sub).');
  }

  let user;
  try {
    user = await User.findById(payload.sub)
      .populate('orgId')
      .select('-__v')
      .lean();
  } catch (_dbErr) {
    return sendError(res, 500, null, 'Database error during authentication.');
  }

  if (!user) {
    return sendError(res, 401, null, 'User not found.');
  }

  if (!user.active) {
    return sendError(res, 403, null, 'Account is deactivated.');
  }

  if (!user.orgId || !user.orgId.active) {
    return sendError(res, 403, null, 'Organisation is inactive.');
  }

  req.token = payload;
  req.user = user;
  req.org = user.orgId;
  req.orgId = user.orgId._id;

  return next();
}

const { requireRole, ROLE_HIERARCHY } = require('./rbac');
const ROLE_RANK = ROLE_HIERARCHY;

module.exports = { authenticate, requireRole, ROLE_RANK };


