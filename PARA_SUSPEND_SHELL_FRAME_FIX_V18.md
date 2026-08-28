# PARA Suspend Shell Frame Fix v18

Version: 0.9.10  
Build: `v18-suspend-shell-frame-fix`

## Fixed

PARA v17 correctly kept the web game runtime alive during suspension, but the suspended Home shell was loaded in a same-origin iframe while PARA Home sent `X-Frame-Options: DENY` and `frame-ancestors 'none'`. Chromium therefore showed **para-wjvx.onrender.com refused to connect** even though the Render service itself was healthy.

v18 keeps normal PARA Home protected from framing, while the narrowly scoped `/?para_suspended_shell=1...` route now permits only same-origin framing using `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`.

This preserves the v17 true web-game suspend/resume model without opening PARA Home to third-party framing.
