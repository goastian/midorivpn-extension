#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(jq -r .version "${ROOT_DIR}/package.json")"
ACTION="${1:-}"
ARTIFACT="${RELEASE_OUTPUT_DIR:-${ROOT_DIR}/release-artifacts}/midorivpn-extension-${VERSION}-chrome.zip"
API_ROOT="https://chromewebstore.googleapis.com"

case "${ACTION}" in
  upload|status|publish) ;;
  *) echo "usage: $0 upload|status|publish" >&2; exit 2 ;;
esac

for variable_name in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID CWS_EXTENSION_ID CWS_PRIVACY_POLICY_URL; do
  [[ -n "${!variable_name:-}" ]] || { echo "error: ${variable_name} is required" >&2; exit 1; }
done
[[ "${CWS_PUBLISHER_ID}" =~ ^[A-Za-z0-9_-]+$ && "${CWS_EXTENSION_ID}" =~ ^[a-z]{32}$ ]] || {
  echo "error: invalid CWS publisher or extension ID" >&2
  exit 1
}
[[ "${CWS_PRIVACY_POLICY_URL}" =~ ^https://[^[:space:]]+$ ]] || {
  echo "error: CWS_PRIVACY_POLICY_URL must be a public HTTPS URL" >&2
  exit 1
}

if [[ "${ACTION}" == "upload" ]]; then
  [[ -s "${ARTIFACT}" ]] || { echo "error: missing Chromium package: ${ARTIFACT}" >&2; exit 1; }
  [[ "${CWS_CONFIRM_UPLOAD:-}" == "UPLOAD_MIDORIVPN_${VERSION}_TO_CWS" ]] || {
    echo "error: set CWS_CONFIRM_UPLOAD=UPLOAD_MIDORIVPN_${VERSION}_TO_CWS" >&2
    exit 1
  }
elif [[ "${ACTION}" == "publish" ]]; then
  [[ "${CWS_CONFIRM_PUBLISH:-}" == "PUBLISH_MIDORIVPN_${VERSION}_TO_CWS" ]] || {
    echo "error: set CWS_CONFIRM_PUBLISH=PUBLISH_MIDORIVPN_${VERSION}_TO_CWS" >&2
    exit 1
  }
fi

token_response="$(curl --fail --silent --show-error \
  --request POST https://oauth2.googleapis.com/token \
  --data-urlencode "client_id=${CWS_CLIENT_ID}" \
  --data-urlencode "client_secret=${CWS_CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${CWS_REFRESH_TOKEN}" \
  --data-urlencode grant_type=refresh_token)"
access_token="$(jq -er .access_token <<<"${token_response}")"
item="publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}"

case "${ACTION}" in
  upload)
    curl --fail --silent --show-error \
      --request POST \
      --header "Authorization: Bearer ${access_token}" \
      --header 'Content-Type: application/zip' \
      --upload-file "${ARTIFACT}" \
      "${API_ROOT}/upload/v2/${item}:upload"
    ;;
  status)
    curl --fail --silent --show-error \
      --header "Authorization: Bearer ${access_token}" \
      "${API_ROOT}/v2/${item}:fetchStatus"
    ;;
  publish)
    curl --fail --silent --show-error \
      --request POST \
      --header "Authorization: Bearer ${access_token}" \
      "${API_ROOT}/v2/${item}:publish"
    ;;
esac
