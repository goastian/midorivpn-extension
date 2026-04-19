// Minimal structured logger so all extension logs share a grep-friendly
// prefix and survive the production build (terser keeps console.* now).
const PREFIX = '[MidoriVPN]';

function fmt(tag, args) {
    return [`${PREFIX} ${tag}`, ...args];
}

export const log = {
    info: (tag, ...args) => console.log(...fmt(tag, args)),
    warn: (tag, ...args) => console.warn(...fmt(tag, args)),
    error: (tag, ...args) => console.error(...fmt(tag, args)),
};

export default log;
