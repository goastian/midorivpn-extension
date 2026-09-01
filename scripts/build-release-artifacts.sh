#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${RELEASE_OUTPUT_DIR:-${ROOT_DIR}/release-artifacts}"
VERSION="$(jq -r .version "${ROOT_DIR}/package.json")"
REQUIRED_ENV=(
  APP_ENV API_URL ACCOUNT_URL PUBLIC_BASE_URL AUTHENTIK_ISSUER
  AUTHENTIK_AUTHORIZATION_URL AUTHENTIK_CLIENT_ID AUTHENTIK_REDIRECT_URI
  EXTENSION_CALLBACK_PATH
)

for command_name in date find git jq npm sha256sum sort tar zip; do
  command -v "${command_name}" >/dev/null || { echo "error: ${command_name} is required" >&2; exit 1; }
done
for variable_name in "${REQUIRED_ENV[@]}"; do
  [[ -n "${!variable_name:-}" ]] || { echo "error: ${variable_name} is required" >&2; exit 1; }
done

has_git=false
if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  has_git=true
  commit="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
else
  commit="${SOURCE_COMMIT:-}"
  [[ -n "${commit}" ]] || { echo "error: SOURCE_COMMIT is required outside a Git checkout" >&2; exit 1; }
fi

if [[ -n "${SOURCE_DATE_EPOCH:-}" ]]; then
  epoch="${SOURCE_DATE_EPOCH}"
elif [[ "${has_git}" == "true" ]]; then
  epoch="$(git -C "${ROOT_DIR}" show -s --format=%ct HEAD)"
else
  echo "error: SOURCE_DATE_EPOCH is required outside a Git checkout" >&2
  exit 1
fi
[[ "${epoch}" =~ ^[0-9]+$ ]] || { echo "error: SOURCE_DATE_EPOCH must be an integer" >&2; exit 1; }
export SOURCE_DATE_EPOCH="${epoch}"
created="$(date --utc --date="@${epoch}" +'%Y-%m-%dT%H:%M:%SZ')"

rm -rf -- "${OUTPUT_DIR}" "${ROOT_DIR}/dist" "${ROOT_DIR}/dist-firefox" "${ROOT_DIR}/dist-chrome"
mkdir -p "${OUTPUT_DIR}"

jq -n \
  --arg APP_ENV "${APP_ENV}" \
  --arg API_URL "${API_URL}" \
  --arg ACCOUNT_URL "${ACCOUNT_URL}" \
  --arg PUBLIC_BASE_URL "${PUBLIC_BASE_URL}" \
  --arg AUTHENTIK_ISSUER "${AUTHENTIK_ISSUER}" \
  --arg AUTHENTIK_AUTHORIZATION_URL "${AUTHENTIK_AUTHORIZATION_URL}" \
  --arg AUTHENTIK_CLIENT_ID "${AUTHENTIK_CLIENT_ID}" \
  --arg AUTHENTIK_REDIRECT_URI "${AUTHENTIK_REDIRECT_URI}" \
  --arg EXTENSION_CALLBACK_PATH "${EXTENSION_CALLBACK_PATH}" \
  --arg SOURCE_COMMIT "${commit}" \
  --argjson SOURCE_DATE_EPOCH "${epoch}" \
  '{$APP_ENV,$API_URL,$ACCOUNT_URL,$PUBLIC_BASE_URL,$AUTHENTIK_ISSUER,$AUTHENTIK_AUTHORIZATION_URL,$AUTHENTIK_CLIENT_ID,$AUTHENTIK_REDIRECT_URI,$EXTENSION_CALLBACK_PATH,$SOURCE_COMMIT,$SOURCE_DATE_EPOCH}' \
  > "${OUTPUT_DIR}/release-build-inputs.json"

create_zip() {
  local source_dir="$1"
  local output_file="$2"
  find "${source_dir}" -exec touch -h --date="@${epoch}" {} +
  chmod -R u=rwX,go=rX "${source_dir}"
  (
    cd "${source_dir}"
    find . -type f -print0 | LC_ALL=C sort -z | xargs -0 zip -X -q "${output_file}"
  )
}

cd "${ROOT_DIR}"
npm run build:firefox
cp -a dist dist-firefox
npm run build:chrome
cp -a dist dist-chrome

firefox_zip="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-firefox.zip"
chrome_zip="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-chrome.zip"
create_zip "${ROOT_DIR}/dist-firefox" "${firefox_zip}"
create_zip "${ROOT_DIR}/dist-chrome" "${chrome_zip}"

if [[ "${has_git}" == "true" ]]; then
  source_dir="$(mktemp -d)"
  trap 'rm -rf -- "${source_dir}"' EXIT
  git -C "${ROOT_DIR}" archive HEAD | tar -x -C "${source_dir}"
  cp "${OUTPUT_DIR}/release-build-inputs.json" "${source_dir}/release-build-inputs.json"
  source_zip="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-source.zip"
  create_zip "${source_dir}" "${source_zip}"
fi

raw_sbom="$(mktemp)"
npm sbom --omit=dev --sbom-format spdx > "${raw_sbom}"

for browser in firefox chrome; do
  artifact="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-${browser}.zip"
  artifact_name="$(basename "${artifact}")"
  artifact_sha="$(sha256sum "${artifact}" | awk '{print $1}')"
  sbom="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-${browser}.spdx.json"
  provenance="${OUTPUT_DIR}/midorivpn-extension-${VERSION}-${browser}.provenance.json"

  jq \
    --arg name "${artifact_name}" \
    --arg sha "${artifact_sha}" \
    --arg created "${created}" \
    --arg namespace "https://astian.org/spdx/midorivpn-extension/${VERSION}/${browser}/${artifact_sha}" \
    '.name=$name | .documentNamespace=$namespace | .creationInfo.created=$created |
     .packages[0].name=$name | .packages[0].checksums=[{algorithm:"SHA256",checksumValue:$sha}]' \
    "${raw_sbom}" > "${sbom}"

  jq -n \
    --arg name "${artifact_name}" \
    --arg sha "${artifact_sha}" \
    --arg browser "${browser}" \
    --arg commit "${commit}" \
    --arg version "${VERSION}" \
    --argjson epoch "${epoch}" \
    '{
      _type:"https://in-toto.io/Statement/v1",
      subject:[{name:$name,digest:{sha256:$sha}}],
      predicateType:"https://slsa.dev/provenance/v1",
      predicate:{
        buildDefinition:{
          buildType:"https://astian.org/midorivpn/browser-extension-build/v1",
          externalParameters:{version:$version,browser:$browser,source_date_epoch:$epoch},
          resolvedDependencies:[{uri:"git+https://github.com/goastian/midorivpn-extension",digest:{gitCommit:$commit}}]
        },
        runDetails:{builder:{id:"https://astian.org/midorivpn/rootless-podman-release/v1"}}
      }
    }' > "${provenance}"
done
rm -f -- "${raw_sbom}"

(
  cd "${OUTPUT_DIR}"
  sha256sum -- *.zip *.json > SHA256SUMS
  sha256sum -c SHA256SUMS
)

echo "Extension release evidence: ${OUTPUT_DIR}"
