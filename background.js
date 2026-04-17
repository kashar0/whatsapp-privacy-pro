/**
 * WhatsApp Privacy Pro — Background Service Worker
 * Handles: keyboard shortcuts, alarms, storage sync, tab messaging.
 */

// ── Keyboard Shortcuts ──────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('web.whatsapp.com')) return;

  if (command === 'toggle-privacy') {
    chrome.tabs.sendMessage(tab.id, { action: 'togglePrivacy' }).catch(() => {});
  }

  if (command === 'lock-now') {
    chrome.tabs.sendMessage(tab.id, { action: 'lockNow' }).catch(() => {});
  }
});

// ── Storage Changes → Push to Content Script ─────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  const updated = {};
  for (const [key, { newValue }] of Object.entries(changes)) {
    updated[key] = newValue;
  }

  // Push to all WhatsApp Web tabs
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'updateSettings',
      settings: updated
    }).catch(() => {});
  }
});

// ── Auto-Lock Alarm ──────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'wpp-auto-lock') {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { action: 'lockNow' }).catch(() => {});
    }
  }
});

// ── Install / Update Handler ─────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set defaults on first install
    const { privacyEnabled } = await chrome.storage.local.get('privacyEnabled');
    if (privacyEnabled === undefined) {
      await chrome.storage.local.set({
        privacyEnabled: true,
        blurMessages: true,
        blurLastMessage: true,
        blurMedia: true,
        blurProfilePics: true,
        blurContactNames: true,
        blurIntensity: 8,
        hoverReveal: true,
        hideTypingStatus: false,
        hideOnlineStatus: false,
        autoLockEnabled: false,
        autoLockMinutes: 5,
        pinEnabled: false,
        pinHash: null,
        snapshotProtection: false
      });
    }
  }
});
