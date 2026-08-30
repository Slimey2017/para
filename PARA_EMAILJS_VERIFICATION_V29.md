# PARA Email Verification V29

PARA Account now supports a controller-friendly 6-digit email verification flow delivered through EmailJS and branded as **PARA Protection Services**.

## Connected EmailJS configuration

- Service ID: `service_rozuv2c`
- Template ID: `template_hitoc7a`
- Public key: configured in the PARA API with an environment-variable override.
- Template parameters sent by PARA: `email` and `passcode`.

The EmailJS public key is a public client identifier, not a Supabase secret or service-role credential. The API keeps the EmailJS request behind `/api/v1/auth/verification/*` so the console UI does not need to know the account service implementation.

## Account flow

1. User creates a PARA Account with display name, email, and password.
2. PARA Account is created through Supabase Auth.
3. PARA Protection Services sends a 6-digit code through EmailJS.
4. PARA opens the **Verify your email** screen with controller focus on the OTP field.
5. The user enters the code or requests a resend.
6. The API verifies the code and, when a matching PARA Account session is active, records `para_email_verified` in Supabase user metadata.
7. Account Settings displays the verified state and can send a new code when verification is pending.

## Verification protections

- Six-digit cryptographically generated codes.
- Only salted SHA-256 code digests are kept server-side; the plaintext code is never returned to PARA Home.
- 15-minute expiration.
- 45-second resend cooldown per email address.
- Six incorrect attempts before the code is invalidated.
- Device/client request throttling to reduce email abuse.
- Verification metadata is only attached to a signed-in account when the session email exactly matches the verified email.

## Runtime overrides

The Linux service already reads `%h/.config/para/account.env`. The EmailJS values may be changed without rebuilding PARA:

```text
PARA_EMAILJS_SERVICE_ID=service_rozuv2c
PARA_EMAILJS_TEMPLATE_ID=template_hitoc7a
PARA_EMAILJS_PUBLIC_KEY=YOUR_EMAILJS_PUBLIC_KEY
```

Existing Supabase variables remain required for actual PARA Account creation and sign-in:

```text
PARA_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
PARA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

No Supabase service-role key is required or shipped to PARA Home.

## Production note

V29 keeps outstanding OTP digests in the running PARA API process. That is appropriate for DEV/prototype console use and means outstanding codes are invalidated if the local account service restarts. A later multi-server production deployment should move temporary verification state to a shared TTL store while keeping the same API contract.
