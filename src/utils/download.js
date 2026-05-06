/**
 * Fetches the latest release from GitHub and returns the best download URL
 * for the user's current OS, falling back to the release page if no match.
 */

const GITHUB_REPO = 'goastian/midori-vpn-desktop';
const RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

/**
 * Detects the current OS from the browser.
 * @returns {'windows'|'macos'|'linux'}
 */
function detectOs() {
  const platform =
    (navigator.userAgentData && navigator.userAgentData.platform) ||
    navigator.platform ||
    '';
  const ua = navigator.userAgent || '';

  if (/win/i.test(platform) || /windows/i.test(ua)) return 'windows';
  if (/mac/i.test(platform) || /mac os/i.test(ua)) return 'macos';
  return 'linux';
}

/**
 * Returns true if the asset filename matches the given OS.
 * Priority order per OS matches the Tauri bundle targets.
 */
function assetScore(name, os) {
  const n = name.toLowerCase();
  if (os === 'windows') {
    if (n.endsWith('.msi')) return 3;
    if (n.endsWith('.exe')) return 2;
    return 0;
  }
  if (os === 'macos') {
    if (n.endsWith('.dmg')) return 3;
    if (n.endsWith('.pkg')) return 2;
    return 0;
  }
  // linux
  if (n.endsWith('.deb')) return 3;
  if (n.endsWith('.appimage')) return 2;
  if (n.endsWith('.rpm')) return 1;
  return 0;
}

/**
 * Fetches the best download URL for the latest release.
 * Always resolves — falls back to the release page on error.
 * @returns {Promise<string>}
 */
export async function getLatestDownloadUrl() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return RELEASE_PAGE;

    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const os = detectOs();

    let best = null;
    let bestScore = 0;
    for (const asset of assets) {
      const score = assetScore(asset.name, os);
      if (score > bestScore) {
        bestScore = score;
        best = asset.browser_download_url;
      }
    }

    return best || release.html_url || RELEASE_PAGE;
  } catch {
    return RELEASE_PAGE;
  }
}
