/**
 * Resolves the URL where users should land when they click "Download client"
 * in the popup or welcome page. The desktop client is hosted on the MidoriVPN
 * site (configured via ACCOUNT_URL), so we always send users to /download
 * there instead of GitHub.
 */

import { detectDesktopEnvironment } from './platform.js';

const ACCOUNT_URL = (process.env.ACCOUNT_URL || 'https://vpn.astian.org').replace(/\/+$/, '');
const DOWNLOAD_URL = `${ACCOUNT_URL}/download`;

/**
 * Returns the URL of the desktop client download landing page.
 * Always resolves; never throws. Callers still gate the mobile UX themselves
 * (see `detectDesktopEnvironment().confidence`).
 * @returns {Promise<string>}
 */
export async function getLatestDownloadUrl() {
  try {
    await detectDesktopEnvironment();
  } catch {
    /* swallow — we still want to return the landing page URL */
  }
  return DOWNLOAD_URL;
}
