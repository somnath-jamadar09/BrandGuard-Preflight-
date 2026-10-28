'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { sendError } = require('../utils/response');

const router = express.Router();

router.post('/check', async (req, res, next) => {
  try {
    const expectedKey = process.env.GATE_API_KEY;
    const apiKey = req.headers['x-gate-api-key'];

    if (!apiKey) {
      return sendError(res, 401, 'MISSING_API_KEY', 'Unauthorized: Missing X-Gate-Api-Key header.');
    }

    if (!expectedKey || apiKey !== expectedKey) {
      return sendError(res, 403, 'INVALID_API_KEY', 'Forbidden: Invalid API key.');
    }

    const { content, orgId } = req.body || {};

    if (!content || typeof content !== 'string' || !orgId) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Validation error: Both "content" and "orgId" are required.');
    }

    if (!mongoose.Types.ObjectId.isValid(orgId)) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Validation error: "orgId" must be a valid ObjectId.');
    }

    return res.status(200).json({
      success: true,
      allowed: true,
      findings: [],
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

