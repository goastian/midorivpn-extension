#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(jq -r .version "${ROOT_DIR}/package.json")"
ARTIFACT_DIR="${RELEASE_OUTPUT_DIR:-${ROOT_DIR}/release-artifacts}"
EXPECTED_CONFIRMATION="SUBMIT_MIDORIVPN_${VERSION}_TO_AMO"

[[ "${AMO_CONFIRM_SUBMISSION:-}" == "${EXPECTED_CONFIRMATION}" ]] || {
  echo "error: set AMO_CONFIRM_SUBMISSION=${EXPECTED_CONFIRMATION}" >&2
  exit 1
}
[[ -n "${WEB_EXT_API_KEY:-}" && -n "${WEB_EXT_API_SECRET:-}" ]] || {
  echo "error: WEB_EXT_API_KEY and WEB_EXT_API_SECRET are required" >&2
  exit 1
}

bash "${ROOT_DIR}/scripts/validate-store-release.sh" "${ARTIFACT_DIR}"

exec "${ROOT_DIR}/node_modules/.bin/web-ext" sign \
  --source-dir "${ROOT_DIR}/dist-firefox" \
  --artifacts-dir "${ARTIFACT_DIR}/amo-signed" \
  --channel listed \
  --amo-metadata "${ROOT_DIR}/store/amo/metadata.json" \
  --upload-source-code "${ARTIFACT_DIR}/midorivpn-extension-${VERSION}-source.zip" \
  --approval-timeout 0 \
  --no-input
