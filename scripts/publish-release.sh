#!/usr/bin/env bash
set -euo pipefail

# Publishing runs only on a trusted main revision. PRs test this script with mocked commands.
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
if [[ "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo "::error::Releases can only be published from main."
  exit 1
fi
if [[ ! "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Invalid release commit SHA."
  exit 1
fi

version="$(node -p "require('./app.config.json').version")"
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "::error::Expected a stable SemVer version in app.config.json."
  exit 1
fi

tag="v$version"
base="htmlapps-pptx-version-control-$tag"
assets=(
  "release-assets/$base.html"
  "release-assets/$base.self-extract.html"
  "release-assets/$base.zip"
  "release-assets/SHA256SUMS.txt"
)
for asset in "${assets[@]}"; do
  if [[ ! -s "$asset" ]]; then
    echo "::error::Missing or empty release asset: $asset"
    exit 1
  fi
done
if [[ ! -s "release-assets/RELEASE_NOTES.md" ]]; then
  echo "::error::Missing release notes."
  exit 1
fi

# Do not silently ignore API authentication failures as though a release were missing.
release_error="$(mktemp)"
trap 'rm -f "$release_error"' EXIT
if is_draft="$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json isDraft --jq '.isDraft' 2>"$release_error")"; then
  if [[ "$is_draft" == "true" ]]; then
    echo "::error::Draft $tag already exists. Review it before publishing or retrying."
    exit 1
  fi
  echo "Release $tag already exists; skipping without modifying the tag or assets."
  exit 0
elif ! grep -Eqi 'HTTP 404|not found' "$release_error"; then
  cat "$release_error" >&2
  echo "::error::Could not check existing GitHub Releases."
  exit 1
fi

# Use Git's read-only remote listing. Never delete or move an existing tag.
# The ^{} suffix peels annotated tags to their target commit.
remote_refs="$(git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")"
tag_sha="$(printf '%s\n' "$remote_refs" | awk -v ref="refs/tags/$tag^{}" '$2==ref {print $1;exit}')"
if [[ -z "$tag_sha" ]]; then
  tag_sha="$(printf '%s\n' "$remote_refs" | awk -v ref="refs/tags/$tag" '$2==ref {print $1;exit}')"
fi

if [[ -n "$tag_sha" ]]; then
  if [[ "$tag_sha" != "$GITHUB_SHA" ]]; then
    echo "::error::Existing $tag points at $tag_sha, not $GITHUB_SHA. Refusing to move the tag."
    exit 1
  fi
  tag_options=(--verify-tag)
  echo "Existing $tag points at the intended commit."
else
  # gh release create creates the missing tag when --target is supplied.
  # Avoid the separate POST /git/refs request that returned HTTP 404.
  tag_options=(--target "$GITHUB_SHA")
  echo "No $tag tag exists; the release command will create it at $GITHUB_SHA."
fi

gh release create "$tag" "${assets[@]}" \
  --repo "$GITHUB_REPOSITORY" \
  "${tag_options[@]}" \
  --title "PPTX Version Control $tag" \
  --notes-file "release-assets/RELEASE_NOTES.md"

if [[ "$(gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json isDraft --jq '.isDraft')" != "false" ]]; then
  echo "::error::Release $tag was not published."
  exit 1
fi
echo "Published PPTX Version Control $tag."
