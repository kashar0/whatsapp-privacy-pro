/**
 * WhatsApp Privacy Pro — Content Script v2
 * Core privacy engine injected into web.whatsapp.com
 *
 * Architecture:
 *  - CSS class toggling on <body> drives all blur states
 *  - MutationObserver ensures dynamically loaded DOM stays blurred
 *  - Lock overlay is injected/removed as a DOM element
 *  - Auto-lock uses idle timer reset on user interaction
 */

(function () {
  'use strict';

  if (window.__wppInjected) return;
  window.__wppInjected = true;

  let settings = {};
  let idleTimer = null;
  let observer = null;
  let isLocked = false;

  // ── SHA-256 Hashing ────────────────────────
  async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Apply / Remove Privacy Classes ─────────
  function applyPrivacyState() {
    const body = document.body;
    if (!body) return;

    const enabled = settings.privacyEnabled;

    body.classList.toggle('wpp-privacy-active', enabled && settings.blurMessages);
    body.classList.toggle('wpp-blur-lastmsg', enabled && settings.blurLastMessage);
    body.classList.toggle('wpp-blur-media', enabled && settings.blurMedia);
    body.classList.toggle('wpp-blur-profilepic', enabled && settings.blurProfilePics);
    body.classList.toggle('wpp-blur-names', enabled && settings.blurContactNames);
    body.classList.toggle('wpp-hover-reveal', enabled && settings.hoverReveal);
    body.classList.toggle('wpp-snapshot-protect', enabled && settings.snapshotProtection);

    const intensity = settings.blurIntensity || 8;
    document.documentElement.style.setProperty('--wpp-blur', `${intensity}px`);
    document.documentElement.style.setProperty('--wpp-blur-heavy', `${Math.round(intensity * 1.5)}px`);
  }

  // ── MutationObserver (debounced) ───────────
  let mutationDebounce = null;

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => {
        if (document.body && settings.privacyEnabled) {
          applyPrivacyState();
        }
      }, 150);
    });

    const target = document.getElementById('app') || document.body;
    observer.observe(target, { childList: true, subtree: true });
  }

  // ── Lock Overlay ───────────────────────────
  function showLockOverlay() {
    if (document.getElementById('wpp-lock-overlay')) return;
    isLocked = true;

    const overlay = document.createElement('div');
    overlay.id = 'wpp-lock-overlay';

    const card = document.createElement('div');
    card.className = 'wpp-lock-card';

    // Icon
    const iconWrap = document.createElement('div');
    iconWrap.className = 'wpp-lock-icon';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z');
    svg.appendChild(path);
    iconWrap.appendChild(svg);
    card.appendChild(iconWrap);

    const title = document.createElement('h2');
    title.textContent = 'WhatsApp is Locked';
    card.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'Enter your 4-digit PIN to unlock';
    card.appendChild(desc);

    // PIN inputs
    const pinRow = document.createElement('div');
    pinRow.className = 'wpp-pin-input-row';

    const inputs = [];
    for (let i = 0; i < 4; i++) {
      const input = document.createElement('input');
      input.type = 'password';
      input.className = 'wpp-pin-digit';
      input.maxLength = 1;
      input.inputMode = 'numeric';
      input.pattern = '[0-9]';
      input.setAttribute('aria-label', `PIN digit ${i + 1}`);
      inputs.push(input);
      pinRow.appendChild(input);
    }
    card.appendChild(pinRow);

    inputs.forEach((inp, idx) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '');
        if (inp.value && idx < 3) inputs[idx + 1].focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && idx > 0) {
          inputs[idx - 1].focus();
        }
        if (e.key === 'Enter') unlockBtn.click();
      });
    });

    // Unlock button
    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'wpp-unlock-btn';
    unlockBtn.textContent = 'Unlock';
    unlockBtn.setAttribute('aria-label', 'Unlock WhatsApp');
    card.appendChild(unlockBtn);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'wpp-error-msg';
    card.appendChild(errorMsg);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => inputs[0].focus(), 100);

    unlockBtn.addEventListener('click', async () => {
      const pin = inputs.map(i => i.value).join('');
      if (pin.length < 4) {
        errorMsg.textContent = 'Enter all 4 digits';
        return;
      }

      const hash = await sha256(pin);
      if (hash === settings.pinHash) {
        overlay.remove();
        isLocked = false;
        resetIdleTimer();
      } else {
        errorMsg.textContent = 'Incorrect PIN. Try again.';
        inputs.forEach(i => {
          i.value = '';
          i.classList.add('wpp-error');
        });
        setTimeout(() => {
          inputs.forEach(i => i.classList.remove('wpp-error'));
          inputs[0].focus();
        }, 400);
      }
    });

    // Re-inject if removed via DevTools
    const bodyObserver = new MutationObserver(() => {
      if (isLocked && !document.getElementById('wpp-lock-overlay')) {
        document.body.appendChild(overlay);
      }
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  // ── Auto-Lock Timer ────────────────────────
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!settings.autoLockEnabled || !settings.pinEnabled || !settings.pinHash) return;

    const minutes = settings.autoLockMinutes || 5;
    idleTimer = setTimeout(() => {
      if (!isLocked) showLockOverlay();
    }, minutes * 60 * 1000);
  }

  function setupIdleListeners() {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => {
      document.addEventListener(evt, () => {
        if (!isLocked) resetIdleTimer();
      }, { passive: true });
    });
  }

  // ── Stealth Mode ───────────────────────────
  function applyStealthMode() {
    const existingStealth = document.getElementById('wpp-stealth-style');
    if (existingStealth) existingStealth.remove();

    if (!settings.privacyEnabled) return;

    const rules = [];

    if (settings.hideOnlineStatus) {
      rules.push(`
        [data-testid="conversation-header"] span[title*="online"],
        [data-testid="conversation-header"] [data-testid*="last-seen"] {
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }
      `);
    }

    if (rules.length > 0) {
      const style = document.createElement('style');
      style.id = 'wpp-stealth-style';
      style.textContent = rules.join('\n');
      document.head.appendChild(style);
    }
  }

  // ── Snapshot Protection ────────────────────
  function setupSnapshotProtection() {
    document.addEventListener('visibilitychange', () => {
      if (!settings.snapshotProtection || !settings.privacyEnabled) return;
      if (document.visibilityState === 'hidden') {
        document.documentElement.style.setProperty('--wpp-blur', '20px');
        document.documentElement.style.setProperty('--wpp-blur-heavy', '30px');
      } else {
        const intensity = settings.blurIntensity || 8;
        document.documentElement.style.setProperty('--wpp-blur', `${intensity}px`);
        document.documentElement.style.setProperty('--wpp-blur-heavy', `${Math.round(intensity * 1.5)}px`);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!settings.snapshotProtection || !settings.privacyEnabled) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        e.stopImmediatePropagation();
        showToast('Print blocked by Privacy Pro');
      }
    }, true);
  }

  // ── Toast Notification ─────────────────────
  function showToast(text) {
    let toast = document.getElementById('wpp-toast');
    if (toast) toast.remove();

    toast = document.createElement('div');
    toast.id = 'wpp-toast';
    toast.textContent = text;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '999999',
      padding: '10px 20px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #667eea, #764ba2)',
      color: 'white',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 20px rgba(102,126,234,0.4)',
      opacity: '0',
      transition: 'opacity 0.3s ease'
    });
    document.body.appendChild(toast);

    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ── Message Bridge ─────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'updateSettings') {
      settings = { ...settings, ...msg.settings };
      applyPrivacyState();
      applyStealthMode();
      resetIdleTimer();
      sendResponse({ ok: true });
    }

    if (msg.action === 'togglePrivacy') {
      settings.privacyEnabled = !settings.privacyEnabled;
      StorageUtil.set({ privacyEnabled: settings.privacyEnabled });
      applyPrivacyState();
      applyStealthMode();
      showToast(settings.privacyEnabled ? 'Privacy ON' : 'Privacy OFF');
      sendResponse({ privacyEnabled: settings.privacyEnabled });
    }

    if (msg.action === 'lockNow') {
      if (settings.pinEnabled && settings.pinHash) {
        showLockOverlay();
      }
      sendResponse({ ok: true });
    }

    if (msg.action === 'getState') {
      sendResponse({
        privacyEnabled: settings.privacyEnabled,
        isLocked: isLocked
      });
    }

    return true;
  });

  // ── Initialization ─────────────────────────
  async function init() {
    settings = await StorageUtil.getAll();
    applyPrivacyState();
    applyStealthMode();
    startObserver();
    setupIdleListeners();
    setupSnapshotProtection();
    resetIdleTimer();

    if (settings.pinEnabled && settings.pinHash) {
      showLockOverlay();
    }
  }

  function waitForApp() {
    const appEl = document.getElementById('app');
    if (appEl && appEl.children.length > 0) {
      init();
    } else {
      setTimeout(waitForApp, 500);
    }
  }

  if (document.readyState === 'complete') {
    waitForApp();
  } else {
    window.addEventListener('load', waitForApp);
  }
})();
