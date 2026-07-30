const MIDORI_PRIVACY_EXTENSION_IDS = new Set([
    'midori-protection@astian.org',
    'pimgloaejdgobcgjahbgippfilfdpcfa',
]);

const MIDORI_VPN_STATUS_ACTION = 'get-midori-vpn-status';

type PrivacyStatusMessage = {
    action?: string;
    source?: string;
};

type MessageSender = {
    id?: string;
};

type VpnStorage = {
    store?: {
        state?: boolean;
    };
};

export function isTrustedMidoriPrivacyRequest(
    message: PrivacyStatusMessage | undefined,
    sender: MessageSender | undefined,
) {
    return message?.action === MIDORI_VPN_STATUS_ACTION &&
        message?.source === 'midori-protection' &&
        MIDORI_PRIVACY_EXTENSION_IDS.has(sender?.id || '');
}

export function getMidoriPrivacyStatus(
    storage: VpnStorage | undefined,
    updatedAt = Date.now(),
) {
    return {
        state: storage?.store?.state === true ? 'connected' : 'off',
        updatedAt,
    };
}
