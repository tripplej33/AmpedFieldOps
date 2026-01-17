# Project Memory Log

## 2026-01-17

### Session: Initialize Self-Documenting Files
- User request: Initialize self-documenting files and create a branch from current pulled commit.
- Actions completed: Created `memory.md`, `mistakes_to_not_repeat.md`, `Internal_System_Documentation.md`, `prompt_for_more_context.md`; created branch `docs/self-documenting-state` from commit `fdd8c458d589ca6563fc6bfa631745f703c4959b`; committed and pushed.
- Context: Repo freshly cloned at detached HEAD and installed via `install.sh`; containers healthy.

### Session: Database Rework Planning
- User request: Plan complete rework to replace Postgres/Adminer with local Supabase Docker stack; start fresh (no data migration).
- Actions completed: Created comprehensive `Database_Rework.plan.md` covering:
  - Current architecture baseline (pg Pool, custom JWT auth, 20+ route files using raw SQL)
  - Target Supabase stack (Kong, GoTrue, PostgREST, Realtime, Storage, Studio)
  - Code changes required: Backend (replace `pg` with Supabase client in ~20 files), Frontend (add Supabase JS client for auth), Storage (migrate uploads to Supabase Storage)
  - 6-phase migration strategy (setup, schema, backend refactor, frontend refactor, Docker compose, testing)
  - Risks, rollback plan, success metrics
- Next steps: User approval, then begin Phase 1 (install Supabase CLI, test local stack).
