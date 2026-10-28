'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Performs a JSON POST to an internal service URL with a strict timeout.
 */
function postJson(targetUrl, payload, timeoutMs, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const bodyStr = JSON.stringify(payload);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'X-Internal': 'brandguard-backend',
        ...extraHeaders,
      },
    };

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            Object.assign(
              new Error(`ML service responded with HTTP ${res.statusCode}: ${raw}`),
              { code: 'ML_HTTP_ERROR', statusCode: res.statusCode }
            )
          );
        }

        try {
          resolve(JSON.parse(raw));
        } catch (_e) {
          reject(
            Object.assign(
              new Error(`ML service returned non-JSON body: ${raw.slice(0, 200)}`),
              { code: 'ML_INVALID_JSON' }
            )
          );
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        Object.assign(
          new Error(`ML service request timed out after ${timeoutMs} ms`),
          { code: 'ML_TIMEOUT' }
        )
      );
    });

    req.on('error', (err) => {
      if (!err.code) err.code = 'ML_NETWORK_ERROR';
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

module.exports = {
  postJson,
};
