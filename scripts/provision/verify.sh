#!/usr/bin/env bash
# Confirms every variable in .env.example exists in Vercel and GitHub Actions,
# in both the preview and production environments, wherever .env.example says
# it belongs. Prints what is missing and the wizard stage that sets it.
# Checks names only; values can't be read back.
set -euo pipefail
# shellcheck source=lib.sh source-path=SCRIPTDIR
. "$(dirname "$0")/lib.sh"

for cli in gh vercel; do
  logged_in "$cli" || echo "$cli is not logged in, so everything it holds shows as missing: scripts/provision/wizard.sh --only clis"
done

names=$(env_inventory | awk '{print $1}')
# shellcheck disable=SC2086 # one name per word
gaps=$(missing $names)

if [[ -z "$gaps" ]]; then
  echo "✓ all $(wc -w <<<"$names" | tr -d ' ') variables exist in every target and environment"
  exit 0
fi

echo "Missing:"
while read -r name target env; do
  stage=$(env_inventory | awk -v n="$name" '$1 == n { print $2 }')
  printf '  %-38s %-7s %-11s → scripts/provision/wizard.sh --only %s\n' "$name" "$target" "$env" "$stage"
done <<<"$gaps"
exit 1
