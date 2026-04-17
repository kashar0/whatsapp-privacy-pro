/**
 * WhatsApp Privacy Pro — Popup Controller v2
 */

(async function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const mainContent = $('#mainContent');
  const notOnWA = $('#notOnWA');

  const masterToggle = $('#masterToggle');
  const blurMessages = $('#blurMessages');
  const blurLastMessage = $('#blurLastMessage');
  const blurMedia = $('#blurMedia');
  const blurProfilePics = $('#blurProfilePics');
  const blurContactNames = $('#blurContactNames');
  const blurIntensity = $('#blurIntensity');
  const blurValue = $('#blurValue');
  const hoverReveal = $('#hoverReveal');
  const hideTypingStatus = $('#hideTypingStatus');
  const hideOnlineStatus = $('#hideOnlineStatus');
  const pinEnabled = $('#pinEnabled');
  const pinSetup = $('#pinSetup');
  const pinInputs = [$('#pinInput1'), $('#pinInput2'), $('#pinInput3'), $('#pinInput4')];
  const savePinBtn = $('#savePinBtn');
  const pinStatus = $('#pinStatus');
  const autoLockEnabled = $('#autoLockEnabled');
  const autoLockConfig = $('#autoLockConfig');
  const autoLockMinutes = $('#autoLockMinutes');
  const snapshotProtection = $('#snapshotProtection');
  const lockNowBtn = $('#lockNowBtn');
  const resetBtn = $('#resetBtn');

  // ── Check if on WhatsApp Web ───────────
  let waTab = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('web.whatsapp.com')) waTab = tab;
  } catch (e) {}

  if (!waTab) notOnWA.style.display = 'flex';

  // ── Load settings ──────────────────────
  const settings = await StorageUtil.getAll();

  masterToggle.checked = settings.privacyEnabled;
  blurMessages.checked = settings.blurMessages;
  blurLastMessage.checked = settings.blurLastMessage;
  blurMedia.checked = settings.blurMedia;
  blurProfilePics.checked = settings.blurProfilePics;
  blurContactNames.checked = settings.blurContactNames;
  blurIntensity.value = settings.blurIntensity;
  blurValue.textContent = `${settings.blurIntensity}px`;
  hoverReveal.checked = settings.hoverReveal;
  hideTypingStatus.checked = settings.hideTypingStatus;
  hideOnlineStatus.checked = settings.hideOnlineStatus;
  pinEnabled.checked = settings.pinEnabled;
  autoLockEnabled.checked = settings.autoLockEnabled;
  autoLockMinutes.value = settings.autoLockMinutes;
  snapshotProtection.checked = settings.snapshotProtection;

  pinSetup.style.display = settings.pinEnabled ? 'block' : 'none';
  autoLockConfig.style.display = settings.autoLockEnabled ? 'block' : 'none';
  updateMainState();

  // ── Helpers ────────────────────────────
  async function sha256(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function save(key, value) {
    await StorageUtil.set({ [key]: value });
    if (waTab) {
      chrome.tabs.sendMessage(waTab.id, { action: 'updateSettings', settings: { [key]: value } }).catch(() => {});
    }
  }

  function updateMainState() {
    mainContent.classList.toggle('disabled', !masterToggle.checked);
  }

  // ── Events ─────────────────────────────
  masterToggle.addEventListener('change', async () => {
    await save('privacyEnabled', masterToggle.checked);
    updateMainState();
  });

  const toggleMap = [
    [blurMessages, 'blurMessages'],
    [blurLastMessage, 'blurLastMessage'],
    [blurMedia, 'blurMedia'],
    [blurProfilePics, 'blurProfilePics'],
    [blurContactNames, 'blurContactNames'],
    [hoverReveal, 'hoverReveal'],
    [hideTypingStatus, 'hideTypingStatus'],
    [hideOnlineStatus, 'hideOnlineStatus'],
    [snapshotProtection, 'snapshotProtection']
  ];

  toggleMap.forEach(([el, key]) => {
    el.addEventListener('change', () => save(key, el.checked));
  });

  blurIntensity.addEventListener('input', () => {
    blurValue.textContent = `${blurIntensity.value}px`;
  });
  blurIntensity.addEventListener('change', () => {
    save('blurIntensity', parseInt(blurIntensity.value, 10));
  });

  pinEnabled.addEventListener('change', async () => {
    const on = pinEnabled.checked;
    pinSetup.style.display = on ? 'block' : 'none';
    if (!on) {
      await save('pinEnabled', false);
      await save('pinHash', null);
      pinStatus.textContent = '';
      pinInputs.forEach(i => { i.value = ''; });
    } else {
      await save('pinEnabled', true);
    }
  });

  pinInputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '');
      if (inp.value && idx < 3) pinInputs[idx + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) pinInputs[idx - 1].focus();
    });
  });

  savePinBtn.addEventListener('click', async () => {
    const pin = pinInputs.map(i => i.value).join('');
    if (pin.length < 4) {
      pinStatus.textContent = 'Enter all 4 digits';
      pinStatus.className = 'pin-msg err';
      return;
    }
    const hash = await sha256(pin);
    await save('pinHash', hash);
    pinStatus.textContent = 'PIN saved';
    pinStatus.className = 'pin-msg ok';
    pinInputs.forEach(i => { i.value = ''; });
    setTimeout(() => { pinStatus.textContent = ''; }, 2000);
  });

  autoLockEnabled.addEventListener('change', async () => {
    autoLockConfig.style.display = autoLockEnabled.checked ? 'block' : 'none';
    await save('autoLockEnabled', autoLockEnabled.checked);
  });

  autoLockMinutes.addEventListener('change', () => {
    save('autoLockMinutes', parseInt(autoLockMinutes.value, 10));
  });

  lockNowBtn.addEventListener('click', async () => {
    if (!settings.pinHash && pinEnabled.checked) {
      pinStatus.textContent = 'Set a PIN first';
      pinStatus.className = 'pin-msg err';
      return;
    }
    if (waTab) chrome.tabs.sendMessage(waTab.id, { action: 'lockNow' }).catch(() => {});
    window.close();
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults? Your PIN will be removed.')) {
      await StorageUtil.reset();
      window.close();
    }
  });
})();
