# WhatsApp Privacy Pro

**Privacy in Plain Sight** — A Chromium-based Manifest V3 extension providing granular privacy controls for WhatsApp Web.

## Features

### Core Privacy Engine
- **Granular Blur** — independently blur messages, last message previews, media, profile pictures, and contact/group names
- **Hover-to-Reveal** — unblur any content (text, images, video) instantly on mouse hover using wildcard descendant matching
- **Quick Toggle** — master switch + `Alt+X` keyboard shortcut
- **Blur Intensity Slider** — adjust blur from 1px to 20px in real-time via CSS custom properties

### Enhanced Security
- **PIN Lock** — 4-digit PIN with SHA-256 hashing via Web Crypto API (never stored in plain text)
- **Auto-Lock Timer** — automatically locks after configurable idle period (1-30 min)
- **Stealth Mode** — hide online status from the conversation header
- **Snapshot Protection** — blocks print (Ctrl+P), maximizes blur when tab loses focus
- **DevTools Bypass Prevention** — lock overlay re-injects itself if removed from DOM

## Installation

1. Download and unzip
2. Open `chrome://extensions/` in Chrome, Edge, or Brave
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `whatsapp-privacy-pro` folder
5. Navigate to [web.whatsapp.com](https://web.whatsapp.com)

## Architecture

```
manifest.json          MV3 entry, permissions, keyboard commands
background.js          Service Worker: shortcuts, storage sync, alarms
content.js             Injected into WhatsApp: privacy engine, lock overlay
privacy.css            Dynamic stylesheet (CSS vars + multi-layer selectors)
popup.html/css/js      Extension popup settings dashboard
utils/storage.js       Typed chrome.storage.local wrapper with defaults
icons/                 16, 32, 48, 128px PNG icons
```

### CSS Selector Strategy

WhatsApp Web randomizes CSS class name prefixes on each build, but keeps certain class names and attributes stable. This extension uses four layers of selectors for resilience:

1. **Stable classes** — `.message-in`, `.message-out`, `.copyable-text`, `.selectable-text`
2. **Stable attributes** — `[data-testid="msg-container"]`, `[role="listitem"]`, `[role="row"]`
3. **Structural IDs** — `#main`, `#pane-side`, `#app`
4. **Fallback patterns** — `span[dir]`, `img[draggable="false"]`, `img[src*="blob:"]`

### Hover-to-Reveal Fix (v3)

WhatsApp nests images inside 5-7 layers of wrapper divs. A simple `.message-in:hover img` selector can fail due to CSS specificity ties with the blur rule. The fix uses a wildcard descendant approach: `.message-in:hover *` catches every nested child regardless of depth. Additional explicit `img`/`video` rules with chained body class specificity (`body.wpp-hover-reveal.wpp-blur-media`) provide a safety net.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + X` | Toggle privacy on/off |
| `Alt + L` | Lock WhatsApp immediately |

## Permission Justification

This extension requests only two Chrome permissions, both classified as low-risk:

| Permission | Why it's needed | Risk level |
|------------|----------------|------------|
| `storage` | Persist user settings (blur preferences, PIN hash, auto-lock config) across browser sessions. Without this, all settings would reset every time the popup closes. | Low — no network access, data stays local |
| `alarms` | Power the auto-lock timer. Chrome MV3 service workers terminate after ~30s of inactivity, so `setInterval`/`setTimeout` don't work reliably. `chrome.alarms` is the only MV3-compliant way to trigger a future event from a service worker. | Low — no data access |

**Host permission**: `https://web.whatsapp.com/*` — Required to inject the content script and CSS stylesheet into the WhatsApp Web page. Scoped to this single domain only (not `<all_urls>`).

**What this extension does NOT request**: `tabs` (not needed — we use `activeTab` pattern via popup query), `webRequest` (no network interception), `clipboardRead/Write`, `history`, `identity`, or any other sensitive permission.

## Credits & Acknowledgements

This project was built from scratch but takes inspiration from the open-source ecosystem:

- **[Privacy Extension For WhatsApp Web](https://github.com/LukasLen/Privacy-Extension-For-WhatsApp-Web)** by Lukas Lenhardt — MIT License. The original and most popular WhatsApp privacy extension (1M+ users). Used as a reference for understanding which WhatsApp Web DOM elements need to be targeted and the general approach of CSS-based blur with hover reveal. No code was copied.

- **[whatsapp-privacy-extension](https://github.com/arzumy/whatsapp-privacy-extension)** by Arzumy — MIT License. A clean MV3 implementation that was referenced for Manifest V3 structure patterns.

- **[Will Hackett's WhatsApp Web DOM Analysis](https://willhackett.uk/whatsapp-and-tonic/)** — Blog post documenting WhatsApp Web's DOM structure, particularly the stable `.copyable-text`, `.message-in`, `.message-out`, and `.selectable-text` class names that survive WhatsApp's class name randomization. This informed our multi-layer selector strategy.

- **SHA-256 hashing** uses the browser's built-in [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) — no external libraries.

- **Icons** are generated programmatically using Python Pillow. The shield + eye design is original.

## Browser Compatibility

Tested on Chromium-based browsers:
- Google Chrome 120+
- Microsoft Edge 120+
- Brave 1.60+

## Privacy

This extension collects zero data. No analytics, no network calls, no telemetry. All settings are stored locally in `chrome.storage.local` and never leave your browser.

## License

MIT — See LICENSE file for details.

WhatsApp is a trademark of WhatsApp Inc. This extension is an independent project and has no relationship to WhatsApp or Meta.
