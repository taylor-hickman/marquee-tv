# shellcheck shell=bash
# Shared by wizard.sh and verify.sh. Source it; don't run it.
#
# Values are piped from the CLI that produced them straight into Vercel and
# GitHub Actions. Nothing is written to disk (architecture 9.2).

PROVISION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$PROVISION_DIR/../.." && pwd)"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

# Override any of these from the environment.
GITHUB_REPO="${GITHUB_REPO:-taylor-hickman/marquee-tv}"
VERCEL_PROJECT="${VERCEL_PROJECT:-marquee-tv}"
SUPABASE_REGION="${SUPABASE_REGION:-us-east-1}"
GCP_PROJECT_NAME="${GCP_PROJECT_NAME:-Marquee TV}"
SENTRY_PROJECT_SLUG="${SENTRY_PROJECT_SLUG:-marquee-tv}"

ENVIRONMENTS=(preview production)

# supabase_project_name ENV: the Supabase project behind each environment (9.4).
supabase_project_name() {
  case "$1" in
    preview) echo "marquee-staging" ;;
    production) echo "marquee-production" ;;
  esac
}

# ── .env.example ──────────────────────────────────────────────────────────
# Prints "NAME STAGE TARGET..." for every variable, from the "# @stage targets"
# lines above each group.
env_inventory() {
  awk '
    /^# @/ { stage = substr($2, 2); targets = ""; for (i = 3; i <= NF; i++) targets = targets " " $i; next }
    /^[A-Z][A-Z0-9_]*=/ { split($0, kv, "="); print kv[1], stage targets }
  ' "$ENV_EXAMPLE"
}

# targets_of NAME: "vercel github", or a subset.
targets_of() { env_inventory | awk -v n="$1" '$1 == n { $1 = ""; $2 = ""; sub(/^ +/, ""); print }'; }

# ── Writing ───────────────────────────────────────────────────────────────
# vc runs the Vercel CLI against VERCEL_SCOPE (a team slug) when one is set.
vc() { if [[ -n "${VERCEL_SCOPE:-}" ]]; then vercel "$@" --scope "$VERCEL_SCOPE"; else vercel "$@"; fi; }

# put NAME ENV VALUE sets NAME in ENV (preview|production) on every target
# .env.example lists for it. Overwrites what is there.
put() {
  local name="$1" env="$2" value="$3" target vis
  [[ -n "$value" ]] || { printf '  ! %s is empty; not set\n' "$name" >&2; return 1; }
  for target in $(targets_of "$name"); do
    case "$target" in
      vercel)
        vis=--sensitive; [[ "$name" == NEXT_PUBLIC_* ]] && vis=--no-sensitive
        printf '%s' "$value" | vc env add "$name" --environment "$env" --project "$VERCEL_PROJECT" \
          "$vis" --force --yes >/dev/null
        ;;
      github)
        printf '%s' "$value" | gh secret set "$name" --env "$env" --repo "$GITHUB_REPO" >/dev/null
        ;;
    esac
    printf '  ✓ %s → %s %s\n' "$name" "$target" "$env"
  done
}

# put_both NAME VALUE: the same value in preview and production.
put_both() { local e; for e in "${ENVIRONMENTS[@]}"; do put "$1" "$e" "$2"; done; }

# ── Reading ───────────────────────────────────────────────────────────────
# present TARGET ENV prints the names that exist there, one per line.
present() {
  case "$1" in
    vercel) vc env ls --environment "$2" --project "$VERCEL_PROJECT" --json 2>/dev/null | jq -r '.envs[].key' ;;
    github) gh secret list --env "$2" --repo "$GITHUB_REPO" --json name -q '.[].name' 2>/dev/null ;;
  esac
}

# missing NAME... prints "NAME TARGET ENV" for each name not set somewhere it
# should be. Lists each target once per environment, not once per name.
missing() {
  local env target name have
  for env in "${ENVIRONMENTS[@]}"; do
    for target in vercel github; do
      have=$(present "$target" "$env" || true)
      for name in "$@"; do
        [[ " $(targets_of "$name") " == *" $target "* ]] || continue
        grep -qx "$name" <<<"$have" || echo "$name $target $env"
      done
    done
  done
}

# sb runs the Supabase CLI from a scratch workdir, so the project cache it
# writes (supabase/.temp) stays out of the repo; card T2 owns supabase/.
SB_WORKDIR="${TMPDIR:-/tmp}/marquee-provision"
sb() { mkdir -p "$SB_WORKDIR" && supabase --workdir "$SB_WORKDIR" "$@"; }

# ── CLI sessions ──────────────────────────────────────────────────────────
# logged_in CLI succeeds when that CLI has a working session.
logged_in() {
  case "$1" in
    gh) gh auth status >/dev/null 2>&1 ;;
    vercel) vc whoami >/dev/null 2>&1 ;;
    supabase) sb orgs list -o json >/dev/null 2>&1 ;;
    stripe) return 0 ;; # every Stripe call passes --api-key; no login needed
    gcloud) [[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]] ;;
    sentry-cli) return 0 ;; # every Sentry call passes the auth token
  esac
}

# supabase_ref NAME prints the ref of the project with that name, if any.
supabase_ref() {
  sb projects list -o json 2>/dev/null | jq -r --arg n "$1" '.[] | select(.name == $n) | .id'
}

# gcp_project_id prints the id of the Google Cloud project named GCP_PROJECT_NAME.
gcp_project_id() {
  gcloud projects list --filter="name=\"$GCP_PROJECT_NAME\"" --format='value(projectId)' 2>/dev/null | head -n1
}
