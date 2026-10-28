'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { orgIsolation } = require('../../middleware/orgIsolation');

const submitRouter = require('./submit');
const reviewRouter = require('./review');
const commentsRouter = require('./comments');
const approvalsRouter = require('./approvals');

const router = express.Router();

router.use(authenticate, orgIsolation);

// Mount feature routers on the same drafts router to preserve URL structure
router.use('/', submitRouter);
router.use('/', reviewRouter);
router.use('/', commentsRouter);
router.use('/', approvalsRouter);

module.exports = router;
