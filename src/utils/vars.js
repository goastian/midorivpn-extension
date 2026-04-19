const brow = (process.env.BROWSER || '').toLowerCase();
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// Prefer explicit env flag, but fall back to runtime UA in case build-time env is missing.
const isFirefox = brow === 'firefox' || /Firefox\//.test(ua);

export {
    isFirefox,
}