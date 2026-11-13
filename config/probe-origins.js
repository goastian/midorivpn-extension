'use strict';

function parseProbeOrigins(value = '') {
  return [...new Set(value.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname.includes('*') || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('EDGE_PROBE_ORIGINS must contain explicit HTTPS origins without credentials, paths or wildcards');
    }
    return url.origin;
  }))];
}

module.exports = { parseProbeOrigins };
