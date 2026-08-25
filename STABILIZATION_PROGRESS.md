# PARA Stabilization Progress

All nine audit phases have been started in this branch. The stabilization gate passes 37/37 tests.

## Phase 1 viewport / scroll
- Added a single `100dvh` shell contract.
- Full-screen screens now constrain their height and use one intended scroll region.
- Browser emergency viewport rules are superseded so Browser fills PARA app bounds rather than creating a second viewport.
- ParaStore/cart responsive scroll sizing hardened.

## Phase 2 input / focus
- Existing deadzone and focus-memory engine retained.
- Added right-stick scrolling for the active app when ParaPoint does not own the stick.
- ParaPoint continues to own right-stick movement only while active.
- Pointer/controller handoff remains centralized in FocusManager.

## Phase 3 overlays
- Added `ui/overlay-manager.js` with single-modal ownership and focus restoration.
- ParaBoard and Turn Off confirmation now participate in the shared modal lock.

## Phase 4 audio / power
- Existing sleep, shutdown, restart fades retained and verified in source.
- Sign out now explicitly suspends profile menu music.
- Wake continues to restore music only through profile preferences.

## Phase 5 ParaStore data
- Current server-side Supabase pricing flow retained.
- Paid cart refreshes each product before totals.
- Product/detail/cart scrolling uses the stabilized viewport contract.

## Phase 6 commerce readiness
- Added server-only `/api/v1/store/checkout/quote` endpoint. It recalculates paid cart totals from published Supabase product prices and never trusts browser totals.
- Added `store_orders` and `store_entitlements` readiness schema with RLS and no client write policies.
- The same readiness migration was applied to the connected PARA Supabase project.
- Real Stripe buyer charging remains intentionally disabled until test-mode checkout/webhook/idempotency tests are implemented and pass.

## Phase 7 Browser / ParaBoard / ParaPoint
- Browser is constrained to PARA app bounds.
- ParaBoard cannot acquire modal ownership twice.
- ParaPoint and general right-stick scrolling cannot own the stick simultaneously.

## Phase 8 Home / Control Center
- Shared focus memory remains intact.
- Overlay ownership prevents power confirmation from competing with another modal.
- Global viewport rules reduce recenter/jump risk.

## Phase 9 repository / deploy
- Removed the obsolete `services/mock-api/server.py` contradiction.
- Linux unit now launches `services/gateway/server.py`.
- Added `scripts/stabilization-check.sh`.
- Render still calls the expected `scripts/check.sh`, which now delegates to the stabilization gate.
- Gate result: project validation PASS, consumer UI audit PASS, 37/37 tests PASS, shell/static checks PASS.

## Still intentionally gated
- Real Stripe buyer charges.
- Stripe webhook entitlement issuance/refund/dispute processing.
- Automated browser-level visual testing at 720p/1080p/ultrawide. Current audit is source/static/test based and should still be followed by hands-on Render regression testing.
