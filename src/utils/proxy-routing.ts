export interface ActiveServer {
    transports?: TransportCapability[] | null;
}

export interface TransportCapability {
    protocol: string;
    host: string;
    port: number;
    enabled: boolean;
    health_status: string;
}

export interface ProxyServer {
    host: string;
    port: number;
    scheme: 'https';
}

export interface BypassConfig {
    apiUrl?: string;
    authentikIssuer?: string;
}

export function resolveProxyServer(activeServer: ActiveServer | null | undefined): ProxyServer | null {
    if (!activeServer) return null;
    const transport = activeServer.transports?.find((item) =>
        item.protocol === 'proxy' && item.enabled && item.health_status === 'healthy'
    );
    if (!transport) return null;

    const host = String(transport.host || '').trim();
    const port = Number(transport.port);

    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
        return null;
    }

    return { host, port, scheme: 'https' };
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
