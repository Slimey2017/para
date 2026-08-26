# PARA Browser Fix Progress

## Fixed
- Corrected browser grid rows so the website viewport expands to fill the available app area.
- Replaced the permanent controller tutorial cards with a real PARA New Tab page.
- Added a first-launch controller tutorial overlay that can be dismissed and stays dismissed.
- ParaPoint now starts OFF when Browser opens and only activates when explicitly requested.
- Kept the controller legend anchored to the bottom browser safe area.
- Preserved full-screen browser app bounds and stabilization viewport contract.

## Validation
- 40 screens / 17 services validated.
- 52 rendered UI states audited.
- 37/37 tests passing.
- stabilization-check passed.

## Known web-edition limitation
Some external websites reject iframe embedding using security headers. PARA shows a friendly note for those cases; a native browser runtime should handle them outside iframe restrictions.
