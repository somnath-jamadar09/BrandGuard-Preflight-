'use strict';

const mongoose = require('mongoose');

function sendError(res, status, code, message, extra = {}) {
  const payload = {
    success: false,
    error: message,
  };
  if (code) {
    payload.code = code;
  }
  return res.status(status).json(Object.assign(payload, extra));
}

function getOrgId(req) {
  return req.orgId || req.org?._id || req.org?.id;
}


function isValidObjectId(id) {
  return Boolean(id && mongoose.Types.ObjectId.isValid(id));
}

module.exports = {
  sendError,
  getOrgId,
  isValidObjectId,
};
