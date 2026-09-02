#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${1:-${ROOT_DIR}/release-artifacts}"
VERSION="$(jq -r .version "${ROOT_DIR}/package.json")"
AMO_METADATA="${ROOT_DIR}/store/amo/metadata.json"
CWS_LISTING="${ROOT_DIR}/store/chrome/listing.json"

for command_name in jq sha256sum unzip; do
  command -v "${command_name}" >/dev/null || { echo "error: ${command_name} is required" >&2; exit 1; }
done

jq -e '
  .categories | type == "array" and length > 0
' "${AMO_METADATA}" >/dev/null
jq -e '
  (.summary["en-US"] | type == "string" and length > 0) and
  (.version.license == "AGPL-3.0-only") and
  (.version.approval_notes | type == "string" and length > 0)
' "${AMO_METADATA}" >/dev/null
jq -e '
  .schema_version == 1 and
  (.summary | length > 0 and length <= 132) and
  (.single_purpose | length > 0) and
  (.remote_code == false) and
  (.data_use.authentication_information == true) and
  (.data_use.web_browsing_activity == true) and
  ([.permission_justifications | .["alarms"], .["storage"], .["proxy"], .["tabs"], .["webRequest"], .["webNavigation"], .["webRequestAuthProvider"], .["webRequestBlocking"], .["<all_urls>"]] | all(type == "string" and length > 0))
' "${CWS_LISTING}" >/dev/null

firefox_zip="${ARTIFACT_DIR}/midorivpn-extension-${VERSION}-firefox.zip"
chrome_zip="${ARTIFACT_DIR}/midorivpn-extension-${VERSION}-chrome.zip"
source_zip="${ARTIFACT_DIR}/midorivpn-extension-${VERSION}-source.zip"
for artifact in "${firefox_zip}" "${chrome_zip}"; do
  [[ -s "${artifact}" ]] || { echo "error: missing package: ${artifact}" >&2; exit 1; }
  unzip -tq "${artifact}" >/dev/null
  [[ "$(unzip -p "${artifact}" manifest.json | jq -r .version)" == "${VERSION}" ]] || {
    echo "error: manifest version mismatch: ${artifact}" >&2
    exit 1
  }
  unzip -p "${artifact}" '*.js' 2>/dev/null | grep -Eq '(^|[^[:alnum:]_$])process([.]|\[)' && {
    echo "error: Node.js process reference found in ${artifact}" >&2
    exit 1
  }
done

[[ "$(unzip -p "${firefox_zip}" manifest.json | jq -r '.browser_specific_settings.gecko.id')" == "midorivpn@astian.org" ]] || {
  echo "error: Firefox add-on ID changed" >&2
  exit 1
}
[[ "$(unzip -p "${firefox_zip}" manifest.json | jq -r '.background.service_worker // empty')" == "" ]] || {
  echo "error: Firefox package contains a Chromium service worker declaration" >&2
  exit 1
}
[[ "$(unzip -p "${chrome_zip}" manifest.json | jq -r '.background.service_worker')" == "background.js" ]] || {
  echo "error: Chromium package lacks its service worker" >&2
  exit 1
}
[[ "$(unzip -p "${chrome_zip}" manifest.json | jq -r '.browser_specific_settings // empty')" == "" ]] || {
  echo "error: Chromium package contains Firefox-specific settings" >&2
  exit 1
}

if [[ -e "${source_zip}" ]]; then
  unzip -tq "${source_zip}" >/dev/null
  source_entries="$(unzip -Z1 "${source_zip}")"
  grep -Fxq 'release-build-inputs.json' <<<"${source_entries}" || {
    echo "error: reviewer source archive lacks release-build-inputs.json" >&2
    exit 1
  }
  grep -Fxq 'docs/AMO_REVIEWER_BUILD.md' <<<"${source_entries}" || {
    echo "error: reviewer source archive lacks build instructions" >&2
    exit 1
  }
fi

echo "Store release packages and metadata are valid"
