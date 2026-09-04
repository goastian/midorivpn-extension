const PREFIX = '[MidoriVPN]';
const IS_PROD = process.env.NODE_ENV === 'production';
const DIAG_ENABLED = !IS_PROD || process.env.DEBUG_DIAG === 'true';

type LogValue = unknown;
type LogMethod = (tag: string, ...args: LogValue[]) => void;

function fmt(tag: string, args: LogValue[]): LogValue[] {
    return [`${PREFIX} ${tag}`, ...args];
}

const noop: LogMethod = () => {};

export const log: Record<'info' | 'diag' | 'warn' | 'error', LogMethod> = {
    // Info and diagnostics stay disabled in production unless the build opts
    // into the diagnostic channel. Callers must pass only redacted context.
    // eslint-disable-next-line no-console
    info: IS_PROD ? noop : (tag, ...args) => console.log(...fmt(tag, args)),
    // eslint-disable-next-line no-console
    diag: DIAG_ENABLED ? (tag, ...args) => console.debug(...fmt(`diag:${tag}`, args)) : noop,
    warn: (tag, ...args) => console.warn(...fmt(tag, args)),
    error: (tag, ...args) => console.error(...fmt(tag, args)),
};

export default log;
