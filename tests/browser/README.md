# Browser tests

Serve the repository root and open:

- `/tests/browser/` for component, loader, sanitizer, provenance, and collection tests.
- `/tests/browser/shell.html` for deterministic local shell and template tests.
- `/tests/browser/smoke.html` for live five-route desktop/mobile integration tests.

The deterministic suite checks local files and component registration without
waiting for Solid or ActivityPub services. The live suite keeps external RDF,
discussion comments, and task filtering as required assertions; an upstream
outage is reported as an integration failure rather than weakening the test.

The pages set `body[data-status]` to `passed` or `failed`, so they can run in a
browser or through headless Chrome without a build step.
