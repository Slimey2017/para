# PARA Real Button Pass V26

This pass audits user-facing controls in PARA Home and separates controls that are now functional from controls that require a real platform service before they can honestly be enabled.

## Made functional in this pass

### PARA Browser
- New Tab is no longer disabled.
- Up to 8 session tabs are supported.
- Tabs can be switched and closed.
- Each tab keeps its own back/forward history.
- Browser menu is now active with New Tab, Close Tab, New-tab Page, and Clear Tab History.
- Browser tab state survives route changes for the current browser session.

### ParaStore Wishlist
- Wishlist is now persistent per PARA profile in local storage.
- The ParaStore Wishlist button filters the catalog to saved titles.
- Product pages can add/remove a title from Wishlist.
- Product More Options is now a real menu instead of a placeholder toast.

### Messages
- New Message, conversation selection, Send, and attachment selection now work.
- Conversations persist per PARA profile on the console.
- This is local profile messaging storage only. Cross-console/social delivery is intentionally not claimed until the account/social transport exists.

### Saved Data
- Save History now opens actual local restore points.
- Restore point buttons call the existing save-data restore service.
- Delete Save Data now deletes the selected local save.

### Legacy mock runtime cleanup
- Removed unused `apps/para-home/src/mock-data.js`.
- Removed obsolete `services/mock-api/`.
- Removed unused legacy `src/screens/social.js` containing dead routes/actions.
- Expanded the consumer UI audit to include Browser and Messages.

## Intentionally gated controls still needing platform services

### First-boot PARA Account
Current controls: Log In, Create Account.

Do not fake these with local profile state. A real implementation should add:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- secure token storage owned by the native PARA service, not browser localStorage
- offline session fallback and account/profile linking

The buttons should only be enabled when the account capability reports available.

### Connected gaming/service accounts
Current providers: Steam, PlayStation, Xbox, Nintendo, Google.

A real implementation needs a provider broker:
- `GET /api/v1/accounts/providers`
- `POST /api/v1/accounts/{provider}/connect`
- OAuth/deep-link callback handling
- encrypted refresh-token storage
- `DELETE /api/v1/accounts/{provider}`
- provider-specific capability scopes

Never mark a provider Connected until the callback has been verified by the host service.

### PulseWave firmware update
The UI already detects genuine PulseWave hardware. The real button should call a hardware service that exposes:
- device VID/PID and hardware revision
- current firmware version
- signed firmware manifest
- battery requirement before flashing
- DFU/recovery mode
- signature/hash verification
- rollback image

Suggested route: `POST /api/v1/hardware/pulsewave/firmware/check` followed by an explicit confirmed install action.

### Recovery actions
Repair Storage, Network Recovery, Roll Back Update, and Safe Mode are privileged Linux operations. They must run through a restricted native recovery service, not JavaScript shell commands.

Suggested API:
- `POST /api/v1/recovery/storage/check` for read-only diagnostics first
- `POST /api/v1/recovery/storage/repair` only after confirmation and when safe to unmount
- `POST /api/v1/recovery/network` to restart/repair the PARA networking service
- `GET /api/v1/recovery/images` to enumerate signed known-good system images
- `POST /api/v1/recovery/rollback` with a selected verified image
- `POST /api/v1/recovery/safe-mode` to set a one-boot safe-mode flag then restart

All destructive recovery calls should require local opt-in, confirmation, audit logging, and a native capability flag.

### Game management and updates
The Options menu still needs a package-management layer for game update/check/manage operations. It should expose installed version, available version, storage use, add-ons, permissions, save data, verify/repair, move storage, and uninstall.

## Verification
- Consumer UI audit: passes with Browser and Messages included.
- Repository test suite: 50 passed.
- JavaScript syntax checks: Browser, Experiences, and App pass Node syntax validation.
