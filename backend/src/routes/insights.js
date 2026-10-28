'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { orgIsolation } = require('../middleware/orgIsolation');
const { requireRole, CAN_MANAGE_ORG } = require('../middleware/rbac');
const { getOrgId } = require('../utils/response');
const {
  getRuleInsights,
  getMistakeInsights,
  getTimeToApproval,
} = require('../services/insightsAggregator');

const router = express.Router();

router.use(authenticate, orgIsolation, requireRole(CAN_MANAGE_ORG));

router.get('/rules', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const ruleInsights = await getRuleInsights(orgId);

    return res.status(200).json({
      success: true,
      data: ruleInsights,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/mistakes', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const [mistakeInsights, timeToApproval] = await Promise.all([
      getMistakeInsights(orgId),
      getTimeToApproval(orgId),
    ]);

    return res.status(200).json({
      success: true,
      data: mistakeInsights,
      timeToApproval,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/time-to-approval', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const timeToApproval = await getTimeToApproval(orgId);

    return res.status(200).json({
      success: true,
      data: timeToApproval,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

