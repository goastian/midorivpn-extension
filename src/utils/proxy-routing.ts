export interface ActiveServer {
    endpoint?: string | null;
    host?: string | null;
    proxy_port?: number | string | null;
    supports_proxy?: boolean;
}

export interface ProxyServer {
    host: string;
    port: number;
}

export interface BypassConfig {
    apiUrl?: string;
    authentikIssuer?: string;
}

export function resolveProxyServer(activeServer: ActiveServer | null | undefined): ProxyServer | null {
    if (!activeServer) return null;
    if (activeServer.supports_proxy === false) return null;

    const raw = activeServer.endpoint || activeServer.host || '';
    const host = String(raw).split(':')[0];
    const rawPort = activeServer.proxy_port ?? 8888;
    const port = Number(rawPort);

    if (!host || !Number.isFinite(port) || port <= 0) {
        return null;
    }

    return { host, port };
}

export function buildBypassDomains({ apiUrl, authentikIssuer }: BypassConfig = {}): string[] {
    const extras: string[] = [];
    const safeHost = (value?: string) => {
        if (!value) return;
        try {
            extras.push(new URL(value).hostname);
        } catch {
            /* ignore invalid URL */
        }
    };
    safeHost(apiUrl);
    safeHost(authentikIssuer);
    return ['localhost', '127.0.0.1', ...extras];
}
