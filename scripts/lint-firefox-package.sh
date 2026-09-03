#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${WEB_EXT_SOURCE_DIR:-${ROOT_DIR}/dist-firefox}"
WEB_EXT="${ROOT_DIR}/node_modules/.bin/web-ext"
IMAGE_HARDENING="${ROOT_DIR}/scripts/web-ext-image-hardening.cjs"

[[ -x "${WEB_EXT}" ]] || { echo "error: locked web-ext is unavailable; run npm ci" >&2; exit 1; }
[[ -d "${SOURCE_DIR}" ]] || { echo "error: Firefox package directory is missing: ${SOURCE_DIR}" >&2; exit 1; }

node "${ROOT_DIR}/scripts/test-web-ext-image-hardening.cjs"

if find "${ROOT_DIR}/src" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.vue' \) \
  -exec grep -n -E \
  '(^|[^[:alnum:]_])(eval[[:space:]]*\(|new[[:space:]]+Function[[:space:]]*\(|innerHTML[[:space:]]*=)' \
  {} +; then
  echo "error: unsafe dynamic code or direct innerHTML assignment exists in application source" >&2
  exit 1
fi

web_ext_node_options="--require=${IMAGE_HARDENING}"
if [[ -n "${NODE_OPTIONS:-}" ]]; then
  web_ext_node_options="${NODE_OPTIONS} ${web_ext_node_options}"
fi
report="$(NODE_OPTIONS="${web_ext_node_options}" "${WEB_EXT}" lint --source-dir "${SOURCE_DIR}" --output json --no-input)"
jq -e '.summary.errors == 0 and .summary.notices == 0' <<<"${report}" >/dev/null

# Mozilla's current linter emits three reviewed warnings for this desktop-only
# package: its Android compatibility check inherits the desktop minimum even
# though gecko_android is absent, and minified webextension-polyfill/Vue runtime
# trigger two no-unsanitized heuristics. Application source is checked above;
# every other warning remains fatal.
unexpected="$(jq '[.warnings[] | select(
  ((.code == "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION" and .file == "manifest.json") or
   (.code == "UNSAFE_VAR_ASSIGNMENT" and .message == "Error in no-unsanitized: Unexpected callable. Please report a minimal code snippet to the developers at https://github.com/mozilla/eslint-plugin-no-unsanitized/issues/new?title=unexpected%20FunctionExpression%20in%20normalizeMethodCall") or
   (.code == "UNSAFE_VAR_ASSIGNMENT" and .message == "Unsafe assignment to innerHTML")) | not
)] | length' <<<"${report}")"
[[ "${unexpected}" == "0" ]] || {
  jq -r '.warnings[] | "\(.code): \(.message) [\(.file)]"' <<<"${report}" >&2
  echo "error: web-ext reported an unreviewed warning" >&2
  exit 1
}

[[ "$(jq '[.warnings[] | select(.code == "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION")] | length' <<<"${report}")" -le 1 ]]
[[ "$(jq '[.warnings[] | select(.code == "UNSAFE_VAR_ASSIGNMENT" and (.message | startswith("Error in no-unsanitized")))] | length' <<<"${report}")" -le 1 ]]
[[ "$(jq '[.warnings[] | select(.code == "UNSAFE_VAR_ASSIGNMENT" and .message == "Unsafe assignment to innerHTML")] | length' <<<"${report}")" -le 1 ]]

jq -r '"web-ext lint: \(.summary.errors) errors, \(.summary.notices) notices, \(.summary.warnings) reviewed warnings"' <<<"${report}"
