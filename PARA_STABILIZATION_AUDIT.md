# PARA Stabilization Audit

Date: 2026-08-25
Scope: Current PARA consumer repository, including Home, Control Center, ParaStore, Browser, ParaBoard, ParaPoint, audio/power behavior, and shared layout/input systems.

## Freeze rule

During this stabilization pass, avoid adding new product features unless they are required to fix a blocker. Fix shared systems before screen-specific polish.

## Priority scale

- P0 Critical: blocks navigation, purchase flow, launch, shutdown, or makes a screen unusable.
- P1 Major: visible glitch, inconsistent input, clipped content, stale data, or broken state transition.
- P2 Minor: polish, animation, spacing, wording, or non-blocking visual inconsistency.

## Confirmed baseline

- `tools/validate_project.py`: PASS, 38 screens / 17 services.
- `tools/audit_consumer_ui.mjs`: PASS, 50 rendered states.
- Pytest: 36 PASS / 1 FAIL.
- Remaining failing test expects `services/mock-api/server.py` to be removed, but `platform/linux/systemd/user/para-mock-api.service` still references that file. This is a repository consistency bug and should be resolved deliberately, not by deleting the file alone.

## Phase 1: Global layout and scrolling

### P0/P1 checks

- [ ] Define one viewport contract for all full-screen PARA apps.
- [ ] Eliminate conflicting `100vh`, `100dvh`, `height:100%`, and `min-height:100vh` rules where they compete.
- [ ] Keep `html, body` overflow locking only for the OS shell, while each app owns a single intended scroll container.
- [ ] Verify ParaStore product pages scroll to About, ratings, media, and purchase controls.
- [ ] Verify Browser fills the complete app viewport without clipping.
- [ ] Verify Files, Settings, Library, Community, and Creator pages at 720p, 1080p, and ultrawide widths.
- [ ] Ensure overlays never increase page dimensions or create hidden second scroll regions.

### Confirmed risk

`apps/para-home/styles.css` globally sets `html, body` to `overflow:hidden`. Multiple screens then mix `height:100%`, `100vh`, and `100dvh`. Browser also has later emergency `!important` viewport overrides. This is a strong source of clipping and screen-specific fixes fighting each other.

## Phase 2: Shared input system

### P0/P1 checks

- [ ] One source of truth for active input mode: controller, mouse, keyboard.
- [ ] Prevent input-mode switching from repeatedly re-focusing the same control.
- [ ] D-pad and left stick move focus only.
- [ ] Right stick scrolls where appropriate and controls ParaPoint only when ParaPoint is active.
- [ ] Mouse wheel scrolls the nearest valid scroll container.
- [ ] Mouse movement must not constantly steal focus from controller navigation.
- [ ] ParaBoard opens only from an explicit text-entry action or explicit controller shortcut.
- [ ] ParaBoard opening/closing preserves prior focus and never loops focus events.
- [ ] ParaPoint has predictable acceleration, deadzone, click, scroll, and escape behavior.
- [ ] Controller disconnect/reconnect falls back cleanly.

## Phase 3: Overlay framework

### P1 checks

- [ ] Control Center, Power confirmation, ParaBoard, Cart, dialogs, and notifications share one overlay manager.
- [ ] Standard z-index tiers.
- [ ] Standard focus trap and focus restoration.
- [ ] Standard Back/B behavior.
- [ ] Standard backdrop and transition timing.
- [ ] Only one modal overlay can own input at a time unless explicitly nested.

## Phase 4: Audio and power lifecycle

### P0/P1 checks

- [ ] Menu music fades and pauses before Sleep completes.
- [ ] Menu music fades and pauses before Turn Off completes.
- [ ] Restart tears down current audio before ignition sequence starts.
- [ ] Sign out stops profile-scoped menu audio.
- [ ] Wake/resume restores music only if enabled by the profile.
- [ ] Interface sounds remain clearly louder than background music at default settings.
- [ ] No stacked Audio elements after navigation or repeated wake/sleep.

## Phase 5: ParaStore data consistency

### P0/P1 checks

- [ ] Store reads published title, description, runtime, genre, media, rating, price, and availability from authoritative Supabase records.
- [ ] Developer Portal price change is reflected in ParaStore without hardcoded fallback winning.
- [ ] Free titles show Get/Install flow, not cart.
- [ ] Paid titles show current server price.
- [ ] Cart refreshes server pricing before checkout.
- [ ] Already-owned titles cannot be repurchased.
- [ ] Delisted/unpublished titles disappear or become unavailable predictably.
- [ ] Rating artwork/descriptors appear only when official/provisional status is represented correctly.
- [ ] Loading, empty, error, and retry states exist for catalog requests.

## Phase 6: Commerce readiness

### P0 checks before real charges

- [ ] Stripe platform profile complete.
- [ ] Connected developer onboarding succeeds.
- [ ] Server creates checkout/payment intent using database price, never browser price.
- [ ] Successful payment creates PARA entitlement atomically/idempotently.
- [ ] Developer share and PARA fee are recorded server-side.
- [ ] Refund and dispute events update entitlement/ledger safely.
- [ ] Duplicate webhook delivery is harmless.
- [ ] Cart checkout cannot buy duplicate ownership.
- [ ] Test-mode end-to-end purchase passes before live-mode checkout is enabled.

## Phase 7: Browser / ParaBoard / ParaPoint

### P0/P1 checks

- [ ] Browser is truly full-screen inside PARA app bounds.
- [ ] Browser chrome never gets cut off at top or bottom.
- [ ] Website content has usable scroll behavior with mouse wheel and controller.
- [ ] ParaPoint can reach all visible viewport edges without jitter.
- [ ] ParaPoint scrolling speed is controllable and not frustrating.
- [ ] ParaBoard does not auto-open merely because Browser activates.
- [ ] Text input transition has no twitching or repeated open/close cycle.
- [ ] Leaving Browser always deactivates ParaPoint and closes ParaBoard cleanly.

## Phase 8: Home and Control Center

### P1 checks

- [ ] Continue / Explore / Create / Community preserve focus memory independently.
- [ ] Control Center does not twitch or recenter as focus changes.
- [ ] Power panel layout is stable at all supported resolutions.
- [ ] Home background remains visible and persistent after navigation/restart.
- [ ] Immersive Home mode restores interface deterministically.
- [ ] Top status controls never overlap with safe areas or profile controls.

## Phase 9: Repository consistency and deploy safety

### P1 checks

- [ ] Resolve legacy mock API contradiction: test requires `services/mock-api/server.py` gone while Linux systemd unit still launches it.
- [ ] Add regression tests for every previously reported glitch.
- [ ] Add a single `stabilization-check` command combining project validation, UI audit, tests, and static checks.
- [ ] Fail Render deploy if stabilization checks fail.
- [ ] Avoid screen-specific `!important` emergency overrides unless tracked for later cleanup.

## Regression gate before every deploy

- [ ] Home boots and all four main sections navigate.
- [ ] Controller focus visible and stable.
- [ ] Mouse and controller can alternate without twitching.
- [ ] Control Center opens/closes repeatedly without shifting.
- [ ] Sleep stops/fades music.
- [ ] Turn Off stops/fades music.
- [ ] Browser launches full-screen.
- [ ] ParaBoard opens only on command.
- [ ] ParaPoint moves/clicks/scrolls predictably.
- [ ] ParaStore catalog loads.
- [ ] Product page scrolls completely.
- [ ] Live price displays.
- [ ] Cart opens and subtotal is correct.
- [ ] Developer Portal price saves and propagates to store.
- [ ] Ratings render correctly.
- [ ] Stripe payout onboarding page opens once platform profile is complete.

## Fix order

1. Global viewport/scroll contract.
2. Shared input-mode/focus manager.
3. Shared overlay manager.
4. Audio/power lifecycle.
5. ParaStore authoritative data flow.
6. Browser/ParaBoard/ParaPoint behavior.
7. Commerce test-mode checkout and entitlements.
8. Visual animation/polish cleanup.
9. Repository/deploy cleanup and regression automation.
