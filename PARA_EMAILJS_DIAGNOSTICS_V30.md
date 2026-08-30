# PARA EmailJS Diagnostics V30

V30 fixes the generic "Verification email could not be sent yet" dead end.

## Changes

- PARA now preserves the actual EmailJS HTTP error text and displays the human-readable message in Account setup.
- `PARA_EMAILJS_PRIVATE_KEY` is supported server-side for EmailJS accounts that enable private-key authorization under Account > Security. Do not put this secret in browser code or commit it to the repository.
- `PARA_EMAILJS_ORIGIN` can be set when EmailJS origin allowlisting is enabled. For the hosted PARA build this can be `https://para-wjvx.onrender.com`.
- A stable PARA Protection Services user-agent is sent with verification requests.
- Existing service, template and public-key configuration remains unchanged.

## Existing public configuration

```text
PARA_EMAILJS_SERVICE_ID=service_rozuv2c
PARA_EMAILJS_TEMPLATE_ID=template_hitoc7a
PARA_EMAILJS_PUBLIC_KEY=Vcb2UJ9zNsxvhEajq
```

## Optional server-only configuration

```text
PARA_EMAILJS_PRIVATE_KEY=...
PARA_EMAILJS_ORIGIN=https://para-wjvx.onrender.com
```

If sending still fails, PARA will now show the exact EmailJS response (for example an invalid service/template, authorization requirement, or provider connection problem) instead of hiding it.
