# PARA Language & Region Options V38

- Replaces the fake one-item Language dropdown with real language choices.
- Country or region now discovers the browser's recognized region codes through `Intl.DisplayNames`, shows readable country names, and falls back to a broad built-in list on older browsers.
- Time zone now uses the browser's complete IANA time-zone list through `Intl.supportedValuesOf("timeZone")`, with a curated fallback for older browsers.
- Keyboard layout now provides common QWERTY, AZERTY, QWERTZ, Japanese, Korean, and Chinese choices instead of only `System default`.
- The current detected/saved values are preserved and selected automatically.
- Adds a regression test so the setup page cannot silently return to one-option selectors.

Note: in the web build, keyboard layout is a PARA preference because a normal browser cannot switch the host operating system's keyboard layout. The native PARA runtime can consume the saved preference when that integration is wired.
