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

# Try jq first
if command -v jq &> /dev/null; then
  SUPABASE_URL=$(jq -r '.project.api.url // .project?.api?.url // ""' "$OUT_FILE")
  DATABASE_URL=$(jq -r '.project.db.url // .db?.url // ""' "$OUT_FILE")
  # Keys may be under project.keys array
  ANON_KEY=$(jq -r '.project.keys[]? | select(.name=="anon" or .name=="publishable") | .value' "$OUT_FILE" 2>/dev/null || true)
  SERVICE_ROLE_KEY=$(jq -r '.project.keys[]? | select(.name=="service_role" or .name=="secret") | .value' "$OUT_FILE" 2>/dev/null || true)
else
  # Node fallback
  if command -v node &> /dev/null; then
    read -r SUPABASE_URL <<< $(node - <<'NODE'
const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1]||0,'utf8'))
; console.log((s.project && (s.project.api?.url || s.project.api?.url)) || (s.api && s.api.url) || '')
NODE "$OUT_FILE")
    read -r DATABASE_URL <<< $(node - <<'NODE'
const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1]||0,'utf8'))
; console.log((s.project && (s.project.db?.url || s.db?.url)) || (s.db && s.db.url) || '')
NODE "$OUT_FILE")
    read -r ANON_KEY <<< $(node - <<'NODE'
const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1]||0,'utf8'))
; const k=(s.project&&s.project.keys)||s.keys||[]; for(const it of k){ if(it.name==='anon' || it.name==='publishable') console.log(it.value)}
NODE "$OUT_FILE")
    read -r SERVICE_ROLE_KEY <<< $(node - <<'NODE'
const fs=require('fs'); const s=JSON.parse(fs.readFileSync(process.argv[1]||0,'utf8'))
; const k=(s.project&&s.project.keys)||s.keys||[]; for(const it of k){ if(it.name==='service_role' || it.name==='secret') console.log(it.value)}
NODE "$OUT_FILE")
  else
    echo "ERROR: neither jq nor node available for parsing" >&2
    exit 4
  fi
fi

printf 'SUPABASE_URL=%s
'"$SUPABASE_URL"'+
'DATABASE_URL=%s
'"$DATABASE_URL"'+
'VITE_SUPABASE_ANON_KEY=%s
'"$ANON_KEY"'+
'SUPABASE_SERVICE_ROLE_KEY=%s
'"$SERVICE_ROLE_KEY"'

exit 0
