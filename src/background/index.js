import badge from '../utils/badge';
import { handleProxy } from '../utils/proxy';
import { isFirefox } from '../utils/vars';

badge();

if (isFirefox) {
  browser.proxy.onRequest.addListener(handleProxy, {
    urls: ['<all_urls>'],
  })
}