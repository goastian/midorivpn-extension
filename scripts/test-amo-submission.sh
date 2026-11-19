#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$(mktemp -d "${TMPDIR:-/tmp}/midorivpn-amo-policy.XXXXXX")"
trap 'rm -rf -- "${fixture}"' EXIT
mkdir -p "${fixture}"/{scripts,store/amo,store/chrome,node_modules/.bin,artifacts,dist-firefox}
cp "${ROOT_DIR}/scripts/"{submit-amo.sh,validate-store-release.sh} "${fixture}/scripts/"
cp "${ROOT_DIR}/store/amo/metadata.json" "${fixture}/store/amo/"
cp "${ROOT_DIR}/store/chrome/listing.json" "${fixture}/store/chrome/"
printf '{"version":"2.0.0"}\n' > "${fixture}/package.json"

# The API boundary never signs: only failure/empty/unsigned responses are tested.
cat > "${fixture}/node_modules/.bin/web-ext" <<'WEB_EXT'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$@" > "${AMO_TEST_CALL:?}"
case "${AMO_TEST_RESPONSE:-failure}" in
  empty) exit 0 ;;
  unsigned)
    while [[ "$#" -gt 0 ]]; do
      if [[ "$1" == --artifacts-dir ]]; then
        mkdir -p "$2"
        cp "${RELEASE_OUTPUT_DIR}/midorivpn-extension-2.0.0-firefox.zip" "$2/test-only-unsigned.xpi"
        exit 0
      fi
      shift
    done
    exit 2 ;;
esac
exit 9
WEB_EXT
chmod 0700 "${fixture}/node_modules/.bin/web-ext"
mkdir -p "${fixture}/firefox" "${fixture}/chrome" "${fixture}/source/docs"
printf '%s\n' '{"manifest_version":3,"version":"2.0.0","browser_specific_settings":{"gecko":{"id":"midorivpn@astian.org"}},"content_security_policy":{"extension_pages":"script-src '\''self'\''; object-src '\''none'\''"}}' > "${fixture}/firefox/manifest.json"
printf '%s\n' '{"manifest_version":3,"version":"2.0.0","background":{"service_worker":"background.js"},"content_security_policy":{"extension_pages":"script-src '\''self'\''; object-src '\''none'\''"}}' > "${fixture}/chrome/manifest.json"
for browser in firefox chrome; do
  printf '/* test package, not a release */\n' > "${fixture}/${browser}/background.js"
  (cd "${fixture}/${browser}"; zip -q "${fixture}/artifacts/midorivpn-extension-2.0.0-${browser}.zip" ./*)
done
printf '{"APP_ENV":"production"}\n' > "${fixture}/source/release-build-inputs.json"
printf 'Test-only source fixture\n' > "${fixture}/source/docs/AMO_REVIEWER_BUILD.md"
(cd "${fixture}/source"; zip -qr "${fixture}/artifacts/midorivpn-extension-2.0.0-source.zip" .)

export AMO_TEST_CALL="${fixture}/call"
export RELEASE_OUTPUT_DIR="${fixture}/artifacts"
export WEB_EXT_API_KEY=test-only WEB_EXT_API_SECRET=test-only
export AMO_CONFIRM_SUBMISSION=SIGN_MIDORIVPN_2.0.0_UNLISTED_WITH_AMO
failures=0
run_case() {
  local name="$1" expected="$2" status=0
  rm -f -- "${AMO_TEST_CALL}"
  bash "${fixture}/scripts/submit-amo.sh" > "${fixture}/output" 2>&1 || status=$?
  if [[ "${status}" != "${expected}" ]]; then
    printf 'FAIL %s: got %s, expected %s\n' "${name}" "${status}" "${expected}" >&2
    failures=$((failures + 1))
  else
    printf 'PASS %s\n' "${name}"
  fi
}

AMO_CONFIRM_SUBMISSION=SUBMIT_MIDORIVPN_2.0.0_TO_AMO run_case 'reject old listed confirmation' 1
[[ ! -e "${AMO_TEST_CALL}" ]]
WEB_EXT_API_SECRET='' run_case 'reject missing credentials before API call' 1
[[ ! -e "${AMO_TEST_CALL}" ]]
run_case 'propagate API failure after valid local evidence' 9
[[ -f "${AMO_TEST_CALL}" ]] || {
  echo 'FAIL API boundary was not reached with valid evidence' >&2
  exit 1
}
grep -A 1 -Fx -- --channel "${AMO_TEST_CALL}" | grep -Fxq unlisted
grep -A 1 -Fx -- --approval-timeout "${AMO_TEST_CALL}" | grep -Fxq 900000
grep -A 1 -Fx -- --upload-source-code "${AMO_TEST_CALL}" |
  grep -Fxq "${fixture}/artifacts/midorivpn-extension-2.0.0-source.zip"
printf 'PASS unlisted channel, bounded signing wait and reviewer source\n'

AMO_TEST_RESPONSE=empty run_case 'reject API success without a downloaded XPI' 1
AMO_TEST_RESPONSE=unsigned run_case 'reject an unsigned ZIP returned as XPI' 1
run_case 'reject stale signing output before API call' 1
[[ ! -e "${AMO_TEST_CALL}" ]]
rm -- "${fixture}/artifacts/amo-signed/test-only-unsigned.xpi"
rmdir -- "${fixture}/artifacts/amo-signed"
rm -- "${fixture}/artifacts/midorivpn-extension-2.0.0-source.zip"
run_case 'reject absent reviewer source before API call' 1
[[ ! -e "${AMO_TEST_CALL}" ]]
[[ "${failures}" == 0 ]] || exit 1
printf 'AMO submission policy: PASS (no network or signed package created)\n'
