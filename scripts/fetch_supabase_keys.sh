#!/usr/bin/env bash
# Helper: fetch Supabase keys using `supabase status --output json` and print key=value lines
set -euo pipefail

OUT_FILE="/tmp/supabase_status_$$.json"
cleanup(){ rm -f "$OUT_FILE"; }
trap cleanup EXIT

if ! command -v supabase &> /dev/null; then
  echo "ERROR: supabase CLI not found" >&2
  exit 2
fi

supabase status --output json > "$OUT_FILE" || { echo "ERROR: supabase status failed" >&2; exit 3; }
