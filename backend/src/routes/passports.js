'use strict';

const express = require('express');
const Passport = require('../models/Passport');
const { authenticate } = require('../middleware/auth');
const { orgIsolation } = require('../middleware/orgIsolation');
const { sendError, getOrgId, isValidObjectId } = require('../utils/response');

const router = express.Router();

router.use(authenticate, orgIsolation);

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!isValidObjectId(id)) {
      return sendError(res, 400, 'INVALID_ID', `Invalid passport ID "${id}".`);
    }

    const passport = await Passport.findOne({ _id: id, orgId })
      .populate('approvers', 'name email role')
      .lean();

    if (!passport) {
      return sendError(res, 404, 'NOT_FOUND', `Brand Passport "${id}" was not found in your organisation.`);
    }

    return res.json(passport);
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const filter = { orgId };

    if (req.query.draftId) {
      if (!isValidObjectId(req.query.draftId)) {
        return sendError(res, 400, 'INVALID_ID', `Invalid draft ID "${req.query.draftId}".`);
      }
      filter.draftId = req.query.draftId;
    }

    const passports = await Passport.find(filter)
      .populate('approvers', 'name email role')
      .sort({ timestamp: -1 })
      .lean();

    return res.json({
      success: true,
      count: passports.length,
      passports,
    });
  } catch (err) {
    return next(err);
  }
});

const methodNotAllowed = (req, res) => {
  return sendError(
    res,
    405,
    'METHOD_NOT_ALLOWED',
    `Method ${req.method} is not allowed on /v1/passports. Brand Passports are append-only cryptographic records and cannot be modified or deleted.`
  );
};

router.patch('/:id?', methodNotAllowed);
router.delete('/:id?', methodNotAllowed);
router.put('/:id?', methodNotAllowed);

module.exports = router;

