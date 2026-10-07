# Changelog

## [Unreleased]

### Added
- Add **Compare with latest** to older History rows, comparing the selected saved version with the active branch’s saved HEAD captured at click time without changing the working PPTX, checkout, branch or repository.


### Fixed
- Own parent, arbitrary-pair and working comparisons by request and project/source context, suppressing stale sessions, errors and finalizers after project, branch or source changes.
- Ignore repeated working-comparison triggers and retain the disabled comparison control until the current request finishes; current failures remain retryable.
- Add actual-source comparison ownership and History-shortcut boundary regressions to repository validation.
- Keep history details owned by the latest request so delayed reads cannot replace a newer selection or reopen a dismissed dialog.
- Capture the version display name on Save, prevent duplicate pending saves, and keep late save results out of newer dialogs or changed project/source contexts.
- Add deterministic dialog boundary regressions, include existing comparison/renderer regressions in repository checks, and keep the root standalone HTML synchronized with the default build.

## [1.1.3] - 2026-10-07

- Normalize the language switch to EN / JA and describe the target language in localized accessible names and tooltips.
- Preserve localized Help labels, privacy wording, and header layout; document the language controls in Help.
- Add source, readable, root-alias, and self-extract header regressions for repeated switching and saved language restoration.

## [1.1.2] - 2026-09-16

### Fixed
- Aligned slide matching with PPTX Diff so inserted slides do not cascade into false slide-to-slide matches when PowerPoint slide IDs are renumbered or reused.
- Exact semantic content is anchored first; slide IDs are now treated as supporting evidence and require content/structure similarity before being trusted.
- Improved fallback slide matching using title, text, object profile, embedded resources, and coarse geometry.
- Improved object matching by using shape source IDs only when supported by type/content/geometry evidence, reducing false Text/Object/Layout/Formatting differences after slide insertion.
- Added visible chevron icons to Visual Compare slide navigation on desktop and mobile.

## [1.1.0] - 2026-09-15

### Added
- Added PPTX Diff-style Visual Compare for saved versions, branch-to-branch comparisons, and HEAD-to-unsaved-PPTX review.
- Added Side by side, Overlay, Split, and Blink visual modes with lazy high-fidelity rendering.
- Added comparison filters for Text, Number, Object, Image, Layout, Formatting, and Speaker notes, plus a changed-slides-only view.
- Added Semantic Diff-linked visual markers, marker visibility controls, Previous / Next navigation, and mobile Visual Compare navigation.
- Added a pre-save **Visual Compare** action after loading an edited PPTX so changes can be reviewed before a new version is committed.

### Changed
- Renamed the project Diff tab to **Compare** and expanded it with read-only Branch / Version selectors.
- Kept Semantic Diff as the source of truth while using the embedded renderer only for visual confirmation.
- Kept branch comparison read-only: comparing another branch never switches the active branch or moves symbolic HEAD.

## [1.0.3] - 2026-09-15

### Added
- Added read-only branch-to-branch comparison inputs without switching the active branch or symbolic HEAD.
- Added HEAD-to-unsaved-working-PPTX comparison sessions for the upcoming pre-commit visual review flow.
- Added lazy Visual Compare render planning around only the selected slide and nearby slides.
- Added explicit Added / Removed-side rendering states, stale-render guards, pair-scoped handle cleanup, and renderer-view memory cleanup.

### Changed
- Hardened the embedded renderer pipeline before exposing the public Visual Compare UI in v1.1.0.

## [1.0.2] - 2026-09-15

### Added
- Embedded the same high-fidelity PPTX renderer foundation used by PPTX Diff.
- Added renderer preparation for saved Commit and unsaved working-PPTX comparison inputs.
- Added renderer cache keys, small LRU presentation caching, and explicit render/media cleanup.

### Changed
- Kept the renderer foundation internal; the public Visual Compare UI is planned for v1.1.0.

## [1.0.1] - 2026-09-15

### Changed
- Added a normalized internal comparison-session layer for saved commits, empty/base inputs, and the currently loaded working PPTX.
- Routed existing parent and arbitrary-version Semantic Diff through the same Compare Core without changing user-facing results.
- Standardized comparison category IDs and deterministic slide-pair / future visual-marker IDs to match PPTX Diff terminology.
- Added exact PPTX package resolvers and stable renderer cache keys as the foundation for v1.1.0 Visual Compare.


## [1.0.0] - 2026-09-15

### Added
- Added release screenshots for Japanese and English UI.
- Added a small sample PPTX for first-run verification.

### Changed
- Promoted the workflow-first PPTX version-control experience to the first stable release.
- Replaced the favicon and upper-left app icon with the finalized PPTX + version-control artwork.
- Reworked the English and Japanese README files to match the established Browser Kitty repository format.
- Updated help text and release metadata for v1.0.0.

### Verified
- Version / Diff / Branch / 3-way Merge / Conflict Resolver workflows remain available from the v0.9.2 release candidate.
- Single-HTML packaging, CSP network blocking, project import/export validation, Git-friendly export, and PPTX round-trip foundations were rechecked for the stable release.

## [0.9.2] - 2026-09-15

### Changed
- The primary “Choose edited PPTX” workflow now also accepts drag and drop.
- Added a dedicated edited-PPTX drop target while keeping file selection available for touch and keyboard users.

## [0.9.1] - 2026-09-15

### Added
- Added deletion for locally saved projects with a destructive-action confirmation.
- Added deletion access both from the saved-project list and the current project management section.

### Changed
- Reworked the UI around a clear next-step workflow instead of exposing technical panels first.
- The home screen now separates starting a new project from continuing a saved project.
- After saving a version, the primary next step becomes loading the edited PPTX.
- History, Diff, Branches, and Merge are the primary project navigation; file/package internals are moved under details.
- Meaning-equivalent PPTX files are no longer saved as duplicate versions when only internal save noise differs.

## [0.9.0] - 2026-09-15

### Added
- Git-friendly ZIP export for the current HEAD or any saved version.
- Stable per-slide JSON files, presentation index, resolved relationships, and SHA-256-deduplicated media for ordinary Git review.
- Project-import validation for object IDs, sizes, commit topology, refs, and symbolic HEAD before writing imported data.

### Changed
- Reject duplicate ZIP entry names in addition to unsafe paths and package expansion limits.
- Git export uses deterministic uncompressed ZIP entry metadata to avoid export-only timestamp noise.
- Git export rejects duplicate output paths before writing the ZIP.
- Updated release documentation for the complete Version / Diff / Branch / Merge / Conflict Resolver workflow.

## [0.8.0] - 2026-09-15

### Added
- Conflict Resolver for semantic and package-level merge conflicts.
- BASE / OURS / THEIRS conflict comparison with per-conflict resolution.
- Use Ours / Use Theirs decisions and manual editing for text conflicts.
- Conflict navigation, resolved-state tracking, and merge commit creation after all conflicts are resolved.

## [0.7.0] - 2026-09-15

### Added
- Added a 3-way merge engine using BASE / OURS / THEIRS and automatic merge-base discovery.
- Added slide-, object-, and property-level conflict detection.
- Added a Merge view for selecting a source branch, previewing automatic merges, and listing conflicts.
- Added conflict-free merge commits with two parents while preserving the active branch as the first parent.
- Added PPTX materialization for safe non-conflicting slide and basic object/property changes while preserving the original OOXML package as the base.

### Changed
- Project semantic snapshots now retain slide source-part metadata needed to materialize merges.
- `.pptxvc` export/import continues to preserve multi-parent commit topology.
- Mobile tabs now scroll inside the tab strip instead of causing page-level horizontal overflow.

## [0.6.0] - 2026-09-15

### Added
- Git-like local branches backed by `refs/heads/*` and a symbolic `HEAD`.
- Create a branch from the current HEAD or any saved commit.
- Branch switching with independent per-branch version history and HEAD.
- Branch rename and deletion with protected current-branch behavior.
- Branches view showing branch heads, version counts, and fork points from `main`.
- Create-branch action directly from Version Details.

### Changed
- Save Version and Revert now advance the currently selected branch instead of always writing to `main`.
- Project export/import preserves all branch refs and the active symbolic HEAD.
- Storage optimization removes commits unreachable from all branch refs and then cleans unreferenced objects.
- Project export includes only commits reachable from current branch refs, so deleted-branch orphan history is not resurrected on import.
- Mobile branch controls stack safely without horizontal overflow.

## [0.5.0] - 2026-09-15

### Added
- Open any saved version without moving `main` / `HEAD`.
- Export any historical version directly as a PPTX.
- Read-only past-version mode with an explicit return-to-latest action.
- Revert workflow that preserves history by creating a new commit from an older tree.
- Arbitrary comparison between any two saved versions.
- Version detail dialog with optional display-name metadata.
- Repository object cleanup foundation for unreferenced local objects.

### Changed
- History rows now show stable version numbers and provide Open / View changes / Details actions.
- The Diff view now includes explicit From / To version selectors.

## [0.4.0] - 2026-09-14

### Added
- Semantic Diff between each saved version and its parent commit.
- Slide matching with stable IDs, semantic hashes, and similarity fallback.
- Text, number, image, object, layout, formatting, and speaker-note change detection.
- Added / removed / moved slide detection and a change-summary view.
- History actions for opening a version's semantic changes.

### Changed
- Replaced the Japanese UI term 「指紋」 with clearer 「内容ハッシュ」 / 「ハッシュ」 wording.

## [0.3.0] - 2026-09-14

### Added
- Local IndexedDB repository with projects, refs, commits, and content-addressed objects.
- Save Version workflow with project name and version notes.
- Local project list and reopening of the latest committed PPTX.
- History view for the main branch and HEAD.
- Portable `.pptxvc` project export and import with SHA-256 integrity verification.

## [0.2.0] - 2026-09-14

### Added
- Semantic presentation / slide / object model based on the completed PPTX Diff parser.
- Text, images/charts, geometry, formatting, text layout, theme and speaker-note extraction.
- Stable IDs and SHA-256 fingerprints for presentation, slides, objects, themes and referenced resources.
- Canonical XML with relationship-target normalization and volatile OOXML attribute filtering.
- Semantic model inspector with Semantic JSON, canonical XML and raw XML views.
- New PPTX + version-control favicon/header icon.

### Preserved
- v0.1.x safe package parsing and round-trip PPTX export.

## [0.1.1] - 2026-09-13

### Changed
- Matched the drop area styling more closely to PPTX Diff.
- Refined the PPTX file icon and added a centered P mark for clearer PowerPoint recognition.

## [0.1.0] - 2026-09-13

### Added

- Initial PPTX Version Control package foundation.
- Local `.pptx` file picker and drag-and-drop.
- Dependency-free ZIP central-directory parser.
- OOXML presentation / relationship parsing and ordered slide discovery.
- Slide-title and speaker-note detection.
- Package summary and internal-part browser.
- Round-trip ZIP reconstruction using original compressed payloads.
- Rebuilt-package entry verification before download for normal-sized files.
- ZIP64, encryption, malformed package, unsafe path, expansion-ratio, and XML safety guards.
- Japanese / English UI.
- Mobile bottom actions.
- Single-HTML build with runtime network access blocked.
