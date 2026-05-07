/**
 * Platform detection utilities for the desktop client download CTA.
 *
 * Same logic as midori-vpn-control/src/lib/platform.ts, adapted to plain JS
 * so it can be used in the extension without a TypeScript build step.
 *
 * Confidence levels:
 *   'detected'  — high-confidence signal; select the best asset automatically.
 *   'uncertain' — low-confidence; let the user pick from the release page.
 *   'mobile'    — phone/tablet; hide the download CTA entirely.
 *   'unknown'   — no OS detected; fall back to the release page.
 */

const CACHE_KEY = 'midori.platform.v1';

// ─── Mobile detection ────────────────────────────────────────────────────────

/**
 * @param {string} ua
 * @param {number} [maxTouchPoints]
 * @returns {boolean}
 */
export function detectMobile(ua, maxTouchPoints = 0) {
  if (/android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return true;
  if (/ipad/i.test(ua)) return true;
  // iPadOS Safari: reports macOS UA but has touch points
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return false;
}

// ─── Apple Silicon via WebGL ─────────────────────────────────────────────────

/**
 * Creates an off-DOM WebGL context and reads UNMASKED_RENDERER_WEBGL.
 * Returns true when the renderer string suggests Apple Silicon.
 * @returns {boolean}
 */
export function detectAppleSiliconViaWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return false;

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;

    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    if (!renderer) return false;

    const r = renderer.toLowerCase();
    if (!/apple/.test(r)) return false;
    if (/intel|amd|nvidia|radeon|geforce/.test(r)) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── High-entropy values ─────────────────────────────────────────────────────

/**
 * @returns {Promise<object|null>}
 */
async function getHighEntropyValues() {
  try {
    const uad = navigator.userAgentData;
    if (!uad || typeof uad.getHighEntropyValues !== 'function') return null;
    return await uad.getHighEntropyValues([
      'architecture',
      'bitness',
      'platform',
      'platformVersion',
      'mobile',
    ]);
  } catch {
    return null;
  }
}

// ─── Linux distro heuristics ─────────────────────────────────────────────────

const DEB_TOKENS = /debian|ubuntu|mint|pop!?[\s_-]?os|kali|elementary|zorin|raspbian|linuxmint/i;
const RPM_TOKENS = /fedora|rhel|red\s*hat|centos|rocky|alma|opensuse|suse/i;

/**
 * @param {string} source
 * @returns {'deb'|'rpm'|'unknown'}
 */
function detectLinuxFormat(source) {
  if (RPM_TOKENS.test(source)) return 'rpm';
  if (DEB_TOKENS.test(source)) return 'deb';
  return 'unknown';
}

// ─── Main async detector ─────────────────────────────────────────────────────

/**
 * Detects the current desktop OS environment.
 * Results are cached in sessionStorage for the lifetime of the tab.
 *
 * @returns {Promise<{
 *   platform: 'windows'|'macos'|'linux'|'unknown',
 *   architecture: 'x64'|'arm64'|'unknown',
 *   linuxPackageFormat: 'deb'|'rpm'|'unknown',
 *   confidence: 'detected'|'uncertain'|'mobile'|'unknown'
 * }>}
 */
export async function detectDesktopEnvironment() {
  // Check session cache
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.platform && parsed.confidence) return parsed;
    }
  } catch {
    // sessionStorage unavailable — continue
  }

  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // Mobile check first
  if (detectMobile(ua, maxTouchPoints)) {
    return cacheAndReturn({ platform: 'unknown', architecture: 'unknown', linuxPackageFormat: 'unknown', confidence: 'mobile' });
  }

  const heValues = await getHighEntropyValues();
  const uaPlatformLegacy = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const platformSource = `${heValues?.platform ?? ''} ${uaPlatformLegacy} ${ua}`.toLowerCase();
  const archSource = `${heValues?.architecture ?? ''} ${heValues?.bitness ?? ''} ${uaPlatformLegacy} ${ua}`.toLowerCase();

  // Detect OS
  let platform = 'unknown';
  let confidence = 'unknown';

  if (/windows|win32|win64/.test(platformSource)) {
    platform = 'windows';
    confidence = 'detected';
  } else if (/macintosh|mac os x|macos|darwin/.test(platformSource)) {
    platform = 'macos';
    confidence = 'detected';
  } else if (/linux|x11|ubuntu|fedora|debian|cros/.test(platformSource)) {
    platform = 'linux';
    confidence = 'detected';
  }

  // Detect architecture
  let architecture = 'unknown';

  if (platform === 'macos') {
    if (heValues?.architecture && /arm/.test(heValues.architecture.toLowerCase())) {
      architecture = 'arm64';
    } else if (/arm64|aarch64/.test(archSource)) {
      architecture = 'arm64';
    } else if (detectAppleSiliconViaWebGL()) {
      architecture = 'arm64';
    } else if (/x86_64|x64|intel|amd64/.test(archSource)) {
      architecture = 'x64';
      if (!heValues?.architecture) confidence = 'uncertain';
    } else {
      confidence = 'uncertain';
    }
  } else if (platform === 'windows') {
    if (/arm64|aarch64/.test(archSource)) {
      architecture = 'unknown';
      confidence = 'uncertain';
    } else {
      architecture = 'x64';
    }
  } else if (platform === 'linux') {
    architecture = /arm64|aarch64/.test(archSource) ? 'arm64' : 'x64';
  }

  // Linux distro format
  let linuxPackageFormat = 'unknown';
  if (platform === 'linux') {
    linuxPackageFormat = detectLinuxFormat(platformSource);
    if (linuxPackageFormat === 'unknown') confidence = 'uncertain';
  }

  return cacheAndReturn({ platform, architecture, linuxPackageFormat, confidence });
}

/**
 * @param {object} result
 * @returns {object}
 */
function cacheAndReturn(result) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
  return result;
}
