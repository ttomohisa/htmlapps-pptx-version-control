# PPTX Version Control — App Specification

Version: 1.0.0

## Goal

PPTX Version Control is a browser-only tool for managing PowerPoint presentations with meaningful version-control concepts. The long-term product scope is Version / Diff / Branch / Merge.

v1.0.0 keeps the v0.9.1 workflow-first UI and adds drag-and-drop to the primary “edited PPTX” update step. Git-friendly Export and release-candidate hardening from v0.9.0 remain unchanged.

## Product principles

- Browser-only, registration-free, installation-free.
- Completely local processing: user PPTX files are not uploaded.
- Runtime network access is blocked.
- Single-HTML distribution is required.
- Preserve original OOXML parts and unknown/unsupported content.
- Do not regenerate PPTX from the simplified semantic model.
- Semantic hashes should represent meaningful presentation changes rather than ZIP or relationship-ID noise.

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

## Not in v1.0.0

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
