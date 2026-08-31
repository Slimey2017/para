# PARA EmailJS Config Fix V32

EmailJS dashboard **Test It** succeeded while PARA REST sends returned `HTTP 400: template ID not found`.

V32 removes stale/config-copy ambiguity:

- Default template is now `template_xd50wdh`.
- Public EmailJS service/template/public-key values are pinned in `render.yaml`.
- Environment values are normalized to remove accidental wrapping quotes and whitespace.
- Provider failures include a safe config summary: service ID, template ID, public-key length/suffix, private-key enabled state, and Origin.
- The full public key is not echoed in diagnostics.

EmailJS request shape remains the documented REST format: `service_id`, `template_id`, `user_id`, and `template_params`.
