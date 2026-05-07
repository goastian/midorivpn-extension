/**
 * Fetches the latest release from GitHub and returns the best download URL
 * for the user's current OS and architecture, falling back to the release
 * page if no match is found or the device is mobile.
 */

import { detectDesktopEnvironment } from './platform.js';

const GITHUB_REPO = 'goastian/midori-vpn-desktop';
const RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

/**
 * Scores a release asset filename against the detected environment.
 * Higher score = better match. 0 = not a match for this OS.
 *
 * @param {string} name  Asset filename
 * @param {string} os    'windows' | 'macos' | 'linux'
 * @param {string} arch  'x64' | 'arm64' | 'unknown'
 * @returns {number}
 */
function assetScore(name, os, arch) {
  const n = name.toLowerCase();

  // Helper: does the filename mention an architecture that contradicts ours?
  const filenameIsArm = /arm64|aarch64/.test(n);
  const filenameIsX64 = /x86_64|x64|amd64/.test(n);
  const archMismatch = arch !== 'unknown' && (
    (arch === 'arm64' && filenameIsX64) ||
    (arch === 'x64'   && filenameIsArm)
  );
  if (archMismatch) return 0;

  // Arch bonus: filename explicitly matches our architecture
  const archBonus = (arch !== 'unknown' && (
    (arch === 'arm64' && filenameIsArm) ||
    (arch === 'x64'   && filenameIsX64)
  )) ? 1 : 0;

  if (os === 'windows') {
    if (n.endsWith('.msi')) return 3 + archBonus;
    if (n.endsWith('.exe')) return 2 + archBonus;
    return 0;
  }
  if (os === 'macos') {
    if (n.endsWith('.dmg')) return 3 + archBonus;
    if (n.endsWith('.pkg')) return 2 + archBonus;
    return 0;
  }
  // linux
  if (n.endsWith('.deb'))       return 3 + archBonus;
  if (n.endsWith('.appimage'))  return 2 + archBonus;
  if (n.endsWith('.rpm'))       return 1 + archBonus;
  return 0;
}

/**
 * Fetches the best download URL for the latest release.
 * Always resolves — falls back to the release page on error or mobile devices.
 * @returns {Promise<string>}
 */
export async function getLatestDownloadUrl() {
  try {
    const env = await detectDesktopEnvironment();

    // Mobile devices should not download a desktop client
    if (env.confidence === 'mobile') return RELEASE_PAGE;

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return RELEASE_PAGE;

    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];

    // If we have no OS signal just send the user to the release page to choose
    if (env.platform === 'unknown') return release.html_url || RELEASE_PAGE;

    let best = null;
    let bestScore = 0;
    for (const asset of assets) {
      const score = assetScore(asset.name, env.platform, env.architecture);
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

