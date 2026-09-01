# Rebuilding the MidoriVPN extension

The source archive contains the committed source tree plus
`release-build-inputs.json`, which records the public build-time values used by
the release job. It contains no credentials.

Requirements:

- Node.js 24
- npm 12.0.2
- Bash, Git, jq, coreutils, findutils and Info-ZIP

From the extracted source directory, export every value from
`release-build-inputs.json`, then run:

```sh
npm ci
npm run release:build
```

The command creates separate Firefox and Chromium packages, SPDX JSON SBOMs,
local in-toto/SLSA provenance statements and `SHA256SUMS` under
`release-artifacts/`. The source archive itself is omitted when rebuilding from
an exported tree without Git metadata; the two browser packages remain
reproducible when the recorded `SOURCE_DATE_EPOCH` is supplied.
