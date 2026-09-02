# Rebuilding the MidoriVPN extension

The source archive contains the committed source tree plus
`release-build-inputs.json`, which records the public build-time values used by
the release job. It contains no credentials.

Requirements:

- Node.js 24
- npm 12.0.2
- Bash, Git, jq, coreutils, findutils and Info-ZIP

From the extracted source directory, load only the declared public build keys:

```sh
for key in APP_ENV API_URL ACCOUNT_URL PUBLIC_BASE_URL AUTHENTIK_ISSUER \
  AUTHENTIK_AUTHORIZATION_URL AUTHENTIK_CLIENT_ID AUTHENTIK_REDIRECT_URI \
  EXTENSION_CALLBACK_PATH SOURCE_COMMIT SOURCE_DATE_EPOCH; do
  value="$(jq -er --arg key "$key" '.[$key] | tostring' release-build-inputs.json)"
  printf -v "$key" '%s' "$value"
  export "$key"
done
```

Then run:

```sh
npm ci
npm run release:build
```

`APP_ENV` must be `production`. The release command rejects any other value,
and package validation rejects reviewer inputs or extension CSP origins that
belong to a development build.

The command creates separate Firefox and Chromium packages, SPDX JSON SBOMs,
local in-toto/SLSA provenance statements and `SHA256SUMS` under
`release-artifacts/`. The source archive itself is omitted when rebuilding from
an exported tree without Git metadata; the two browser packages remain
reproducible when the recorded `SOURCE_DATE_EPOCH` is supplied.

Compare the rebuilt Firefox ZIP SHA-256 with the Firefox entry in the submitted
`SHA256SUMS`. The exact `web-ext` 10.6.0 dependency then validates the preserved
`dist-firefox` package. Errors and warnings outside the reviewed, source-guarded
allowlist fail the build.
