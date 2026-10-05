# PPTX Version Control

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-pptx-version-control/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-pptx-version-control/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-pptx-version-control/)

[日本語版 README](README.ja.md)

A browser-only PowerPoint version-control tool for `.pptx` files. It stores project history locally, compares meaningful presentation changes, provides PPTX Diff-style visual comparison, and supports branch, merge, conflict-resolution, and Git-friendly export workflows without uploading selected presentations to a server.

## 🚀 Live demo

### [Open PPTX Version Control on GitHub Pages](https://ttomohisa.github.io/htmlapps-pptx-version-control/)

GitHub Pages delivers the initial HTML. After it loads, PPTX parsing, version storage, semantic diff, branch and merge processing, project import/export, and Git-friendly export are processed locally on your device. The PPTX files you select are not uploaded by the app.

[![PPTX Version Control screenshot](assets/screenshot-en.png)](https://ttomohisa.github.io/htmlapps-pptx-version-control/)

## Features

- **Save PowerPoint versions locally** — Create a project from a PPTX, then drop each edited PPTX into the same project as a new version.
- **Review meaningful changes** — Compare text, numbers, images, objects, layout, formatting, slide order, and speaker notes instead of raw OOXML noise.
- **Compare the actual slides visually** — Review saved versions, branch heads, or the current unsaved edit with Side by side, Overlay, Split, and Blink views.
- **Keep Git-like history in the browser** — Project, commit, branch, ref, and HEAD data are stored in IndexedDB with SHA-256 content-addressed objects.
- **Branch without duplicating presentations manually** — Create, switch, rename, and delete branches, including branches created from older saved versions.
- **Merge divergent work** — Use 3-way merge with BASE / current / incoming versions and automatic slide-, object-, and property-level merging when safe.
- **Resolve conflicts in the UI** — Choose the current or incoming change, or manually edit supported text conflicts before creating the merge version.
- **Take your history with you** — Export and import a complete project as one `.pptxvc` file, including refs, commits, and required objects.
- **Review normalized data with ordinary Git** — Export stable per-slide JSON, resolved relationships, and SHA-256-named media as a Git-friendly ZIP.
- **Restore real PPTX files** — Open or export historical versions without moving HEAD, and restore older content as a new version while preserving history.
- **Private, single-HTML operation** — Runtime network connections are blocked by CSP, with Japanese/English UI and no server-side file processing.

## Quick start

### Use the web demo

Just [open the demo](https://ttomohisa.github.io/htmlapps-pptx-version-control/). No installation or account is required.

### Use the downloaded HTML

1. Download [`dist/index.html`](dist/index.html) from this repository.
2. Open it in a current Chrome or Edge browser.

The generated file is a standalone HTML document. `dist/index.self-extract.html` is also included as a smaller self-extracting variant for browsers that support `DecompressionStream`.

### Build it yourself (advanced)

1. Download or clone this repository.
2. Double-click `build-standalone.bat` on Windows, or run `./build-standalone.ps1` from PowerShell.
3. Copy the generated `dist/index.html` wherever you need it.
4. Open that single file later without an internet connection.

Python, Node.js, and a local web server are not required. The builder uses Windows PowerShell and the built-in `tar.exe`.

## Usage

1. Drop or choose the first `.pptx` file.
2. Enter a project name and version note, then save the first version.
3. Edit the presentation normally in PowerPoint.
4. Drop the edited PPTX into the **edited PPTX** area, or choose it with the file button.
5. Review the detected changes and save the next version.
6. Use **Compare** to choose any saved versions or branch heads and inspect both Semantic Diff and the rendered slides.
7. Use **Branches** and **Merge** when you need to split or combine work.
8. Export important projects as `.pptxvc` files so the browser database is not your only copy.

In **History → Details**, edit a version’s display name and choose **Save name**. The name is captured when you press Save, so switching or closing details cannot save another version’s input. Repeated clicks share one pending save; a failed save can be retried. Labels do not change the saved PPTX or commit identity.

A small first-run sample is included at `examples/sample-presentation.pptx`.


### Visual Compare

The **Compare** tab keeps Semantic Diff as the source of truth and adds rendered-slide confirmation. Choose a Branch and Version on each side, then review the selected slide with:

- **Side by side** — Shows both versions at the same slide geometry. On narrow screens the two slides stack vertically.
- **Overlay** — Places both versions on the same stage and lets you choose which version is on top.
- **Split** — Clips the revised side with an on-slide draggable boundary without resizing either slide.
- **Blink** — Alternates the two versions, with a pause/resume control; automatic blinking is not started when reduced motion is requested.

Use category filters or **Changed slides only** to narrow the result list. Visual markers are linked to the Semantic Diff cards, but text changes deliberately mark the whole affected text box instead of guessing an exact changed-word position. Speaker-note changes remain available as a separate comparison area.

After dropping an edited PPTX, **Visual Compare** can also compare the current branch HEAD with that unsaved file before you save a new version. This review is read-only and does not create a commit.

### History and restore

Opening a historical version is read-only and does not move the current branch HEAD. You can export that version as a PPTX, compare it with another saved version, or restore its content as a new version while keeping the existing history.

To continue editing from an older point without changing the current branch, create a new branch from that saved version.

### Branches and merge

Each branch has its own HEAD. When merging another branch into the current branch, the app finds a common BASE and compares BASE / current / incoming states.

Changes on different slides, different objects, or different supported properties can be merged automatically when the app can safely materialize the result. Conflicting edits are sent to the Conflict Resolver instead of being forced into the PPTX.

### Project backup

Project history is stored in IndexedDB. Browser data can be cleared, so important projects should also be exported as `.pptxvc` files.

A `.pptxvc` file contains project metadata, refs, commits, and the required content-addressed objects. Imported projects are structurally validated and object sizes and SHA-256 hashes are checked before storage.

## Git-friendly export

Use **Export for Git** from project management, or export a saved version from Version Details. The generated ZIP contains normalized files such as:

```text
manifest.json
presentation.json
slides/
  <stable-slide-id>.json
media/
  <sha256>.<ext>
metadata/
  relationships.json
README.md
```

Slide files use stable IDs instead of slide numbers, so inserting or reordering slides does not rename every following file. Media files are deduplicated by SHA-256, and relationship targets are resolved without volatile `rId` values.

Git-friendly export is for ordinary Git diff/review. It is not a complete project backup and does not create or push a `.git` repository. Use `.pptxvc` when you need the full PPTX Version Control history and original PPTX package data.

## Publish with GitHub Pages

The repository includes a workflow that builds the standalone HTML and deploys `dist/` to GitHub Pages.

1. Push the repository to GitHub as `htmlapps-pptx-version-control`.
2. Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
3. Push to `main`, or manually run **Deploy standalone app to GitHub Pages** from the Actions tab.
4. After a successful deployment, the demo is available at `https://ttomohisa.github.io/htmlapps-pptx-version-control/`.

Each push to `main` validates the repository, rebuilds the standalone HTML, checks the single-file output, and deploys the generated `dist/` directory when GitHub Pages is enabled.


> v1.1.2 exposes Visual Compare for saved versions, branch-to-branch review, and HEAD-to-unsaved-PPTX review while keeping all comparison work local and read-only until you explicitly save a version.

## Development and build layout

```text
.
├─ src/index.template.html       # Application template
├─ app.config.json               # App metadata and build settings
├─ assets/favicon.svg            # Favicon and upper-left app icon
├─ dependencies.json             # Bundled dependency declarations
├─ dependencies.lock.json        # Reviewed dependency lock
├─ build-standalone.bat          # Windows build entry point
├─ build-standalone.ps1          # Standalone HTML builder
├─ examples/
│  └─ sample-presentation.pptx   # Small first-run sample
├─ scripts/                      # Repository/build verification
└─ dist/
   ├─ index.html                 # Readable standalone app
   └─ index.self-extract.html    # Compressed self-extracting variant
```

Build the app:

```powershell
.\build-standalone.ps1
```

Run the repository checks:

```powershell
.\scripts\check-repository.ps1
```

Verify the readable standalone HTML directly:

```powershell
.\scripts\verify-standalone.ps1
```

The build process embeds the canonical SVG icon into both the favicon and app header, rejects unresolved placeholders, verifies standalone-network restrictions, generates the dependency/build manifests, and creates the optional self-extracting HTML.

## Privacy and runtime network protection

PPTX files and project history are processed in the browser. The app does not upload presentation contents to Browser Kitty or another server.

The generated HTML includes a Content Security Policy containing `connect-src 'none'`, so runtime `fetch`, XHR, WebSocket, and similar outbound connections are blocked by the page policy. GitHub Pages still requires the initial HTML request; for use with the network completely disconnected, open the generated `dist/index.html` locally.

Local project history is stored in IndexedDB on the device. Deleting browser site data can remove that history, which is why `.pptxvc` export is provided for portable backups.

## Limitations

- The stable input format is `.pptx`. `.pptm`, `.potx`, and `.ppsx` are not release targets yet.
- SmartArt, OLE objects, and unsupported OOXML extensions are preserved through the original package where possible, but may not receive detailed Semantic Diff.
- Some package-level or relationship-heavy conflicts cannot be safely combined property by property. The app keeps those as conflicts rather than forcing an unsafe merge.
- Historical versions open read-only. Create a branch from an older version when you want to continue editing from that point.
- Git-friendly export creates normalized files for a normal Git repository. It does not create, clone, push, or sync a Git repository.
- Local history depends on IndexedDB and can be removed when browser/site data is cleared.
- Large presentations, many embedded media files, or long histories can consume substantial browser memory and local storage.
- Normal Deflate-compressed PPTX parsing requires browser support for `DecompressionStream('deflate-raw')`; current Chrome and Edge are the primary targets.

## Dependencies

| Library | Version | License | Purpose |
| --- | ---: | --- | --- |
| @aiden0z/pptx-renderer | 1.2.4 | Apache-2.0 | Embedded high-fidelity slide rendering for Visual Compare |

PPTX package parsing, semantic modeling, repository storage, branch/merge logic, and Git-friendly export remain implemented by the app with browser APIs. The renderer is embedded into the single HTML at build time and does not create a runtime network dependency.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

## Contributing

Bug reports and feature proposals are welcome through GitHub Issues. See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance.

## License

Copyright © 2026 ttomohisa

Licensed under the [MIT License](LICENSE).

### Regression checks

Node.js 22 or later is required for development regression checks (not for using the standalone app). After changing source, run `build-standalone.ps1` to refresh both HTML variants and `pptx-version-control.html`, then run `scripts/check-repository.ps1`. The check rejects stale committed root HTML before building and runs the dialog, comparison, renderer, and release-parity checks. Include the refreshed root HTML in the change.
