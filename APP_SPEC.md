# PPTX Version Control — App Specification

Version: 1.1.0

## Goal

PPTX Version Control is a browser-only tool for managing PowerPoint presentations with meaningful version-control concepts. The long-term product scope is Version / Diff / Branch / Merge.

v1.1.2 exposes PPTX Diff-style Visual Compare on top of the existing Semantic Diff and local repository. Saved versions, branch heads, and the unsaved working PPTX use one read-only comparison path, while Semantic Diff remains the source of truth and the renderer is used for visual confirmation.

## Product principles

- Browser-only, registration-free, installation-free.
- Completely local processing: user PPTX files are not uploaded.
- Runtime network access is blocked.
- Single-HTML distribution is required.
- Preserve original OOXML parts and unknown/unsupported content.
- Do not regenerate PPTX from the simplified semantic model.
- Semantic hashes should represent meaningful presentation changes rather than ZIP or relationship-ID noise.

## v1.0.1 Compare Core Alignment

v1.0.1 is an internal comparison-foundation release for the v1.1.2 Visual Compare work. It does not add a new user-facing comparison mode. Existing Semantic Diff output and workflow remain unchanged.

The comparison layer now uses a normalized `ComparisonSession` model:

```text
ComparisonInput
 ├─ empty
 ├─ saved commit
 └─ working PPTX

ComparisonSession
 ├─ from / to
 ├─ Semantic Diff result
 ├─ slide pairs
 ├─ stable category IDs
 └─ visual-marker IDs / renderer cache keys
```

Requirements:

- Saved commits are resolved without switching the active branch or moving `HEAD`.
- The currently loaded unsaved PPTX can be represented as a working comparison input without writing repository state.
- Commit and working inputs expose stable cache keys for the future Visual Renderer.
- A package resolver can obtain the exact stored PPTX Blob for a commit or the current working File without reconstructing from the semantic model.
- Comparison categories are fixed to `text`, `number`, `object`, `image`, `layout`, `formatting`, and `notes`, matching PPTX Diff terminology.
- Slide-pair models expose deterministic pair IDs and marker IDs such as `<pair>:text:1` without changing Semantic Diff classification.
- Existing parent diff and arbitrary two-version diff are routed through the same comparison-session builder.
- v1.0.1 must not change Version / Branch / Merge / Conflict Resolver behavior or Semantic Diff counts.

## v1.0.0 scope

### Package foundation retained from v0.1.x

1. Accept `.pptx` by file picker and drag-and-drop.
2. Parse the ZIP central directory without runtime external libraries.
3. Reject encrypted ZIP, ZIP64, unsafe paths, malformed central directories, and packages exceeding safety limits.
4. Resolve ordered slide parts and speaker-note relationships.
5. Inspect package parts and basic statistics.
6. Rebuild the package using original compressed payloads.
7. Verify rebuilt entry metadata before save where practical.
8. Save a valid `.pptx` locally.

### Semantic Model

For each presentation, build a model containing:

- source SHA-256
- presentation semantic SHA-256 fingerprint
- slide size
- ordered slides
- object / text / media / notes counts
- canonicalization statistics

For each slide, keep:

- stable ID
- original PowerPoint slide ID
- source part path
- title
- speaker notes
- theme path / theme fingerprint
- raw XML SHA-256
- canonical XML SHA-256
- semantic SHA-256 fingerprint
- ordered semantic objects

For each supported object, extract where available:

- stable ID and source shape ID
- object type
- placeholder type
- text
- geometry: x / y / width / height / rotation
- formatting: font, size, bold, italic, text color, fill, line color, line width
- text layout
- shape preset
- text-box flag
- referenced image / chart resource information
- referenced resource SHA-256
- semantic SHA-256 fingerprint

Unknown OOXML remains in the original package even when it is not represented by the semantic model.

### Stable ID v1

Stable IDs prefer PowerPoint creation IDs where available. Otherwise they fall back to the slide ID plus source shape ID. If neither exists, a deterministic fallback signature is used.

The v1.0.0 stable-ID implementation is the initial matching layer. More advanced rename / copy / similarity matching may be added later without changing the round-trip package invariant.

### Canonicalization

Canonical XML must:

- keep child order
- sort XML attributes deterministically
- normalize relationship references from `rIdN` to their resolved target part
- ignore known volatile attributes such as `dirty` and `smtClean`
- ignore formatting whitespace between XML elements
- preserve meaningful text and attributes

Canonicalization is diagnostic and comparison-oriented. It does not replace the original OOXML parts.

### SHA-256

Use SHA-256 for presentation, slide, object, theme, raw XML, canonical XML, and referenced-resource fingerprints.

Use Web Crypto when available and a local JavaScript SHA-256 fallback otherwise so the single-HTML build does not require a network dependency.

### Debug / inspection UI

The Semantic Model tab must provide:

- presentation fingerprint
- object count
- relationship references normalized
- volatile internal attributes ignored
- per-slide stable ID and fingerprint
- per-slide object count and note status
- Semantic JSON view
- Canonical XML view
- Raw XML view

Detailed implementation terms stay inside this analysis/detail area instead of being required for the initial file-selection flow.

### Local Repository / Commit

The repository layer uses IndexedDB and contains four logical stores:

- `objects`: SHA-256 keyed blobs for source PPTX, canonical semantic snapshots, and tree objects
- `commits`: immutable version records with parent, tree, message, timestamp, source filename, source SHA-256, and semantic fingerprint
- `projects`: project metadata and total reachable-version count
- `refs`: symbolic `HEAD` plus one or more `refs/heads/*` branch refs

A first Save Version creates a project, `refs/heads/main`, symbolic `HEAD`, and the initial commit. Later PPTX replacements are saved as child commits of the active branch HEAD. Exact duplicate source SHA-256 at that branch HEAD is not committed again.

The semantic object deliberately excludes raw XML SHA-256 and volatile canonicalization diagnostics so save-only OOXML noise can reuse the same semantic object when presentation meaning is unchanged.

### Project reopen

The start screen lists projects stored in the current browser. Opening a project resolves `HEAD`, reads its tree, restores the source PPTX object, reparses it, and opens the history view.

### `.pptxvc` portability

A project can be exported to one `.pptxvc` file containing project metadata, refs, commits, and all required objects. Imported object payloads are SHA-256 verified before being written to IndexedDB. Imported projects receive a new local project ID so they can coexist with the source project.

### Semantic Diff

Each saved commit can be compared with its first parent. The initial commit is compared with an empty presentation.

The diff engine must detect and summarize:

- added / removed slides
- slide reordering using matched-slide order rather than raw slide numbers
- changed text and token-level before / after display
- changed numeric tokens
- added / removed / replaced images
- added / removed / otherwise changed objects
- x / y / width / height / rotation and text-layout changes
- basic formatting changes: font, size, bold, italic, text color, fill, line color, line width
- speaker-note changes

Slide matching prefers stable IDs, then exact semantic hashes, then semantic similarity. Object matching uses stable IDs first, then exact hashes, placeholder roles, and semantic / geometric similarity.

A layout tolerance of approximately 1 pt is applied so tiny coordinate noise is not reported as a meaningful layout change. Relationship IDs, volatile attributes, and other canonicalization noise never enter the Semantic Diff snapshot.

History rows provide a **View changes** action. After saving a non-initial version, the app opens the diff against its parent automatically.

## History / Checkout / Restore

### Open a saved version

Any commit in the active branch can be opened from History. Opening an older commit loads its stored source PPTX into the workspace without moving the active branch ref or symbolic `HEAD`. The UI enters an explicit read-only past-version mode. To continue work from that historical point, the user creates a new branch from that version.

### Historical PPTX export

Every saved commit can export its exact stored PPTX object. The exported filename includes the local version number. No semantic-model regeneration is used for historical export.

### Revert

Revert is additive. It must not rewrite or delete existing history. Choosing an older commit creates a new commit whose:

- parent is the current active branch HEAD
- tree is the selected historical commit tree
- source SHA-256 and semantic fingerprint match the selected tree
- message clearly records that an older version was restored

After the new commit is created, the active branch ref moves to it and the Semantic Diff against the previously current version is shown.

### Arbitrary two-version comparison

The Diff view provides From / To selectors populated from project history. The selected semantic snapshots are compared with the existing PowerPoint-aware Semantic Diff engine. Reversing From / To is allowed and naturally reverses added / removed semantics.

### Version details and display names

Each history item exposes a details dialog containing version number, saved time, source filename, package size, content hash, and Commit ID. A user may set an optional display name. This label is mutable presentation metadata and does not alter the immutable commit ID or original commit message.

### Repository cleanup foundation

The local repository walks every branch ref in every local project, finds all reachable commits, then removes unreachable commits and unreferenced tree / package / semantic objects. History still reachable from any branch must never be deleted by this cleanup.

## Branch

### Refs and symbolic HEAD

Branches are stored as `refs/heads/<name>` records. `HEAD` is a symbolic ref pointing to the active branch. A project must always keep at least one branch. The active branch cannot be deleted.

### Create branch

A branch can be created from the current branch HEAD or from any saved commit available in the project. Creating a branch also switches symbolic `HEAD` to the new branch and loads its starting commit.

Branch names are validated locally. Empty names, control characters, Git-reserved punctuation, leading/trailing separators, repeated separators, `@{`, and `.lock` endings are rejected.

### Switch branch

Switching a branch changes symbolic `HEAD`, reloads that branch's HEAD PPTX, and replaces the History / comparison selectors with that branch's first-parent history. No presentation data is uploaded or copied to a server.

### Rename / delete

A branch can be renamed without rewriting commits. Renaming the active branch updates symbolic `HEAD`. A non-current branch can be deleted after confirmation. Deleting a branch removes only its ref; shared commits remain reachable through other refs. Unreachable commits and objects are removed only by local storage optimization.

### Export / import

`.pptxvc` export includes all reachable commits, objects, branch refs, and the symbolic `HEAD`. Deleted-branch orphan commits are not exported. Import remaps local project / commit IDs while preserving branch topology and the active branch.

### Branch view

The Branches view shows each branch name, branch HEAD, number of first-parent versions, and a best-effort fork point from `main`. The repository header includes a branch selector for quick switching.

## 3-way Merge

### Merge base

The merge engine walks all commit parents, including previous merge commits, and chooses the nearest common ancestor of the active branch (OURS) and selected source branch (THEIRS).

### Semantic merge

BASE / OURS / THEIRS are merged hierarchically. A value is accepted automatically when both sides agree, when only OURS changed, or when only THEIRS changed. Divergent edits to the same semantic property become conflicts. Delete/modify, add/add, and incompatible slide-order changes are also conflicts.

The engine operates at:

- slide level
- object level
- property groups including text, geometry, formatting, text layout, resource reference, shape preset, and notes

### PPTX materialization

The generated PPTX starts from OURS and preserves untouched OOXML. Whole-slide changes can be copied from THEIRS together with their related parts. Mixed-slide changes patch only supported basic shape/object properties. If a package-level change cannot be applied without risking unrelated OOXML, it is promoted to a merge conflict instead of silently rewriting the presentation.

### Merge commit

A successful merge creates an immutable commit whose first parent is the previous active-branch HEAD and whose second parent is the selected source-branch HEAD. The active branch ref moves to this merge commit; the source branch is not modified.

## Conflict Resolver

Merge conflicts are resolved locally using BASE / OURS / THEIRS. Each conflict can choose the current branch value, the incoming branch value, or a manually edited value when the conflict is plain text. Package-level conflicts that cannot be patched safely require selecting a whole safe side rather than silently rewriting unsupported OOXML. A merge commit is created only after all required conflicts are resolved and the resulting PPTX can be materialized.

## Git-friendly Export

The active branch HEAD or any saved commit can be exported as a deterministic ZIP intended for placement in an ordinary Git repository. The export contains:

- `manifest.json`: project / branch / version / commit metadata
- `presentation.json`: ordered slide index and presentation-level semantic information
- `slides/<stable-id>.json`: one normalized semantic JSON file per slide
- `media/<sha256>.<ext>`: PPTX media deduplicated by content hash
- `metadata/relationships.json`: resolved relationship targets without volatile `rId` values
- `README.md`: bilingual explanation of the export format

Slide filenames are based on stable IDs rather than slide numbers so inserting or reordering slides does not rename every following file. The Git export intentionally omits the original OOXML package; use `.pptxvc` for complete project history and exact PPTX package backup.

## v1.0.0 hardening

- Reject duplicate ZIP entry names as ambiguous/unsafe packages.
- Validate `.pptxvc` project structure before any imported records are written.
- Validate object IDs, declared sizes, commit parent topology, tree references, branch refs, and symbolic HEAD.
- Recheck imported object byte length and SHA-256.
- Cap Git-export entry count and total generated data size.
- Use deterministic stored-ZIP metadata for Git-friendly export to avoid timestamp-only export churn.


## v1.0.2 Renderer Foundation

The app embeds `@aiden0z/pptx-renderer` 1.2.4 as a build-time dependency for Visual Compare.

- Renderer input is the existing `ComparisonInput`, so saved commits and the current unsaved PPTX use the same preparation path.
- Saved commits are resolved to their exact stored PPTX object; semantic JSON is never used to regenerate the slide package.
- The pinned renderer module is decompressed from the single HTML, patched for the same text-color precedence correction used by PPTX Diff, and imported through a local Blob URL.
- PPTX parsing uses the renderer's recommended ZIP safety limits.
- Prepared presentations are cached by comparison input + renderer version with a small LRU cache.
- Renderer media Blob URLs and render handles are explicitly disposed.
- A renderer failure does not affect Semantic Diff, repository history, branch, merge, or round-trip export.
- The foundation accepts semantic slide indices and returns the renderer handle required by the future Visual Compare layer.

Acceptance cases:

- A working PPTX can be prepared and at least one slide can be rendered without runtime network access.
- A stored-commit PPTX resolves through the same renderer preparation API.
- Re-preparing the same input reuses the prepared-presentation cache.
- Changing the source SHA / commit produces a different renderer cache key.
- Disposing a rendered slide releases its renderer handle.
- `connect-src 'none'` and single-HTML operation remain unchanged.


## v1.0.3 Visual Compare Hardening

v1.0.3 does not expose the final Visual Compare UI yet. It connects repository inputs to the renderer safely and defines the lifecycle that v1.1.2 will use.

Requirements:

- Compare branch HEADs without switching the current branch or changing symbolic `HEAD`.
- Build `HEAD -> unsaved working PPTX` sessions without saving the working file first.
- Represent Added / Removed slides explicitly so one missing side does not make rendering fail.
- Build a lazy render plan for the selected slide plus nearby slides instead of rendering the entire deck.
- Guard asynchronous render work with a generation/epoch value so stale results are discarded after the user changes files or comparison sessions.
- Keep render handles scoped by slide pair and release handles outside the active lazy window.
- Protect prepared presentations still used by active visual pairs from LRU eviction.
- Clear visual render handles when the loaded working PPTX or comparison session changes.
- Renderer failure remains isolated from Semantic Diff, History, Branch, Merge, Conflict Resolver, and exact PPTX export.

Acceptance cases:

- `saved commit -> saved commit` uses the same renderer preparation API.
- `branch HEAD -> branch HEAD` resolves both refs without mutating the active branch.
- `HEAD -> unsaved PPTX` builds a working comparison session without creating a commit.
- A five-slide comparison with slide 3 selected plans only slides 2-4 with the default lazy radius.
- Added and Removed pairs expose which side is unavailable instead of throwing.
- Starting a new visual cycle makes older asynchronous render results stale.
- Pair-scoped renderer handles are disposed when they leave the lazy window.
- Prepared presentation cache eviction skips entries still referenced by active render pairs.
- `connect-src 'none'` and single-HTML operation remain unchanged.


## v1.1.2 Visual Compare

Visual Compare is a user-facing read-only review layer built on top of the existing Semantic Diff. It must never replace the semantic comparison result or mutate repository state merely because a comparison is opened.

### Comparison inputs

The Compare tab supports:

- saved commit vs saved commit on the same branch
- saved commit vs saved commit across different branches
- current branch HEAD vs the currently loaded unsaved working PPTX

Each side exposes Branch and Version selectors. Branch comparison resolves refs without switching the active branch or moving symbolic `HEAD`. When an unsaved working PPTX is available, it can appear as a working comparison input. The default saved comparison is the parent of HEAD to HEAD where possible.

### Result model and filters

Semantic Diff remains the source of truth. The result UI exposes Text, Number, Object, Image, Layout, Formatting, and Speaker notes categories, plus a **Changed slides only** toggle. Slide rows preserve Added, Removed, Changed, Moved, Unchanged, and Review states.

### Visual modes

The selected slide pair can be reviewed with:

- **Side by side** — both slides use the same slide geometry; narrow screens may stack them vertically.
- **Overlay** — both slides occupy the same stage and the user may choose which side is on top.
- **Split** — the revised layer is clipped by an on-stage draggable boundary; neither slide is resized by the split position.
- **Blink** — alternates the two rendered versions, with an explicit pause / resume action. Automatic blinking must not start when `prefers-reduced-motion: reduce` is active.

Added / Removed slide pairs keep one explicit missing side rather than failing the visual renderer. Renderer failure must leave Semantic Diff usable.

### Difference markers

Semantic markers use deterministic IDs derived from the comparison slide pair and category. Markers are shown for supported Text, Number, Object, Image, Layout, and Formatting changes where geometry is available. Text changes mark the affected text-box geometry rather than estimating an exact changed-word location.

Markers can be hidden without changing comparison data. Selecting a marker highlights the matching Semantic Diff card and selecting/focusing a card highlights the matching marker. This linkage must not unexpectedly scroll the whole page.

### Speaker notes

Speaker-note changes are shown separately from the rendered slide because they are not visible slide content. A note-only edit still marks the slide as changed and is discoverable through the Speaker notes filter.

### Pre-save review

When an edited PPTX is loaded and it has meaningful unsaved changes, the Save Version area exposes **Visual Compare**. It compares current branch HEAD to the working PPTX and does not create a commit. The user may return to the save workflow and commit only after explicit confirmation through the existing Save Version action.

### Rendering lifecycle

- Render only the selected pair and a small nearby lazy window rather than all slides.
- Use commit/source-SHA + slide identity + renderer version as cache identity.
- Discard stale asynchronous render results after comparison/file changes.
- Dispose pair-scoped render handles and media Blob URLs when no longer needed.
- Preserve the existing renderer fallback so a rendering error does not affect repository, merge, export, or Semantic Diff.

### Mobile and accessibility

- The page must not horizontally scroll at 320 / 360 / 390 px.
- Side by side may stack vertically on smartphones.
- Visual mode controls remain reachable with touch-sized targets.
- Previous / Next navigation is available in a compact mobile action row.
- Mode controls expose pressed state, markers are keyboard focusable, and color is not the only change signal.
- Blink exposes an explicit pause / resume control and respects reduced-motion preferences.

### Privacy and packaging

- Visual rendering uses only PPTX bytes already available locally from IndexedDB or the working file.
- Renderer resources are embedded in the standalone HTML.
- No CDN, iframe, external image/font fetch, or PPTX Diff runtime dependency is introduced.
- CSP retains `connect-src 'none'`.
- `dist/index.html` and the self-extracting variant must contain the full Visual Compare implementation without runtime external dependencies.

### v1.1.2 acceptance cases

- Parent -> HEAD, arbitrary saved version pairs, reversed version order, and cross-branch comparisons work without moving HEAD.
- HEAD -> unsaved PPTX can be opened before Save Version and creates no commit by itself.
- Side by side, Overlay, Split, and Blink render the same selected slide geometry.
- Split changes clipping only; dragging the boundary does not resize slide content.
- The same image moved to another position produces Layout Diff and zero Image replacement changes.
- Formatting-only and note-only changes mark the slide Changed in both summary and filtering.
- Added / Removed slides can be selected in Visual Compare and clearly show the missing side.
- Relationship-ID/save-only noise still produces zero meaningful changes.
- Visual markers and Semantic Diff cards remain linked and can be hidden without changing comparison results.
- Japanese and English layouts fit 320 / 360 / 390 px with long names and no page-level horizontal scrolling.
- `connect-src 'none'`, standalone operation, exact historical PPTX export, Branch, Merge, Conflict Resolver, and Git-friendly export remain regression-free.

## Not in v1.1.2

- Native `.git` repository generation or GitHub push
- `.pptm`, `.potx`, or `.ppsx` as supported release targets
- Full semantic editing for every SmartArt / OLE / unsupported OOXML extension

## Canonicalization acceptance cases

### Save-only relationship noise

If a slide relationship ID changes from `rId2` to `rId90` while still pointing to the same resource:

- raw XML SHA-256 may change
- canonical XML SHA-256 must remain the same
- slide semantic fingerprint must remain the same
- presentation semantic fingerprint must remain the same

### Volatile OOXML attribute noise

If a known volatile attribute such as `dirty="0"` is added or removed without changing presentation meaning:

- raw XML SHA-256 may change
- canonical XML SHA-256 must remain the same
- semantic fingerprint must remain the same

### Meaningful content change

If visible text, geometry, formatting, a referenced image/chart, or speaker notes change:

- the affected semantic fingerprint must change
- the presentation semantic fingerprint must change

## Round-trip invariant

For an input PPTX with no content edits:

`Input PPTX -> Parse package -> Build semantic model -> Rebuild original package -> Export PPTX`

The semantic-model step must not modify the stored OOXML package. The exported package must retain all original ZIP entries and entry payload bytes.

## Safety limits

- Maximum ZIP entries: 20,000
- Maximum total declared uncompressed size: 2 GiB
- Maximum XML / RELS entry read size: 32 MiB
- Reject suspicious high expansion ratios for large entries
- Reject path traversal / absolute ZIP paths
- Reject encrypted ZIP
- Reject ZIP64 in v1.0.0
- Reject XML containing DOCTYPE / ENTITY declarations

## Browser support

Primary: current Chrome / Edge.

Normal Deflate-compressed PPTX parsing requires `DecompressionStream('deflate-raw')`. Browsers without this capability must show a clear unsupported-browser message.

## Privacy

The app must not send user PPTX data to Browser Kitty or any external server. CSP must keep runtime `connect-src 'none'`.

## Acceptance criteria

- Normal PowerPoint `.pptx` loads successfully.
- Slide order, text, basic objects, geometry, formatting, referenced resources, and speaker notes are extracted where present.
- Stable IDs and SHA-256 fingerprints are created.
- Relationship-ID renumbering alone does not change canonical or semantic fingerprints.
- Known volatile XML attributes do not change canonical or semantic fingerprints.
- Meaningful text changes do change the semantic fingerprint.
- The Semantic Model / Canonical XML / Raw XML inspector works in Japanese and English.
- v0.1.x round-trip export remains regression-free.
- A first Save Version creates Project / Tree / Commit / `main` / `HEAD` records.
- A second changed PPTX creates a child commit and history shows both versions.
- Exact duplicate source PPTX does not create another commit.
- A saved project can be reopened from the local project list and restores the current HEAD PPTX.
- `.pptxvc` export/import preserves the project history and verifies object SHA-256 values.
- Each commit can open a Semantic Diff against its parent.
- Each saved commit can be opened in a clearly marked read-only past-version mode without moving `HEAD`.
- Any historical commit can export its stored PPTX.
- Returning to latest restores the current `HEAD` PPTX and re-enables Save Version.
- Revert creates a new child commit of current `HEAD` that reuses the selected historical tree; existing commits remain intact.
- Any two distinct saved versions can be selected and compared.
- Optional version display names do not change Commit IDs or commit messages.
- Object cleanup removes only objects not referenced by any stored commit.
- Save-only relationship-ID / volatile-metadata noise produces zero meaningful changes.
- Text and number changes are reported separately.
- Image replacement, object add/remove, layout, formatting, notes, and slide add/remove/reorder changes are represented by dedicated diff categories.
- Conflict Resolver can resolve semantic conflicts with current / incoming choices and manual text resolution, then create a two-parent merge commit.
- Git-friendly export creates stable slide JSON filenames, deduplicated SHA-256 media names, normalized relationships, and presentation / manifest JSON.
- Slide reordering does not rename stable slide JSON files.
- Duplicate ZIP entry names are rejected.
- Invalid `.pptxvc` topology, missing objects, mismatched declared sizes, or SHA-256 mismatches are rejected before import completes.
- Desktop and smartphone layouts have no horizontal scrolling.
- `dist/index.html` has no unresolved build placeholders or runtime external dependency.
- Self-extract payload restores `dist/index.html` byte-for-byte.


## v1.1.2 matching correction

- Slide IDs are identity evidence, not absolute identity. Insertions or regenerated packages may reuse/shift slide IDs.
- Matching order is exact semantic fingerprint anchors → guarded slide-ID evidence → weighted similarity.
- Weighted similarity uses title, body text, object/placeholder profile, embedded-resource hashes, and coarse geometry.
- Low-confidence matches are not used as move anchors.
- Object source IDs are likewise guarded by object type plus content, geometry, placeholder, resource, or name evidence.
- Regression requirement: the PPTX Diff insertion fixture must report the inserted Executive Summary as Added while matching Sales Overview, Visual Assets, Layout and Formatting, Object Inventory, and Closing to their corresponding revised slides.
