# PARA Blank Page Hotfix

Root cause: `apps/para-home/src/app.js` used `await` inside the synchronous `render(route)` function for the new Downloads and Saved Data activation paths. That is a JavaScript parse error, so the entire PARA frontend module failed before Home could render. The background CSS still loaded, which is why production showed only the dark purple backdrop.

Fix: keep `render(route)` synchronous and start the asynchronous screen activators with promises, installing their cleanup handlers only if the user is still on the same route.

Verification: `./scripts/stabilization-check.sh` passes, including JavaScript syntax validation, 40 screens / 17 services, 52 consumer UI states, and 37/37 tests.
