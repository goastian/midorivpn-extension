// welcome.js — runs inside the welcome/onboarding page.
// Requests <all_urls> host permission with a user gesture so that
// browsers (especially Firefox MV3) show the proper "Always Allow" dialog
// instead of the per-site "Only When Clicked" default.
// Supports ES / EN via the language switcher buttons.

import { hasRequiredVpnPermissions, requestRequiredVpnPermissions } from './utils/permissions';
import { getLatestDownloadUrl } from './utils/download.js';
import { detectDesktopEnvironment } from './utils/platform.js';
import { WELCOME_MESSAGES, resolveWelcomeLocale } from './i18n/welcome';

(function () {
    const parsedCloseDelay = Number.parseInt(process.env.PERMISSIONS_CLOSE_DELAY_SECONDS || '5', 10);
    const closeDelaySeconds = Number.isFinite(parsedCloseDelay) && parsedCloseDelay > 0
        ? parsedCloseDelay
        : 5;

    let currentLang = resolveWelcomeLocale(navigator.language);

    // Renders a string containing at most one <b>...</b> or <em>...</em> tag as
    // real DOM nodes via textContent. Avoids innerHTML to keep the welcome page
    // free of any HTML-injection sink, even though the source strings are
    // static build-time constants.
    function setRichText(el, source) {
        if (!el) return;
        el.textContent = '';
        const match = /^([\s\S]*?)<(b|em)>([\s\S]*?)<\/\2>([\s\S]*)$/.exec(source);
        if (!match) {
            el.textContent = source;
            return;
        }
        const [, prefix, tag, inner, suffix] = match;
        if (prefix) el.appendChild(document.createTextNode(prefix));
        const node = document.createElement(tag);
        node.textContent = inner;
        el.appendChild(node);
        if (suffix) el.appendChild(document.createTextNode(suffix));
    }

    function applyLang(lang) {
        currentLang = lang;
        const t = WELCOME_MESSAGES[lang];
        document.documentElement.lang = lang;

        document.getElementById('t-title').textContent = t.title;
        document.getElementById('t-subtitle').textContent = t.subtitle;
        document.getElementById('t-perm-title').textContent = t.permTitle;
        setRichText(document.getElementById('t-perm-1'), t.perm1);
        setRichText(document.getElementById('t-perm-2'), t.perm2);
        setRichText(document.getElementById('t-perm-3'), t.perm3);
        document.getElementById('t-btn-grant').textContent = t.btnGrant;
        document.getElementById('t-btn-skip').textContent = t.btnSkip;
        document.getElementById('t-status-ok').textContent = t.statusOk;
        document.getElementById('t-status-err').textContent = t.statusErr;
        document.getElementById('t-desktop-badge').textContent = t.desktopBadge;
        setRichText(document.getElementById('t-desktop-title'), t.desktopTitle);
        document.getElementById('t-desktop-desc').textContent = t.desktopDesc;
        document.getElementById('t-desktop-btn').textContent = t.desktopBtn;
        document.getElementById('t-pill-2').textContent = t.desktopPill2;
        document.getElementById('t-pill-3').textContent = t.desktopPill3;
        document.getElementById('t-desktop-platforms').textContent = t.desktopPlatforms;

        document.querySelectorAll('.lang-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
    }

    // Initial render
    applyLang(currentLang);

    // Set desktop CTA href from build-time env
    // Resolve the best download URL for the user's OS (async, non-blocking)
    const ctaEl = document.getElementById('desktop-cta');
    const desktopSection = document.getElementById('desktop-section');

    detectDesktopEnvironment().then((env) => {
      if (env.confidence === 'mobile') {
        // Hide the entire desktop download section on phones/tablets
        if (desktopSection) desktopSection.style.display = 'none';
        return;
      }
      getLatestDownloadUrl().then((url) => { ctaEl.href = url; });
    });

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
        const confirmed = granted || await hasRequiredVpnPermissions();
        if (confirmed) {
            showSuccess();
        } else {
            btnGrant.disabled = false;
            statusErrText.textContent = WELCOME_MESSAGES[currentLang].statusErr;
            statusErr.classList.add('visible');
        }
    });

    btnSkip.addEventListener('click', () => window.close());

    function showSuccess() {
        btnGrant.style.display = 'none';
        btnSkip.style.display = 'none';
        statusErr.classList.remove('visible');

        let seconds = closeDelaySeconds;
        const renderCountdown = () => {
            const t = WELCOME_MESSAGES[currentLang];
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
