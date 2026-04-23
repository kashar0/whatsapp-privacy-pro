/**
 * WhatsApp Privacy Pro — Background Service Worker v1.3.1
 *
 * FIX v1.3.1:
 *  - Removed context menu (WhatsApp Web intercepts right-click with its own menu)
 *  - Per-chat rules now driven by floating in-page UI button (content.js)
 *  - Notification masking retained
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
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'updateSettings', settings: updated }).catch(() => {});
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
        snapshotProtection: false,
        blurCompose: true,
        maskNotifications: true,
        chatRules: {}
      });
    }
  }
});

// No additional message handlers needed — notification masking
// is handled entirely in content.js via page-world Notification intercept.
