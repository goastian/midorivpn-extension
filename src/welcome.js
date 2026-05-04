// welcome.js — runs inside the welcome/onboarding page.
// Requests <all_urls> host permission with a user gesture so that
// browsers (especially Firefox MV3) show the proper "Always Allow" dialog
// instead of the per-site "Only When Clicked" default.
// Supports ES / EN via the language switcher buttons.

import { hasRequiredVpnPermissions, requestRequiredVpnPermissions } from './utils/permissions.js';

(function () {
    // ── i18n ────────────────────────────────────────────────────────────────
    const STRINGS = {
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
        },
    };

    // Detect browser language; fall back to 'es'
    const browserLang = (navigator.language || 'es').slice(0, 2).toLowerCase();
    let currentLang = STRINGS[browserLang] ? browserLang : 'es';

    function applyLang(lang) {
        currentLang = lang;
        const t = STRINGS[lang];
        document.documentElement.lang = lang;

        document.getElementById('t-title').textContent = t.title;
        document.getElementById('t-subtitle').textContent = t.subtitle;
        document.getElementById('t-perm-title').textContent = t.permTitle;
        document.getElementById('t-perm-1').innerHTML = t.perm1;
        document.getElementById('t-perm-2').innerHTML = t.perm2;
        document.getElementById('t-perm-3').innerHTML = t.perm3;
        document.getElementById('t-btn-grant').textContent = t.btnGrant;
        document.getElementById('t-btn-skip').textContent = t.btnSkip;
        document.getElementById('t-status-ok').textContent = t.statusOk;
        document.getElementById('t-status-err').textContent = t.statusErr;

        document.querySelectorAll('.lang-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    // Initial render
    applyLang(currentLang);

    // Lang switcher buttons
    document.querySelectorAll('.lang-btn').forEach((btn) => {
        btn.addEventListener('click', () => applyLang(btn.dataset.lang));
    });

    // ── Permission logic ─────────────────────────────────────────────────────
    const btnGrant = document.getElementById('btn-grant');
    const btnSkip = document.getElementById('btn-skip');
    const statusOk = document.getElementById('status-ok');
    const statusErr = document.getElementById('status-err');
    const statusOkText = document.getElementById('t-status-ok');
    const statusErrText = document.getElementById('t-status-err');
    let closeTimer = null;

    function hideStatuses() {
        statusOk.classList.remove('visible');
        statusErr.classList.remove('visible');
    }

    btnGrant.addEventListener('click', async () => {
        btnGrant.disabled = true;
        hideStatuses();

        const granted = await requestRequiredVpnPermissions();
        const confirmed = granted && await hasRequiredVpnPermissions();
        if (confirmed) {
            showSuccess();
        } else {
            btnGrant.disabled = false;
            statusErrText.textContent = STRINGS[currentLang].statusErr;
            statusErr.classList.add('visible');
        }
    });

    btnSkip.addEventListener('click', () => window.close());

    function showSuccess() {
        btnGrant.style.display = 'none';
        btnSkip.style.display = 'none';
        statusErr.classList.remove('visible');

        let seconds = 5;
        const renderCountdown = () => {
            const t = STRINGS[currentLang];
            statusOkText.textContent = `${t.statusOk} ${t.statusClosing.replace('{seconds}', seconds)}`;
        };

        renderCountdown();
        statusOk.classList.add('visible');

        clearInterval(closeTimer);
        closeTimer = setInterval(() => {
            seconds -= 1;
            if (seconds <= 0) {
                clearInterval(closeTimer);
                window.close();
                return;
            }
            renderCountdown();
        }, 1000);
    }
})();
