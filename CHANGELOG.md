# Changelog

## [2.0.0] — 2026-08-23

### Features & Enhancements
- **Complete UI/UX Refresh**:
  - Modern, sleek interface with an interactive power switch featuring animated pulse states (Connected, Connecting, Disconnected).
  - Enhanced server picker with national flags, real-time latency ping indicators, and instant search capability.
  - User account drawer displaying profile avatar, active subscription tier, and one-click session management.
  - Smooth micro-interactions and transitions with full dark and light mode adaptation.
- **Enhanced Authentication & Security**:
  - Direct PKCE OAuth 2.0 integration with Astian Accounts (`accounts.astian.org`) for unified single sign-on.
  - Resilient token lifecycle management featuring automatic background refresh and encrypted token persistence.
  - Smart callback resolution that automatically verifies state integrity and closes the authentication tab upon success.
  - Granular session recovery ensuring uninterrupted connectivity across browser restarts.
- **High-Performance Proxy Tunneling**:
  - High-speed HTTP CONNECT proxy tunneling providing full IP obfuscation and location shielding.
  - Dynamic PAC-based traffic routing that automatically routes web browsing while preserving direct local network access.
  - Scoped authentication tokens preventing unauthorized proxy usage and ensuring private communication.
  - Real-time connection health monitoring with automatic reconnection handling.
- **Platform & Permission Refinements**:
  - Full compatibility across modern Chromium-based browsers (Chrome, Midori, Brave, Edge) and Mozilla Firefox.
  - Transparent, on-demand permission handling requesting only necessary network capabilities during active tunneling.
  - Optimized lightweight memory footprint with efficient background service worker execution.

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
