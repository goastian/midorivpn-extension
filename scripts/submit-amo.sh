#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(jq -r .version "${ROOT_DIR}/package.json")"
ARTIFACT_DIR="${RELEASE_OUTPUT_DIR:-${ROOT_DIR}/release-artifacts}"
EXPECTED_CONFIRMATION="SIGN_MIDORIVPN_${VERSION}_UNLISTED_WITH_AMO"
IMAGE_HARDENING="${ROOT_DIR}/scripts/web-ext-image-hardening.cjs"

[[ "${AMO_CONFIRM_SUBMISSION:-}" == "${EXPECTED_CONFIRMATION}" ]] || {
  echo "error: set AMO_CONFIRM_SUBMISSION=${EXPECTED_CONFIRMATION}" >&2
  exit 1
}
[[ -n "${WEB_EXT_API_KEY:-}" && -n "${WEB_EXT_API_SECRET:-}" ]] || {
  echo "error: WEB_EXT_API_KEY and WEB_EXT_API_SECRET are required" >&2
  exit 1
}

bash "${ROOT_DIR}/scripts/validate-store-release.sh" "${ARTIFACT_DIR}"
source_zip="${ARTIFACT_DIR}/midorivpn-extension-${VERSION}-source.zip"
[[ -s "${source_zip}" ]] || {
  echo "error: reviewer source archive is required before contacting AMO" >&2
  exit 1
}
signed_dir="${ARTIFACT_DIR}/amo-signed"
[[ ! -e "${signed_dir}" ]] || {
  echo "error: AMO output already exists; rebuild evidence to avoid retaining a stale XPI" >&2
  exit 1
}

web_ext_node_options="--require=${IMAGE_HARDENING}"
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  web_ext_node_options="${NODE_OPTIONS} ${web_ext_node_options}"
fi
export NODE_OPTIONS="${web_ext_node_options}"

"${ROOT_DIR}/node_modules/.bin/web-ext" sign \
  --source-dir "${ROOT_DIR}/dist-firefox" \
  --artifacts-dir "${signed_dir}" \
  --channel unlisted \
  --amo-metadata "${ROOT_DIR}/store/amo/metadata.json" \
  --upload-source-code "${source_zip}" \
  --approval-timeout 900000 \
  --no-input

# web-ext downloads through Mozilla's authenticated signing API. These local
# checks prevent an empty/asynchronous result from being labelled signed; they
# are not a replacement for Firefox's cryptographic signature verification.
shopt -s nullglob
xpis=("${signed_dir}"/*.xpi)
[[ "${#xpis[@]}" == 1 ]] || {
  echo "error: AMO did not return one signed XPI; review its status before retrying" >&2
  exit 1
}
xpi="${xpis[0]}"
unzip -tq "${xpi}" >/dev/null
unzip -p "${xpi}" manifest.json |
  jq -e --arg version "${VERSION}" '.version == $version and .browser_specific_settings.gecko.id == "midorivpn@astian.org"' >/dev/null
entries="$(unzip -Z1 "${xpi}")"
grep -Eq '^META-INF/(mozilla[.]rsa|cose[.]sig)$' <<<"${entries}" || {
  echo "error: downloaded XPI has no Mozilla signature entry" >&2
  exit 1
}
(
  cd "${signed_dir}"
  sha256sum -- ./*.xpi > SHA256SUMS
  sha256sum -c SHA256SUMS
)
echo "AMO unlisted XPI downloaded; installed Firefox/Midori acceptance remains required."
