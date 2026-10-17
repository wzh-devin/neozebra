#!/usr/bin/env bash
set -euo pipefail

release_tag=${1:?Usage: check-release-tag.sh vX.Y.Z [main-ref]}
main_ref=${2:-origin/main}

if [[ ! "$release_tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  printf 'Release tag must have the exact format vX.Y.Z: %s\n' "$release_tag" >&2
  exit 1
fi

release_commit=$(git rev-parse --verify "refs/tags/${release_tag}^{commit}")
if ! git merge-base --is-ancestor "$release_commit" "$main_ref"; then
  printf 'Release commit must already be in main: %s\n' "$release_commit" >&2
  exit 1
fi
printf '%s\n' "$release_commit"
