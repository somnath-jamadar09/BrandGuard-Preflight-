/**
 * Central unwrap helper for API responses (D1).
 * Normalizes backend payload envelopes ({ success, data, ... }) into plain data or arrays.
 */

export function unwrapData(res, defaultVal = null) {
  if (!res) return defaultVal;
  const payload = res.data !== undefined ? res.data : res;
  if (!payload || typeof payload !== 'object') {
    return payload ?? defaultVal;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload.data !== undefined) {
    return payload.data;
  }
  return payload;
}

export function unwrapArray(res) {
  const data = unwrapData(res, []);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.drafts)) return data.drafts;
    if (Array.isArray(data.sources)) return data.sources;
    if (Array.isArray(data.findings)) return data.findings;
    if (Array.isArray(data.versions)) return data.versions;
    if (Array.isArray(data.comments)) return data.comments;
    if (Array.isArray(data.mistakeInsights)) return data.mistakeInsights;
    if (Array.isArray(data.ruleInsights)) return data.ruleInsights;
  }
  return [];
}
