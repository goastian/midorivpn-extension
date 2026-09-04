# Security policy

## Supported versions

MidoriVPN browser extension 2.0.0 is currently unreleased. Security fixes are
applied to the 2.0.0 development line, but that source must not be treated as a
supported or store-published release. Earlier release lines are no longer
maintained by this repository.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use the
[private GitHub security advisory form](https://github.com/goastian/midorivpn-extension/security/advisories/new).
Report a Core API or cross-component issue in the
[Core repository](https://github.com/goastian/midori-vpn-core/security/advisories/new)
and identify the extension as affected.

Include the affected version or commit, browser and version, a minimal
reproduction and impact. Remove OAuth codes, tokens, browsing destinations,
extension IDs tied to private deployments, proxy credentials and user data.
Never send live credentials or production data.

## Response and disclosure

The maintainers aim to acknowledge a complete report within three business
days and provide an initial triage within seven business days. Please keep the
report private until a fix and disclosure date are agreed. Validated fixes must
pass both browser builds, permission, authentication, proxy and package gates
before a release is announced.

Reports involving OAuth/PKCE, token storage, extension origins, permissions,
proxy bypass, credential scope, CSP or store-package integrity are in scope.
