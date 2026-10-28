
const path = require('path');
const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown'];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/markdown',
  'text/plain',
  'text/x-markdown',
  'application/octet-stream',
];

// Standard EICAR anti-virus test file signature (first 68 chars)
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Validates file extension and mime type.
 *
 * @param {string} originalname
 * @param {string} mimetype
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFileType(originalname, mimetype) {
  if (!originalname) {
    return { valid: false, error: 'File name is missing.' };
  }

  const ext = path.extname(originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File type "${ext || 'unknown'}" is not permitted. Allowed formats: PDF (.pdf), DOCX (.docx), Markdown (.md).`,
    };
  }

  if (mimetype && !ALLOWED_MIME_TYPES.includes(mimetype) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `MIME type "${mimetype}" is not permitted.`,
    };
  }

  return { valid: true };
}

/**
 * Anti-virus scan stub.
 * In production, this can connect to ClamAV / VirusTotal / AWS GuardDuty.
 * Currently inspects byte buffer for malicious test signatures (e.g. EICAR).
 *
 * @param {Buffer} buffer
 * @param {string} originalname
 * @returns {Promise<boolean>}
 */
async function performAvScan(buffer, originalname = '') {
  if (!buffer || buffer.length === 0) {
    return true;
  }

  // Inspect up to first 4KB for test malware signatures
  const header = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));
  if (header.includes(EICAR_SIGNATURE)) {
    throw new Error('Malicious content detected: AV scan rejected file.');
  }

  return true;
}

// Multer memory-storage configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const check = validateFileType(file.originalname, file.mimetype);
    if (!check.valid) {
      const err = new Error(check.error);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err, false);
    }
    return cb(null, true);
  },
}).single('file');

const { sendError } = require('../utils/response');
const FILE_TOO_LARGE_MESSAGE = `File size exceeds ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB limit.`;

function uploadScan(req, res, next) {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, 400, 'FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
      }
      return sendError(res, 400, 'UPLOAD_ERROR', `Upload error: ${err.message}`);
    } else if (err) {
      if (err.code === 'INVALID_FILE_TYPE') {
        return sendError(res, 400, 'INVALID_FILE_TYPE', err.message);
      }
      return sendError(res, 400, 'UPLOAD_ERROR', err.message || 'File upload failed.');
    }

    if (!req.file) {
      return sendError(
        res,
        400,
        'MISSING_FILE',
        'No file uploaded. A source file (.pdf, .docx, .md) is required.'
      );
    }

    if (req.file.size > MAX_FILE_SIZE) {
      return sendError(res, 400, 'FILE_TOO_LARGE', FILE_TOO_LARGE_MESSAGE);
    }

    const typeCheck = validateFileType(req.file.originalname, req.file.mimetype);
    if (!typeCheck.valid) {
      return sendError(res, 400, 'INVALID_FILE_TYPE', typeCheck.error);
    }

    try {
      await performAvScan(req.file.buffer, req.file.originalname);
    } catch (avErr) {
      return sendError(
        res,
        400,
        'AV_SCAN_FAILED',
        avErr.message || 'Anti-virus scan rejected this file.'
      );
    }

    return next();
  });
}

module.exports = {
  uploadScan,
  validateFileType,
  performAvScan,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  EICAR_SIGNATURE,
};

