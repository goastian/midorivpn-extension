# Changelog

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
