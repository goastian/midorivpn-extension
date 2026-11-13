# Changelog

## [2.0.0] — Unreleased

- Refresh the compatible development toolchain and force patched `colord`
  and `svgo` transitive releases after new npm advisories, while retaining the
  reviewed development-only `image-size` hardening boundary.

### Security

- Build CI bundles with explicit reserved test origins instead of deployment
  secrets, so public branches and forks can run the complete suite. Release
  and store builds still reject missing real inputs; no runtime fallback added.
- Updated `web-ext` to 10.8.0, pulling in `addons-linter` 10.14.0 and a
  patched `image-size` (2.0.4). The two ICNS/HEIF/JXL infinite-loop advisories
  (`GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`) no longer apply, so the
  expired development-only exceptions were removed;
  `security/vulnerability-exceptions.json` is now empty. The disabled-parser
  hardening boundary remains as defense in depth and is still tested.
- Updated `@vitest/coverage-v8`/`vitest` to 5.0.5, removing a moderate
  `@vitest/mocker` code-injection advisory, development-only.
- Added `glob` (14.0.3) and `minimatch` (11.0.3) overrides for the
  ESLint/TypeScript-ESLint toolchain, removing a high-severity `source-map-js`
  event-loop denial-of-service advisory pulled in via `vue`. `multimatch`
  (used internally by `web-ext lint`) keeps `minimatch` 3.1.4, the newest
  release compatible with its CommonJS default-export usage. The current
  audit does not report a remaining minimatch advisory in this locked graph.
- Refresh transitive `node-forge` to 1.4.3, resolving the remaining moderate
  development-tooling findings without downgrading `web-ext`.
- A low-severity `deepmerge` prototype-pollution advisory
  (`GHSA-gcqx-w48m-w2h4`, pulled in transitively by `addons-linter`) has no
  upstream fix; it is development-only build-time config merging with no
  attacker-controlled input, so no tracked exception was added (the audit
  policy only tracks high/critical findings).

### Features & Enhancements

- Keep the installation UUID across logout while clearing account state and
  pending OAuth transactions, including session storage.
- Allow explicitly configured regional HTTPS probe origins in CSP, without
  broad HTTPS or wildcard sources; reject malformed origin configuration.
- Remove GPU/high-entropy platform detection and unverified zero-log/speed
  claims; clarify that the extension protects browser proxy traffic only.
- Added private vulnerability-reporting and contribution policies, aligned npm
  licensing with the repository's AGPL-3.0-or-later declaration, documented
  AMO's constrained license slug and separated implemented, certified and
  store-published status in public documentation.
- The service-worker runtime is now split into typed OAuth, proxy lifecycle
  and Firefox/Chromium adapter modules. Restart restoration, concurrent OAuth,
  revocation and permission loss are covered by directed tests.
- Automatic proxy selection now measures three strict HTTPS health probes per
  eligible Core, chooses the lowest median RTT and switches after three nearby
  proxy failures. Manual selection remains pinned.
- Failover phase, effective server and 5/10/20/40/60-second jittered backoff
  survive service-worker restarts. With no reachable Core, Firefox and
  Chromium retain a loopback black-hole proxy and retry instead of silently
  returning to direct traffic.
- PKCE uses independent, expiring and bounded transactions, so overlapping
  sign-in flows cannot overwrite each other's verifier.
- Regional proxy credentials remain opaque to the extension and a blocking
  source gate rejects any attempt to open the extension popup
  programmatically.
- Vitest 5 replaces Vitest 4 on its supported Node 24 runtime.
- Release and store builds now require an explicit production environment, and
  reviewer validation rejects development build inputs or CSP origins.
- Firefox packages now declare required authentication, account identity and
  browsing-activity transmission through the built-in consent contract and
  require Firefox 140 or newer.
- Store preparation pins Mozilla `web-ext` 10.6.0, validates reviewed linter
  findings, ships AMO/CWS listing metadata and keeps AMO submission, CWS upload
  and CWS publication behind distinct protected confirmations.
- Release preparation now creates deterministic, browser-specific Firefox and
  Chromium ZIPs, an AMO reviewer source archive, SPDX documents, provenance and
  checksums without publishing to GitHub or either browser store.
- Core API failures now retain their machine-readable code and HTTP status
  across normal requests and token refreshes.
- Chromium proxy authentication now uses the Manifest V3 `asyncBlocking` callback contract, while Firefox and Midori retain their supported Promise-based blocking listener.
- Proxy challenges now receive only short-lived `vpn-proxy` credentials, never refreshed OAuth access tokens. Repeated challenges fail closed without clearing the login session or creating an authentication loop.
- Chromium registers `asyncBlocking` on the native `chrome.webRequest` API; Firefox and Midori use the Promise-capable WebExtension polyfill.
- Concurrent proxy challenges now share one scoped-credential request and one pending authentication response, preventing duplicate OAuth refreshes and callback races during busy page loads.
- Chromium restores `fixed_servers` when the browser restarts with VPN enabled;
  transient credential or edge failures stay fail-closed and retry, while
  definitive authentication/permission failure disables the visible session.
- Chromium end-to-end certification covers clean OAuth, authenticated HTTPS CONNECT, direct disconnect, reconnect, and persistence across browser restart.
- Revoked or invalid extension origins now close the OAuth callback tab and leave a persistent, user-facing explanation in the popup instead of failing silently.
- **Complete UI/UX Refresh**:
  - Modern, sleek interface with an interactive power switch featuring animated pulse states (Connected, Connecting, Disconnected).
  - Server picker with country flags, explicit loading and empty states, and no fabricated latency measurements.
  - User account drawer displaying account identity and direct session management.
  - Responsive popup layout with focused transitions and visible authentication failures.
- **Enhanced Authentication & Security**:
  - Direct PKCE OAuth 2.0 integration with Astian Accounts (`accounts.astian.org`) for unified single sign-on.
  - Resilient token lifecycle management featuring automatic background refresh and encrypted token persistence.
  - Smart callback resolution that automatically verifies state integrity and closes the authentication tab upon success.
  - Granular session recovery ensuring uninterrupted connectivity across browser restarts.
- **High-Performance Proxy Tunneling**:
  - HTTPS CONNECT proxy tunneling selected only from a healthy, enabled `proxy` transport advertised by Core; there is no implicit fallback port.
  - Firefox request routing and Chromium `fixed_servers` preserve direct access
    only for the explicit Control, identity and temporary health-probe allowlist.
  - Scoped authentication tokens preventing unauthorized proxy usage and ensuring private communication.
  - Real-time connection health monitoring with automatic reconnection handling.
  - Rejects non-HTTPS proxy schemes and never falls back to a general access token when scoped proxy credentials are unavailable.
  - Removed the extractable PBKDF2 token-key fallback; tokens use only a non-extractable IndexedDB AES-GCM key.
- **Platform & Permission Refinements**:
  - Separate validated packages for Mozilla Firefox/Midori and Chromium; other Chromium-based browsers use the Chromium package but are not part of the certified matrix.
  - Required network permissions are declared per browser package and any
    later host/API revocation disables proxy mode fail-closed.
  - Optimized lightweight memory footprint with efficient background service worker execution.
- **Toolchain**:
  - Updated direct dependencies to their compatible stable majors, including Babel 8, Pinia 4, jsdom 30 and webpack-dev-server 6.
  - Refreshed every compatible direct patch/minor dependency to the latest
    published version. `web-ext` remains at the latest 10.6.0 release and now
    disables the unused vulnerable ICNS/JXL/HEIF parsers before local lint and
    AMO signing, with a directed fail-closed test.
- Node 24/npm 12 are enforced; Firefox and Chrome production bundles pass
  strict typecheck, lint and tests. Production dependencies audit clean; the
  reviewed `web-ext` development-only image parser exception remains isolated
  by its fail-closed gate until upstream publishes a fix.
- Production packages now remove browser-incompatible background fields, reject development origins in CSP, and validate those invariants during each build.
- Removed redundant `dotenv-webpack`; environment values are injected once through the validated Webpack configuration.
- Firefox and Midori packages now replace every supported build-time `process.env` reference, including diagnostics, application name and permission-page timing. Production builds fail if any Node.js `process` reference survives in emitted JavaScript.
- Authentication and proxy diagnostics no longer print authorization callback URLs, browsing destinations, OAuth codes or state values.

## Archived releases

The entries below describe their original contracts. Retired fields and ports
such as `proxy_port` or the former clear HTTP proxy are not part of 2.0.0.

## [1.0.18] — 2026-06-05

### Fixes

- Empty server list cache no longer sticks for 5 minutes; refetch is forced on
  the next popup open if the cached list was empty (fixes servers not appearing
  after admin enables `proxy_port`).
- Extension now shows the server dropdown correctly when `proxy_port > 0` and
  `supports_proxy = true` are returned by the backend.
- OAuth callback code exchange previously failed on reuse (PKCE code is single-
  use); background now handles the exchange in a single pass.

### Hardening

- Diagnostic (`diag:`) log channel is now opt-in at build time (`DEBUG_DIAG=true`)
  and disabled in production. Changed writer from `console.error` to
  `console.debug` so diag traces appear only in the DevTools Verbose level and
  never as red errors in end-user consoles.
- All `console.*` calls across the codebase are now routed through the central
  `log` utility (`warn`, `error`) so the build can control output uniformly.
- `console.warn` is no longer stripped by terser in production builds; genuine
  warnings (proxy auth failures, token refresh errors) remain visible.
  `console.log`, `console.info`, and `console.debug` are still stripped.
- Removed hot-path `log.diag` calls (server cache hits, message dispatch per
  action) that generated noise without diagnostic value.

### Infrastructure

- nginx stream TCP reverse proxy added for port 8888 (`0.0.0.0:8888` → 
  `127.0.0.1:18888`) to forward HTTP CONNECT tunnel traffic to the core
  container. Firewall port 8888/TCP must be open for proxy mode to work.
- docker-compose port mapping changed to loopback upstream
  (`127.0.0.1:PROXY_HOST_PORT:PROXY_PORT`) to avoid conflicts with nginx
  stream listener.

### DX

- `.env.example` updated with all active variables including `DEBUG_DIAG`,
  `PUBLIC_BASE_URL`, `EXTENSION_CALLBACK_PATH`, and documentation for both
  callback URL derivation strategies.

## [1.0.16] — 2026-06-01

### Seguridad

- Almacenamiento de tokens con clave AES-GCM 256 **no extraíble** en IndexedDB (migración automática).
- Validación estricta del callback OAuth (origen + ruta) además del filtro de navegación.
- CSP endurecida: `default-src 'none'` y `connect-src` acotado a orígenes legítimos.
- Listener del callback OAuth con filtro explícito por URL.
- Renderizado de la página de bienvenida sin `innerHTML`.
- Backoff de reintentos de refresh persistente en `chrome.storage.session`.

### Mejoras

- Pantalla de inicio de sesión rediseñada, con estado de carga.
- Permiso `https://api.github.com/*` retirado del manifest.
- Fuente única de verdad para el servidor activo (plugin de Pinia).
- Mensajería popup ↔ background con payload explícito.
- Logging unificado mediante logger central (info silenciado en producción).
- `webextension-polyfill` activo en el background script.
- Bundle de producción simplificado.

### Calidad interna

- Suite de tests con Vitest 2 + jsdom 25 (22 casos verdes).
- ESLint 9 con flat config: 0 errores, 0 warnings.
- TypeScript estricto verificado en cada build.
- Utilidades puras extraídas: `utils/proxy-routing.ts`, `utils/http.ts`, `lib/oauth.ts`.

### DX

- Nuevos scripts: `lint`, `lint:fix`, `typecheck`, `test`, `test:watch`.
- Versión sincronizada en `package.json` y `manifest/main.json`.
