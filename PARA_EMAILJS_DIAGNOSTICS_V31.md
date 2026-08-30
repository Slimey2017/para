# PARA EmailJS Diagnostics V31

V31 fixes the remaining generic account-signup toast.

When EmailJS rejects or cannot receive a verification request, PARA now displays the exact backend/provider message in both the account status area and the toast instead of showing only `Verification email could not be sent yet.`

The detailed error is also written to the browser console as `PARA email verification send failed` for development diagnostics.

No OTP is exposed to the browser by this change. The verification code remains generated, hashed, and stored by the PARA API.
