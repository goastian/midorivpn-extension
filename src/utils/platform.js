/** Low-entropy hints only; downloads never justify GPU or UA-CH fingerprinting. */
export function detectMobile(ua, maxTouchPoints = 0) {
  return /android|iphone|ipod|ipad|blackberry|iemobile|opera mini/i.test(ua) ||
    (/macintosh/i.test(ua) && maxTouchPoints > 1);
}

export async function detectDesktopEnvironment() {
  const ua = navigator.userAgent || '';
  const source = `${navigator.platform || ''} ${ua}`.toLowerCase();
  const result = { platform: 'unknown', architecture: 'unknown', linuxPackageFormat: 'unknown', confidence: 'unknown' };
  if (detectMobile(ua, navigator.maxTouchPoints || 0)) return { ...result, confidence: 'mobile' };
  if (/windows|win32|win64/.test(source)) result.platform = 'windows';
  else if (/macintosh|mac os x|macos|darwin/.test(source)) result.platform = 'macos';
  else if (/linux|x11/.test(source)) result.platform = 'linux';
  if (/arm64|aarch64/.test(source)) result.architecture = 'arm64';
  else if (/x86_64|x64|amd64|win64/.test(source)) result.architecture = 'x64';
  if (result.platform === 'linux' && /fedora|rhel|red\s*hat|centos|rocky|alma|opensuse|suse/.test(source)) result.linuxPackageFormat = 'rpm';
  if (result.platform !== 'unknown') result.confidence = 'uncertain';
  return result;
}
