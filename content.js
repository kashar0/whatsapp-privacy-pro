/**
 * WhatsApp Privacy Pro — Content Script v1.3.2
 *
 * CHANGES in v1.3.2:
 *
 *  UX:
 *   1. Per-chat rule button moved from floating pill (bottom-right,
 *      intrusive) to a small icon in the conversation header — lives
 *      next to WhatsApp's own search/menu icons. Click to cycle rule;
 *      tooltip shows current rule and the next state.
 *
 *  SECURITY:
 *   2. Notification masking rewritten. The interceptor now runs in the
 *      PAGE world (via injected <script>) so it actually intercepts
 *      WhatsApp's own new Notification() calls — the isolated-world
 *      version only saw extension-scope calls. Flags are now passed
 *      via postMessage with an origin check instead of globals.
 *   3. PIN brute-force protection: after 5 failed attempts, unlock is
 *      blocked for 5 minutes (persisted in storage, survives reload).
 *   4. Constant-time PIN hash comparison — no timing side channel.
 *   5. Chat rules use Object.create(null) to block prototype-pollution
 *      via crafted chat names.
 */

(function () {
  'use strict';

  if (window.__wppInjected) return;
  window.__wppInjected = true;

  let settings = {};
  let idleTimer = null;
  let mainObserver = null;
  let isLocked = false;

  // ── SHA-256 ────────────────────────────────────
  async function sha256(message) {
    const buf = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // v1.3.2: constant-time string compare
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ── Avatar tagging (unchanged from v1.3.1) ─────
  function tagAvatarImages() {
    const allImgs = document.querySelectorAll(
      '#pane-side img, #pane-header img, [data-testid="conversation-header"] img'
    );
    allImgs.forEach(img => {
      const w = img.naturalWidth || img.width || img.offsetWidth;
      if (w > 0 && w < 20) return;
      if (img.closest('[data-icon]')) return;
      img.classList.add('wpp-avatar-img');
    });
    document.querySelectorAll(
      '#main header img, [data-testid="conversation-header"] img'
    ).forEach(img => {
      if (img.closest('[data-icon]')) return;
      img.classList.add('wpp-avatar-img');
    });
  }

  function tagContactNames() {
    const titleCells = document.querySelectorAll(
      '#pane-side [role="listitem"] [data-testid="cell-frame-title"], ' +
      '#pane-side [role="listitem"] [data-testid="chatlist-item-title"], ' +
      '#pane-side [role="row"] [data-testid="cell-frame-title"]'
    );
    titleCells.forEach(cell => {
      const span = cell.querySelector('span[dir], span[title], span');
      if (span) span.classList.add('wpp-contact-name');
    });
    document.querySelectorAll(
      '#pane-side [role="listitem"] span[title][dir], ' +
      '#pane-side [role="row"] span[title][dir]'
    ).forEach(span => span.classList.add('wpp-contact-name'));
    const headerTitle = document.querySelector(
      '[data-testid="conversation-info-header-chat-title"] span, ' +
      '[data-testid="conversation-header"] header span[dir], ' +
      '#main header span[dir]'
    );
    if (headerTitle) headerTitle.classList.add('wpp-contact-name');
  }

  // ── Active chat name ───────────────────────────
  function getActiveChatName() {
    const el =
      document.querySelector('[data-testid="conversation-info-header-chat-title"] span') ||
      document.querySelector('[data-testid="conversation-header"] header span[dir]') ||
      document.querySelector('#main header span[dir]');
    return el ? el.textContent.trim() : null;
  }

  // v1.3.2: prototype-safe rule lookup
  function currentChatRule() {
    const name = getActiveChatName();
    if (!name || !settings.chatRules) return 'default';
    // Use hasOwnProperty to block __proto__ / constructor injection attempts
    if (!Object.prototype.hasOwnProperty.call(settings.chatRules, name)) return 'default';
    const rule = settings.chatRules[name];
    return (rule === 'always' || rule === 'never') ? rule : 'default';
  }

  // ── Apply privacy classes ──────────────────────
  function applyPrivacyState() {
    const body = document.body;
    if (!body) return;

    const enabled = settings.privacyEnabled;
    const rule    = currentChatRule();
    const forceOn  = rule === 'always';
    const forceOff = rule === 'never';
    const effectiveEnabled = forceOn ? true : (forceOff ? false : enabled);

    body.classList.toggle('wpp-privacy-active',  effectiveEnabled && settings.blurMessages);
    body.classList.toggle('wpp-blur-lastmsg',     enabled && settings.blurLastMessage);
    body.classList.toggle('wpp-blur-media',       effectiveEnabled && settings.blurMedia);
    body.classList.toggle('wpp-blur-profilepic',  enabled && settings.blurProfilePics);
    body.classList.toggle('wpp-blur-names',       enabled && settings.blurContactNames);
    body.classList.toggle('wpp-hover-reveal',     enabled && settings.hoverReveal);
    body.classList.toggle('wpp-snapshot-protect', enabled && settings.snapshotProtection);
    body.classList.toggle('wpp-blur-compose',     enabled && settings.blurCompose);
    body.classList.toggle('wpp-chat-exempt',      enabled && forceOff);

    const intensity = settings.blurIntensity || 8;
    document.documentElement.style.setProperty('--wpp-blur',       `${intensity}px`);
    document.documentElement.style.setProperty('--wpp-blur-heavy', `${Math.round(intensity * 1.5)}px`);

    tagAvatarImages();
    tagContactNames();
    updateHeaderButton();
  }

  // ─────────────────────────────────────────────
  //  v1.3.2: HEADER ICON BUTTON (replaces pill)
  //  Small shield icon injected into #main header's
  //  right-side icon bar. Sits inline with WhatsApp's
  //  own search/menu icons — never overlaps chat.
  // ─────────────────────────────────────────────
  let headerBtn = null;
  let headerTooltip = null;

  function buildHeaderButton() {
    if (headerBtn) return;
    headerBtn = document.createElement('button');
    headerBtn.id = 'wpp-header-btn';
    headerBtn.type = 'button';
    headerBtn.setAttribute('aria-label', 'Privacy Pro — chat rule');

    // Shield SVG — stroke colour reflects current rule
    const shieldSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    shieldSVG.setAttribute('viewBox', '0 0 24 24');
    shieldSVG.setAttribute('width', '20');
    shieldSVG.setAttribute('height', '20');
    shieldSVG.setAttribute('fill', 'none');
    shieldSVG.setAttribute('stroke', '#8696a0');
    shieldSVG.setAttribute('stroke-width', '2');
    shieldSVG.setAttribute('stroke-linecap', 'round');
    shieldSVG.setAttribute('stroke-linejoin', 'round');
    shieldSVG.id = 'wpp-header-icon';
    const shieldPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shieldPath.setAttribute('d', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z');
    shieldSVG.appendChild(shieldPath);
    headerBtn.appendChild(shieldSVG);

    // Tooltip
    headerTooltip = document.createElement('span');
    headerTooltip.id = 'wpp-header-tooltip';
    headerBtn.appendChild(headerTooltip);

    headerBtn.addEventListener('click', cycleCurrentChatRule);
  }

  function updateHeaderButton() {
    if (!headerBtn) return;
    const inChat = !!document.querySelector('#main header');
    const shouldShow = settings.privacyEnabled && inChat;

    if (!shouldShow) {
      headerBtn.remove();
      return;
    }

    // Inject into header's rightmost action container
    const headerRight =
      document.querySelector('#main header > div:last-child') ||
      document.querySelector('#main header > header > div:last-child') ||
      document.querySelector('#main header [role="button"]')?.parentElement;

    if (headerRight && !headerRight.contains(headerBtn)) {
      headerRight.appendChild(headerBtn);
    }

    // Update icon fill + tooltip to reflect current rule
    const rule = currentChatRule();
    const icon = headerBtn.querySelector('#wpp-header-icon');
    if (icon) {
      icon.setAttribute('fill', rule === 'always' ? 'rgba(0,168,132,0.2)' :
                                rule === 'never'  ? 'rgba(239,68,68,0.15)' : 'none');
      icon.setAttribute('stroke', rule === 'always' ? '#00a884' :
                                  rule === 'never'  ? '#ef4444' : '#8696a0');
    }
    const labels = { always: 'Always blur', never: 'Never blur', default: 'Default' };
    const next   = { always: 'never', never: 'default', default: 'always' };
    if (headerTooltip) {
      headerTooltip.textContent = `${labels[rule]} — click for ${labels[next[rule]]}`;
    }
  }

  async function cycleCurrentChatRule() {
    const chatName = getActiveChatName();
    if (!chatName) return;

    // v1.3.2: prototype-safe object handling
    const rules = Object.create(null);
    if (settings.chatRules) {
      for (const k of Object.keys(settings.chatRules)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        rules[k] = settings.chatRules[k];
      }
    }
    const current = Object.prototype.hasOwnProperty.call(rules, chatName)
      ? rules[chatName] : 'default';
    const cycle = { default: 'always', always: 'never', never: 'default' };
    const next = cycle[current];

    if (next === 'default') {
      delete rules[chatName];
    } else {
      rules[chatName] = next;
    }
    settings.chatRules = rules;
    await StorageUtil.set({ chatRules: { ...rules } });

    applyPrivacyState();

    const msg = { always: 'Always blur', never: 'Never blur', default: 'Default' };
    showToast(`"${chatName.length > 24 ? chatName.slice(0, 24) + '…' : chatName}": ${msg[next]}`);
  }

  // ── MutationObserver (debounced) ───────────────
  let mutationDebounce = null;

  function startObserver() {
    if (mainObserver) mainObserver.disconnect();
    mainObserver = new MutationObserver(() => {
      clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => {
        if (document.body) applyPrivacyState();
      }, 150);
    });
    const target = document.getElementById('app') || document.body;
    mainObserver.observe(target, { childList: true, subtree: true });
  }

  // ─────────────────────────────────────────────
  //  v1.3.2: LOCK OVERLAY with rate-limiting
  // ─────────────────────────────────────────────
  function showLockOverlay() {
    if (document.getElementById('wpp-lock-overlay')) return;
    isLocked = true;

    const overlay = document.createElement('div');
    overlay.id = 'wpp-lock-overlay';

    const card = document.createElement('div');
    card.className = 'wpp-lock-card';

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
        if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
        if (e.key === 'Enter') unlockBtn.click();
      });
    });

    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'wpp-unlock-btn';
    unlockBtn.textContent = 'Unlock';
    card.appendChild(unlockBtn);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'wpp-error-msg';
    card.appendChild(errorMsg);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(() => inputs[0].focus(), 100);

    // v1.3.2: check rate-limit on overlay open and every second after
    const MAX_FAILS   = 5;
    const LOCKOUT_MS  = 5 * 60 * 1000;

    async function checkLockout() {
      const s = await StorageUtil.getAll();
      const now = Date.now();
      if (s.pinLockUntil && s.pinLockUntil > now) {
        const mins = Math.ceil((s.pinLockUntil - now) / 60000);
        inputs.forEach(i => { i.disabled = true; });
        unlockBtn.disabled = true;
        unlockBtn.style.opacity = '0.5';
        unlockBtn.style.cursor = 'not-allowed';
        errorMsg.textContent = `Too many failed attempts. Try again in ${mins} min.`;
        return true;
      }
      inputs.forEach(i => { i.disabled = false; });
      unlockBtn.disabled = false;
      unlockBtn.style.opacity = '';
      unlockBtn.style.cursor  = '';
      return false;
    }
    checkLockout();
    const lockoutPoll = setInterval(checkLockout, 1000);

    unlockBtn.addEventListener('click', async () => {
      if (await checkLockout()) return;

      const pin = inputs.map(i => i.value).join('');
      if (pin.length < 4) { errorMsg.textContent = 'Enter all 4 digits'; return; }

      const hash = await sha256(pin);

      // v1.3.2: timing-safe comparison
      if (timingSafeEqual(hash, settings.pinHash || '')) {
        // Success — reset fail counter
        await StorageUtil.set({ pinFailCount: 0, pinLockUntil: 0 });
        clearInterval(lockoutPoll);
        overlay.remove();
        isLocked = false;
        resetIdleTimer();
      } else {
        // v1.3.2: track failed attempts
        const s = await StorageUtil.getAll();
        const fails = (s.pinFailCount || 0) + 1;
        const update = { pinFailCount: fails };
        if (fails >= MAX_FAILS) {
          update.pinLockUntil  = Date.now() + LOCKOUT_MS;
          update.pinFailCount  = 0;
          errorMsg.textContent = 'Too many failed attempts. Locked for 5 min.';
        } else {
          errorMsg.textContent = `Incorrect PIN. ${MAX_FAILS - fails} attempt(s) left.`;
        }
        await StorageUtil.set(update);
        inputs.forEach(i => { i.value = ''; i.classList.add('wpp-error'); });
        setTimeout(() => {
          inputs.forEach(i => i.classList.remove('wpp-error'));
          if (!inputs[0].disabled) inputs[0].focus();
        }, 400);
      }
    });

    // Re-inject overlay if removed via DevTools
    const bodyObserver = new MutationObserver(() => {
      if (isLocked && !document.getElementById('wpp-lock-overlay')) {
        document.body.appendChild(overlay);
      }
    });
    bodyObserver.observe(document.body, { childList: true });
  }

  // ── Auto-Lock Timer ────────────────────────────
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!settings.autoLockEnabled || !settings.pinEnabled || !settings.pinHash) return;
    const minutes = settings.autoLockMinutes || 5;
    idleTimer = setTimeout(() => { if (!isLocked) showLockOverlay(); }, minutes * 60 * 1000);
  }

  function setupIdleListeners() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      document.addEventListener(evt, () => { if (!isLocked) resetIdleTimer(); }, { passive: true });
    });
  }

  // ── Stealth Mode ───────────────────────────────
  function applyStealthMode() {
    const existing = document.getElementById('wpp-stealth-style');
    if (existing) existing.remove();
    if (!settings.privacyEnabled || !settings.hideOnlineStatus) return;
    const style = document.createElement('style');
    style.id = 'wpp-stealth-style';
    style.textContent = `
      [data-testid="conversation-header"] span[title*="online"],
      [data-testid="conversation-header"] [data-testid*="last-seen"] {
        visibility: hidden !important; height: 0 !important; overflow: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Snapshot Protection ────────────────────────
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
        e.preventDefault(); e.stopImmediatePropagation();
        showToast('Print blocked by Privacy Pro');
      }
    }, true);
  }

  // ─────────────────────────────────────────────
  //  NOTIFICATION MASKING (v1.3.3)
  //  The actual Notification override lives in
  //  notif-intercept.js (MAIN world, document_start).
  //  This isolated-world script just syncs state to
  //  it via postMessage using a one-time token that
  //  notif-intercept.js locks in on first receipt.
  // ─────────────────────────────────────────────
  const WPP_TOKEN = Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  function syncNotificationFlags() {
    window.postMessage({
      __wppToken:        WPP_TOKEN,
      type:              'wpp-notif-state',
      privacyEnabled:    !!settings.privacyEnabled,
      maskNotifications: !!settings.maskNotifications
    }, window.location.origin);
  }

  // ── Toast ──────────────────────────────────────
  function showToast(text) {
    let toast = document.getElementById('wpp-toast');
    if (toast) toast.remove();
    toast = document.createElement('div');
    toast.id = 'wpp-toast';
    toast.textContent = text;
    Object.assign(toast.style, {
      position: 'fixed', top: '20px', left: '50%',
      transform: 'translateX(-50%)', zIndex: '999999',
      padding: '10px 20px', borderRadius: '12px',
      background: 'linear-gradient(135deg, #00a884, #005c4b)',
      color: 'white', fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: '13px', fontWeight: '600',
      boxShadow: '0 4px 20px rgba(0,168,132,0.4)',
      opacity: '0', transition: 'opacity 0.3s ease', whiteSpace: 'nowrap'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
  }

  // ── Message Bridge ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'updateSettings') {
      settings = { ...settings, ...msg.settings };
      applyPrivacyState();
      applyStealthMode();
      syncNotificationFlags();
      resetIdleTimer();
      sendResponse({ ok: true });
    }
    if (msg.action === 'togglePrivacy') {
      settings.privacyEnabled = !settings.privacyEnabled;
      StorageUtil.set({ privacyEnabled: settings.privacyEnabled });
      applyPrivacyState();
      applyStealthMode();
      syncNotificationFlags();
      showToast(settings.privacyEnabled ? 'Privacy ON' : 'Privacy OFF');
      sendResponse({ privacyEnabled: settings.privacyEnabled });
    }
    if (msg.action === 'lockNow') {
      if (settings.pinEnabled && settings.pinHash) showLockOverlay();
      sendResponse({ ok: true });
    }
    if (msg.action === 'getState') {
      sendResponse({ privacyEnabled: settings.privacyEnabled, isLocked });
    }
    if (msg.action === 'getActiveChatName') {
      sendResponse({ chatName: getActiveChatName() });
    }
    return true;
  });

  // ── Initialization ─────────────────────────────
  async function init() {
    settings = await StorageUtil.getAll();
    syncNotificationFlags();  // push initial state to notif-intercept.js
    applyPrivacyState();
    applyStealthMode();
    buildHeaderButton();
    startObserver();
    setupIdleListeners();
    setupSnapshotProtection();
    resetIdleTimer();
    if (settings.pinEnabled && settings.pinHash) showLockOverlay();
  }

  function waitForApp() {
    const appEl = document.getElementById('app');
    if (appEl && appEl.children.length > 0) { init(); }
    else { setTimeout(waitForApp, 500); }
  }

  if (document.readyState === 'complete') { waitForApp(); }
  else { window.addEventListener('load', waitForApp); }
})();
