/**
 * WhatsApp Privacy Pro — Storage Utility
 * Typed wrappers around chrome.storage.local
 */

const DEFAULT_SETTINGS = {
  // Master toggle
  privacyEnabled: true,

  // Granular blur controls
  blurMessages: true,
  blurLastMessage: true,
  blurMedia: true,
  blurProfilePics: true,
  blurContactNames: true,

  // Blur intensity (0 = none, 20 = max)
  blurIntensity: 8,

  // Hover-to-reveal
  hoverReveal: true,

  // Stealth mode
  hideTypingStatus: false,
  hideOnlineStatus: false,

  // Auto-lock
  autoLockEnabled: false,
  autoLockMinutes: 5,

  // PIN protection
  pinEnabled: false,
  pinHash: null,

  // Snapshot protection
  snapshotProtection: false
};

const StorageUtil = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    if (typeof key === 'string') {
      return result[key] !== undefined ? result[key] : DEFAULT_SETTINGS[key];
    }
    // If key is array or null, merge with defaults
    const merged = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(result)) {
      merged[k] = result[k];
    }
    return merged;
  },

  async getAll() {
    const result = await chrome.storage.local.get(null);
    return { ...DEFAULT_SETTINGS, ...result };
  },

  async set(data) {
    await chrome.storage.local.set(data);
  },

  async reset() {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(DEFAULT_SETTINGS);
  }
};

// Make available globally for content scripts
if (typeof window !== 'undefined') {
  window.StorageUtil = StorageUtil;
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
}
