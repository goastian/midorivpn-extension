export const WELCOME_MESSAGES = {
    es: {
        title: 'Bienvenido a MidoriVPN',
        subtitle: 'Para que la VPN funcione correctamente en todos los sitios web, necesitamos que autorices el acceso al tráfico del navegador.',
        permTitle: 'Permisos requeridos',
        perm1: '<b>Leer y modificar datos en todos los sitios</b> — necesario para enrutar el tráfico a través del servidor VPN.',
        perm2: '<b>Gestionar proxy y solicitudes de red</b> — para conectarte al servidor VPN de forma segura.',
        perm3: '<b>Almacenamiento local</b> — para guardar tu sesión y configuración.',
        btnGrant: 'Conceder permisos requeridos',
        btnSkip: 'Cerrar',
        statusOk: '¡Permisos concedidos! Ya puedes usar MidoriVPN.',
        statusClosing: 'Esta pestaña se cerrará en {seconds}s.',
        statusErr: 'Permisos denegados. La VPN no funcionará correctamente.',
        desktopBadge: 'Novedad',
        desktopTitle: 'Tu privacidad, <em>sin límites</em>',
        desktopDesc: 'La extensión es solo el principio. Con el cliente de escritorio obtienes Mesh VPN, protección siempre activa y rendimiento nativo completo.',
        desktopBtn: 'Descargar cliente de escritorio',
        desktopPill2: '🛡️ Siempre activo',
        desktopPill3: '💻 Multi-plataforma',
        desktopPlatforms: 'Disponible para Windows · macOS · Linux',
    },
    en: {
        title: 'Welcome to MidoriVPN',
        subtitle: 'To route your traffic through the VPN on every website, we need you to grant access to browser network requests.',
        permTitle: 'Required permissions',
        perm1: '<b>Read and change data on all websites</b> — needed to route traffic through the VPN server.',
        perm2: '<b>Manage proxy and network requests</b> — to connect securely to the VPN server.',
        perm3: '<b>Local storage</b> — to save your session and settings.',
        btnGrant: 'Grant required permissions',
        btnSkip: 'Close',
        statusOk: 'Permissions granted! You can now use MidoriVPN.',
        statusClosing: 'This tab will close in {seconds}s.',
        statusErr: 'Permissions denied. The VPN will not work correctly.',
        desktopBadge: 'New',
        desktopTitle: 'Your privacy, <em>unleashed</em>',
        desktopDesc: 'The extension is just the beginning. The desktop client gives you Mesh VPN, always-on protection and full native performance.',
        desktopBtn: 'Download desktop client',
        desktopPill2: '🛡️ Always-on',
        desktopPill3: '💻 Multi-platform',
        desktopPlatforms: 'Available for Windows · macOS · Linux',
    },
} as const;

export type WelcomeLocale = keyof typeof WELCOME_MESSAGES;

export function resolveWelcomeLocale(language: string | undefined): WelcomeLocale {
    const candidate = (language || 'es').slice(0, 2).toLowerCase();
    return Object.hasOwn(WELCOME_MESSAGES, candidate) ? candidate as WelcomeLocale : 'es';
}
