// Minimal structured logger so all extension logs share a grep-friendly
// prefix and survive the production build.
const PREFIX = '[MidoriVPN]';
const IS_PROD = process.env.NODE_ENV === 'production';
// Diagnostic channel is enabled in dev builds or when DEBUG_DIAG=true is set
// at build time. In production it defaults to a no-op so diag traces do not
// appear in end-user consoles. To debug a production build locally, rebuild
// with DEBUG_DIAG=true or load an unminified dev build instead.
const DIAG_ENABLED = !IS_PROD || process.env.DEBUG_DIAG === 'true';

function fmt(tag, args) {
    return [`${PREFIX} ${tag}`, ...args];
}

export const log = {
    // info-level messages are suppressed in production builds to avoid
    // leaking routing/state details into the browser console for end users.
    // eslint-disable-next-line no-console
    info: IS_PROD ? () => {} : (tag, ...args) => console.log(...fmt(tag, args)),
    // Diagnostic channel uses console.debug (verbose level in DevTools).
    // Disabled by default in production; set DEBUG_DIAG=true at build time
    // to re-enable without changing log levels for warn/error.
    // eslint-disable-next-line no-console
    diag: DIAG_ENABLED ? (tag, ...args) => console.debug(...fmt(`diag:${tag}`, args)) : () => {},
    warn: (tag, ...args) => console.warn(...fmt(tag, args)),
    error: (tag, ...args) => console.error(...fmt(tag, args)),
};

export default log;
