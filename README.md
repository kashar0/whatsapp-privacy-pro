# WhatsApp Privacy Pro

Using WhatsApp Web in a shared space means anyone nearby can read your conversations. WhatsApp Privacy Pro gives you granular control over exactly what is visible on screen and how quickly your chats lock when you step away.

## Privacy controls

Every privacy element can be toggled independently. You can blur chat messages without blurring profile pictures, or hide contact names while keeping message content readable. The controls are:

Messages blur hides the content of incoming and outgoing messages. Last message preview blur hides the snippet shown in the chat list. Media blur covers images and videos in the conversation. Profile picture blur hides avatars throughout the interface. Contact and group name blur replaces names with blurred blocks.

The blur intensity slider lets you go from a subtle 1px soft blur all the way to 20px fully obscured. The value is applied in real time through a CSS custom property so the whole interface updates instantly as you drag the slider.

Hover to reveal is an optional mode that unblurs any element the moment you hover over it. The implementation handles WhatsApp's deeply nested DOM structure where images and videos sit inside 5 to 7 layers of wrapper divs. A wildcard descendant selector catches every nested child regardless of depth, with chained body-class specificity rules as a safety net against CSS specificity conflicts.

## Lock screen

The PIN lock requires a 4-digit PIN to unlock WhatsApp. Your PIN is hashed with SHA-256 through the browser's built-in Web Crypto API before being stored, so the plain text PIN is never written to storage at any point.

The auto-lock timer locks the screen automatically after a configurable idle period. Because Chrome MV3 service workers terminate after roughly 30 seconds of inactivity, setTimeout and setInterval cannot be relied on for this. The auto-lock timer uses chrome.alarms which is the only MV3-compliant way to trigger a future event from a service worker.

The lock overlay is built to resist DevTools tampering. If someone opens DevTools and removes the overlay element from the DOM, it re-injects itself. Print shortcuts are blocked while privacy mode is active.

## Keyboard shortcuts

Alt+X toggles privacy mode on and off without opening the popup. Alt+L locks WhatsApp immediately without waiting for the idle timer to expire.

## Stealth mode

Stealth mode hides the online status indicator in the conversation header so people cannot see that you are currently active.

## How the CSS works

WhatsApp Web randomizes CSS class name prefixes on each build so classes like _abc123 change frequently. This extension targets elements using four layers of selectors that remain stable across builds. Stable semantic classes like .message-in, .message-out, .copyable-text, and .selectable-text are the primary targets. Stable data attributes like data-testid="msg-container" and role="listitem" serve as the second layer. Structural IDs like #main, #pane-side, and #app anchor the third layer. Fallback patterns like span[dir] and img[draggable="false"] cover anything the upper layers might miss.

A MutationObserver with a 150ms debounce watches the WhatsApp app container and re-applies privacy classes whenever the DOM changes, which is necessary because WhatsApp renders conversations dynamically as you scroll and switch chats.

## How to install

Clone or download this repo, open Chrome and go to chrome://extensions, enable Developer Mode, click Load unpacked, and select this folder. Navigate to web.whatsapp.com and the extension activates automatically.

## Permissions

The extension only operates on web.whatsapp.com and nowhere else. The host permission is scoped to that single domain. Storage saves your PIN hash, blur preferences, and auto-lock configuration locally. Alarms powers the auto-lock timer. The extension requests no other permissions, does not touch your tabs API, makes no network requests, and collects zero data.

## Browser support

Tested on Google Chrome 120 and above, Microsoft Edge 120 and above, and Brave 1.60 and above.

## Credits

This project took inspiration from Privacy Extension For WhatsApp Web by Lukas Lenhardt (MIT) and whatsapp-privacy-extension by Arzumy (MIT), both used as references for understanding which WhatsApp DOM elements to target. No code was copied from either project.

## License

MIT. See LICENSE for details. WhatsApp is a trademark of WhatsApp Inc. This extension is an independent project with no affiliation to WhatsApp or Meta.
