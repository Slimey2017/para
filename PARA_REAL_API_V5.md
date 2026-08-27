# PARA Real API v5

This build removes the obsolete mock API service and promotes the working PARA server into `services/api/server.py`.

## Changed
- Removed `services/mock-api/` completely.
- Replaced `services/gateway/` with `services/api/`.
- Render, dev, smoke, and test launch paths now point at `services/api/server.py`.
- Replaced obsolete `para-mock-api.service` and `para-gateway.service` templates with `para-api.service`.
- Health identity is now `para-api`.
- Service registry mode is now `para-api`.
- API contract version bumped to 0.8.0.

## What the real server already does
The PARA API serves the console UI and exposes real endpoints for health, host system information, storage, network, audio, personalization, custom backgrounds, PARA Files, Linux app discovery/launch, removable volumes, fixed power actions, ParaStore catalog/product reads, package delivery, and server-authoritative checkout quotes. Hosted mode intentionally disables privileged local-machine actions.
