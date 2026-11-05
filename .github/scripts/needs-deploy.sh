#!/usr/bin/env bash
# Prints deploy=true when a push changed anything that ends up in the images (or the pipeline itself),
# and deploy=false when it only touched docs, editor and git settings, the browser end-to-end suite or
# the local compose files.
#
#   needs-deploy.sh <before-sha> <after-sha> >>"$GITHUB_OUTPUT"
set -euo pipefail

before=${1:-}
after=${2:?usage: needs-deploy.sh <before-sha> <after-sha>}

# Paths that never reach an image. Everything else ships, workflows included.
ignored='(\.md$|^LICENSE$|^\.editorconfig$|^\.gitignore$|^\.prettier(rc|ignore)$|^\.env\.example$|^\.husky/|^\.vscode/|^e2e/|^infra/docker-compose\.[^/]+\.yml$)'

# The first push of a branch (before is all zeros) or a force push whose old head is gone: there's
# nothing to compare against, so ship.
if [[ ! $before =~ ^[0-9a-f]{40}$ || $before =~ ^0+$ ]] || ! git cat-file -e "$before^{commit}" 2>/dev/null; then
  echo 'No base commit to compare with; shipping.' >&2
  echo deploy=true
  exit 0
fi

changed=$(git diff --name-only "$before" "$after")
shipping=$(grep -v -E "$ignored" <<<"$changed" || true)

if [[ -n $shipping ]]; then
  printf 'Changes that ship:\n%s\n' "$shipping" >&2
  echo deploy=true
else
  printf 'Only docs or tooling changed; no new images and no deploy. Changed:\n%s\n' "$changed" >&2
  echo deploy=false
fi
