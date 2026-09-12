# Browser tests

Serve the repository root and open:

- `/tests/browser/` for component, loader, sanitizer, provenance, and collection tests.
- `/tests/browser/smoke.html` for the five-route desktop/mobile integration smoke test.

The pages set `body[data-status]` to `passed` or `failed`, so they can run in a
browser or through headless Chrome without a build step.
