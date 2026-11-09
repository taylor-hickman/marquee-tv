#!/usr/bin/env bash
# Fails when this branch changes or removes a migration that is already on main
# (CLAUDE.md: a schema change is a new file), or adds one that sorts before
# main's latest, which `supabase db push` would refuse to apply.
#
#   db/check-migrations.sh [base]    base defaults to origin/main
set -euo pipefail

base=${1:-origin/main}
dir=supabase/migrations
fork=$(git merge-base "$base" HEAD)

# Against the fork point, so files main added since then don't count, and
# against the working tree, so an uncommitted edit counts.
changed=$(git diff --name-only --diff-filter=DMRT "$fork" -- "$dir")
if [[ -n $changed ]]; then
  echo "Migrations already on $base were changed. Add a new migration instead:" >&2
  echo "$changed" >&2
  exit 1
fi

latest=$(git ls-tree --name-only "$base" "$dir/" | grep '\.sql$' | sort | tail -n 1)
early=$(git diff --name-only --diff-filter=A "$fork" -- "$dir" |
  grep '\.sql$' | awk -v latest="$latest" '$0 <= latest' || true)
if [[ -n $early ]]; then
  echo "These migrations sort before $base's latest ($latest). Recreate them with supabase migration new:" >&2
  echo "$early" >&2
  exit 1
fi
