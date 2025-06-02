import badge from "./badge";
import { isFirefox } from "./vars";

export const handleProxy = (details) => {
    return new Promise((resolve, reject) => {
        const url = new URL(details.url)
        const hostname = url.hostname

        const whitelistDomains = ['localhost', '127.0.0.1']

        if (whitelistDomains.includes(hostname)) {
            resolve({ type: 'direct' })
            return
        }

        chrome.storage.local.get(['store'], (storage) => {
            if (storage.store.state) {
                resolve({
                    type: 'https',
                    host: process.env.PROXY_HOST,
                    port: process.env.PROXY_PORT,
                })
                return;
            } else {
                resolve({ type: 'direct' })
                return;
            }
        })
    })
};

export const enableProxy = async () => {
    if (!isFirefox) {
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: process.env.PROXY_HOST,
                    port: process.env.PROXY_PORT,
                },
                bypassList: ["<local>"]
            }
        };
        await chrome.proxy.settings.set({ value: config, scope: "regular" });
    };
    return true;
};

export const disableProxy = async () => {
    await chrome.proxy.settings.clear({ scope: "regular" });
    return true;
}