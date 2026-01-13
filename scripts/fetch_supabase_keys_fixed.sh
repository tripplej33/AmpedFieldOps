#!/usr/bin/env bash
set -euo pipefail

# Reliable Supabase key extractor (docker fallback). Writes SUPABASE_URL, DATABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY to stdout as key=value lines.

TMP_JSON=/tmp/supabase_status.json

run_supabase_status() {
  if command -v supabase >/dev/null 2>&1; then
    supabase status --output json > "$TMP_JSON" 2>/dev/null || true
  else
    docker run --rm -v "$PWD":/work -w /work supabase/cli supabase status --output json > "$TMP_JSON" 2>/dev/null || true
  fi
}

parse_with_jq() {
  if command -v jq >/dev/null 2>&1; then
    SUPABASE_URL=$(jq -r '.API_URL // .project.api.url // ""' "$TMP_JSON")
    DATABASE_URL=$(jq -r '.DB_URL // .project.db.url // ""' "$TMP_JSON")
    SERVICE_ROLE_KEY=$(jq -r '.SERVICE_ROLE_KEY // .SECRET_KEY // ""' "$TMP_JSON")
    ANON_KEY=$(jq -r '.PUBLISHABLE_KEY // .ANON_KEY // ""' "$TMP_JSON")
    echo "SUPABASE_URL=$SUPABASE_URL"
    echo "DATABASE_URL=$DATABASE_URL"
    echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
    echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
    return 0
  fi
  return 1
}

parse_with_grep() {
  SUPABASE_URL=$(grep -oP '"API_URL"\s*:\s*"\K[^\"]+' "$TMP_JSON" || true)
  DATABASE_URL=$(grep -oP '"DB_URL"\s*:\s*"\K[^\"]+' "$TMP_JSON" || true)
  SERVICE_ROLE_KEY=$(grep -oP '"SERVICE_ROLE_KEY"\s*:\s*"\K[^\"]+' "$TMP_JSON" || true)
  ANON_KEY=$(grep -oP '"PUBLISHABLE_KEY"\s*:\s*"\K[^\"]+' "$TMP_JSON" || true)
  echo "SUPABASE_URL=$SUPABASE_URL"
  echo "DATABASE_URL=$DATABASE_URL"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
}

run_supabase_status

if [ ! -s "$TMP_JSON" ]; then
  echo "# ERROR: Could not obtain supabase status JSON" >&2
  exit 2
fi

if parse_with_jq; then
  exit 0
else
  parse_with_grep
  exit 0
fi
