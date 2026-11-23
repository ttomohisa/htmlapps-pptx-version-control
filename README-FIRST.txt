PPTX Version Control — Repository Guide
=======================================

For using the app:
- Read README.ja.md or README.md.
- Open the GitHub Pages demo or download a standalone HTML file from GitHub Releases.
- PPTX files are processed in the browser. Export important .pptxvc backups; clearing browser site data can remove stored history.

For development:
1. Read AGENTS.md, APP_SPEC.md and docs/ARCHITECTURE.md before changing behavior.
2. Change src/index.template.html, not generated dist/index.html.
3. Keep Japanese / English help and README, privacy guarantees, and third-party notices in sync.
4. Run the PowerShell preflight and scripts/check-repository.ps1 before submitting a PR.
5. Verify both dist/index.html and dist/index.self-extract.html with real PPTX files, desktop / phone layouts, and runtime network monitoring.
6. After merging into main, check the GitHub Pages deployment, tag, and GitHub Release.

The optional reusable snippets under components/ and the corresponding
docs/COMPONENTS.* and docs/WEBRTC_QR_PAIRING.* files describe development
building blocks; they are not all runtime features of PPTX Version Control.

Do not merge a pull request as part of an automated development handoff.
