import { beforeEach, expect, it, vi } from 'vitest';
import Auth from '../utils/authentification';

const local: Record<string, unknown> = {};
const session: Record<string, unknown> = {};
function area(data: Record<string, unknown>) {
    return {
        get: vi.fn((keys: string[] | null, callback?: (value: Record<string, unknown>) => void) => {
            const selected = keys === null ? { ...data } : Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]]));
            callback?.(selected);
            return Promise.resolve(selected);
        }),
        remove: vi.fn((keys: string[], callback?: () => void) => {
            keys.forEach(key => delete data[key]); callback?.(); return Promise.resolve();
        }),
        clear: vi.fn(async () => { Object.keys(data).forEach(key => delete data[key]); }),
    };
}

beforeEach(() => {
    Object.keys(local).forEach(key => delete local[key]);
    Object.keys(session).forEach(key => delete session[key]);
    vi.stubGlobal('chrome', {
        storage: { local: area(local), session: area(session) },
        runtime: { sendMessage: vi.fn((_message, callback) => callback()), lastError: undefined },
        action: { setBadgeText: vi.fn() },
    });
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
});

it('removes account state and pending OAuth flows without rotating installation identity', async () => {
    const identity = { client_instance_id: '11111111-1111-4111-8111-111111111111', device_type: 'extension' };
    Object.assign(local, { midori_proxy_device_identity_v1: identity, access_token_enc: 'secret', refresh_token_enc: 'secret', store: { state: true }, server: { active: {} }, auth_error: {} });
    session['midori_pkce_transaction_v1:pending'] = { verifier: 'pending-secret' };
    await new Auth().logout();
    expect(local).toEqual({ midori_proxy_device_identity_v1: identity });
    expect(session['midori_pkce_transaction_v1:pending']).toBeUndefined();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'disconnectProxy' }, expect.any(Function));
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
});
