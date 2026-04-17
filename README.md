# WhatsApp Privacy Pro

Using WhatsApp Web in a shared space or a coffee shop means anyone nearby can see your conversations. WhatsApp Privacy Pro gives you real control over what is visible on screen and how quickly your chats lock when you step away.

## What it does

You can blur your chat list and messages so the content is hidden unless you hover over it. There is an auto-lock that kicks in after a set idle time, requiring a PIN before anyone can see your chats. A stealth mode hides indicators that could reveal you are online. You can also lock your screen instantly with a keyboard shortcut so you do not have to scramble when someone walks up behind you.

The blur intensity is adjustable with a slider so you can go from a light soft blur all the way to fully obscured depending on how sensitive your surroundings are. Every element can be controlled independently so you can blur profile pictures but keep message text readable, or hide contact names but show the messages.

## Security details

The PIN lock uses SHA-256 hashing through the browser's built-in Web Crypto API so your PIN is never stored in plain text. The lock overlay is built to resist DevTools tampering and re-injects itself if someone tries to remove it from the page. Print and screenshot shortcuts are also blocked when privacy mode is active.

## Keyboard shortcuts

Alt+X toggles privacy mode on and off instantly. Alt+L locks WhatsApp immediately without waiting for the idle timer.

## How to install

Clone or download this repo, open Chrome and go to chrome://extensions, enable Developer Mode, click Load unpacked, and select this folder. Navigate to web.whatsapp.com and the extension activates automatically.

## Permissions it uses

It only works on web.whatsapp.com and nowhere else. It uses storage to save your PIN hash and settings locally, and alarms to handle the auto-lock timer reliably in the background. It does not read your messages, make any network requests, or send anything anywhere. Zero data collection.

## Browser support

Works on Google Chrome 120 and above, Microsoft Edge 120 and above, and Brave 1.60 and above.

## Built with

Manifest V3, modular JavaScript, and Chrome's storage and alarms APIs targeting WhatsApp Web.

WhatsApp is a trademark of WhatsApp Inc. This extension is independent and has no affiliation with WhatsApp or Meta.
