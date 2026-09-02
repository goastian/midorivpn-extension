# Browser store release gates

Building release evidence never contacts AMO or the Chrome Web Store. Store
operations are separate manual workflows protected by GitHub environments and
literal confirmations. The working branch `dev-wedc` is local-only and must not
be used to run them.

## Immutable package inputs

- Version: `2.0.0` in `package.json` and both generated manifests.
- Firefox add-on ID: `midorivpn@astian.org`.
- `web-ext`: exactly `10.6.0` from `package-lock.json`.
- Firefox/Midori package: `midorivpn-extension-2.0.0-firefox.zip`.
- Chromium package: `midorivpn-extension-2.0.0-chrome.zip`.
- AMO source: `midorivpn-extension-2.0.0-source.zip`.

Run `npm run release:build` first. It applies `web-ext lint`, failing on errors
or warnings outside the reviewed source-guarded allowlist; validates both ZIP
manifests; rejects Node.js `process` references; checks store metadata; and
produces SPDX, provenance and `SHA256SUMS`.

## AMO

Mozilla `web-ext sign` uses the add-on submission API v5. A `listed` channel
submission creates or updates the public listing, so it is treated as a
publication action rather than a harmless package upload.

Required protected environment: `extension-store-submit`.

- Secrets: `AMO_API_KEY`, `AMO_API_SECRET`.
- Approval: required reviewer before deployment.
- Branch/tag policy: annotated release tag only.
- Confirmation: `SUBMIT_MIDORIVPN_2.0.0_TO_AMO`.

The workflow sends `store/amo/metadata.json`, the generated Firefox source and
the reviewer source archive. No API credentials or reviewer accounts belong in
the repository.

## Chrome Web Store

The v2 API has three distinct operations used here:

- `POST /upload/v2/publishers/{publisher}/items/{item}:upload` uploads a ZIP.
- `GET /v2/publishers/{publisher}/items/{item}:fetchStatus` reads its status.
- `POST /v2/publishers/{publisher}/items/{item}:publish` submits it for review
  and publication.

Upload and publish use different workflows and protected environments.

### Upload gate

Environment: `extension-store-upload`; confirmation
`UPLOAD_MIDORIVPN_2.0.0_TO_CWS`.

### Publication gate

Environment: `extension-store-publish`; confirmation
`PUBLISH_MIDORIVPN_2.0.0_TO_CWS`. Require a reviewer distinct from the upload
operator when repository policy permits it.

Both environments require:

- Variables: `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`,
  `CWS_PRIVACY_POLICY_URL` (public HTTPS URL).
- Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

The publisher and item IDs are intentionally not guessed. They must be copied
from the owning Chrome Web Store dashboard before either workflow can pass.

`store/chrome/listing.json` is a reviewable dashboard checklist, not an API
payload: CWS v2 manages packages and publication status, while listing,
privacy, distribution and test instructions must be completed in the dashboard.
Before first upload the operator must also provide a public privacy-policy URL,
add screenshots and ensure the listing/privacy declarations match that file.

Official contracts:

- https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
- https://developer.chrome.com/docs/webstore/using-api
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
