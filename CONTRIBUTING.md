# Contributing to the MidoriVPN browser extension

MidoriVPN browser extension 2.0.0 is unreleased and has not been published to
browser stores. Contributions must preserve separate Firefox/Midori and
Chromium packages and must not open the popup programmatically.

## Before starting

- Use a public issue for bugs and behavior proposals.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Keep OAuth credentials, private callback origins, browsing destinations,
  store credentials and local release evidence out of commits and issues.
- Explain permission, authentication, proxy or store-metadata changes
  explicitly.

## Development and checks

Use the pinned rootless runner from a Core checkout:

```bash
CORE_REPO=/absolute/path/to/midori-vpn-core
bash "$CORE_REPO/scripts/pod.sh" npm ci
bash "$CORE_REPO/scripts/pod.sh" npm run check
bash "$CORE_REPO/scripts/pod.sh" npm run test:audit-policy
bash "$CORE_REPO/scripts/pod.sh" npm run audit:security
```

Shared runtime changes must pass type checking, lint, unit tests, the anti-popup
gate and both production browser builds. Permission or packaging changes also
require the Firefox package linter and store-release validation appropriate to
the change. Building evidence never authorizes a store upload or publication.

Use the newest compatible dependency release; document any temporary security
exception precisely and with an expiry. Update `[2.0.0] — Unreleased` in
`CHANGELOG.md` for visible, security or operational changes. Before submitting,
run `git diff --check` and describe browser-specific behavior, tests,
permissions and risk in the pull request.

## License

By contributing, you agree that your contribution is licensed under
AGPL-3.0-or-later, as described in [LICENSE](LICENSE).
