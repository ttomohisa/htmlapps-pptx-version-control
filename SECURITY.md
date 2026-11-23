# Security Policy

## Supported version

Security fixes target the latest version on the default branch.

## Reporting a vulnerability

Do not publish sensitive vulnerability details in a public issue. Use the repository owner's private security reporting channel when available.

Include:

- Affected commit or version.
- Reproduction steps.
- Expected and actual behavior.
- Security impact.
- A minimal test file when file parsing is involved.

## Trust model

PPTX Version Control is a static browser application without a backend. Its primary protections are:

- No ordinary runtime CDN/API connection (`connect-src 'none'`). Optional peer-to-peer WebRTC must be explicit in the product specification and must not introduce hidden signaling/STUN/TURN services.
- Explicitly pinned and embedded third-party files.
- Committed `dependencies.lock.json` tarball SHA-256 values verified before embedding.
- SHA-256 records in the generated dependency manifest.
- No analytics, telemetry, remote fonts, or silent update checks.
- User-initiated downloads rather than automatic uploads.

A generated HTML file is executable code. Distribute it through a trusted channel and verify hashes for high-trust workflows.

PPTX Version Control does not use WebRTC. The reusable WebRTC component in `components/` is documentation and source material for other applications, not a network path in this app.

PPTX and `.pptxvc` files are handled in the browser. PPTX parsing limits ZIP entry counts, expansion sizes and unsafe paths; backup import checks referenced object sizes, hashes and structural relationships before persistence. Visual rendering blocks linked external media while allowing embedded media. These checks reduce risk but cannot prove that every PowerPoint extension behaves safely or renders faithfully.

History is saved in browser IndexedDB, not remotely backed up. Clearing site data or a browser storage eviction can erase it. Users should export important projects as `.pptxvc` files.

## Input files

This application parses untrusted local PPTX and `.pptxvc` files. Maintainers must:

- Validate type, size, and structure before expensive processing.
- Avoid unbounded allocation or recursion.
- Handle malformed data without exposing stack traces to users.
- Release Blob URLs, workers, canvas resources, and large buffers.
- Make destructive transformations reversible where practical.
- Never upload a selected file unless the product explicitly requires it and the user is clearly informed.

## Dependency review

Before adding or upgrading a package:

- Confirm the package identity and exact version.
- Review the scheduled dependency Issue; never treat an available update as an automatic approval to upgrade.
- Review its license and required notices.
- Inspect the browser bundle and package scripts.
- Confirm every runtime support asset is embedded.
- Refresh the selected lock entry with the dependency scripts; never hand-edit a lock hash to bypass a mismatch.
- Rebuild with a clean cache.
- Test with the network disabled.
