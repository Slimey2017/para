.PHONY: dev check smoke render-check native-check package

dev:
	./scripts/dev.sh

check:
	./scripts/check.sh

smoke:
	./scripts/smoke.sh

render-check:
	./scripts/render-smoke.sh

native-check:
	./scripts/native-check.sh

package:
	python3 tools/package_release.py
