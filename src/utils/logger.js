// Minimal structured logger so all extension logs share a grep-friendly
// prefix and survive the production build (terser keeps console.* now).
const PREFIX = '[MidoriVPN]';
const IS_PROD = process.env.NODE_ENV === 'production';

function fmt(tag, args) {
    return [`${PREFIX} ${tag}`, ...args];
}

export const log = {
    // info-level messages are suppressed in production builds to avoid
    // leaking routing/state details into the browser console for end users.
    info: IS_PROD ? () => {} : (tag, ...args) => console.log(...fmt(tag, args)),
    warn: (tag, ...args) => console.warn(...fmt(tag, args)),
    error: (tag, ...args) => console.error(...fmt(tag, args)),
};

export default log;
