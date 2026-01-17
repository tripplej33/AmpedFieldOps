# Mistakes & Issues to Not Repeat

## Documentation
- Keep this file updated when encountering bugs or logic errors.
- Reference this before suggesting architectural changes.

## Known Issues
- Supabase CLI `db push` error: "Cannot find project ref" when not linked.
  - Fix: Use `supabase link` to a remote project, or apply SQL locally via `psql` in the `supabase_db_*` container.
- PostgREST auth testing confusion (401 vs 403):
  - 401 Unauthorized indicates missing/invalid JWT or wrong header usage.
  - 403 Forbidden indicates RLS policy denied for the role/claims of the provided JWT.
  - Use the correct token: ANON JWT for public reads, user JWT for authenticated reads, and perform privileged server-side operations via Supabase server client (SERVICE_ROLE_KEY) instead of direct REST calls.
- Legacy DB/Adminer left running can cause confusion.
  - Fix: Stop/remove `ampedfieldops-db` and `ampedfieldops-db-ui` when migrating to Supabase.

## Preventative Practices
- Do not commit secrets or private keys (`.env`, `ssl/`).
- Prefer Docker network service names over `localhost` for inter-container calls.
- Rebuild frontend when changing `VITE_*` env vars; they’re baked at build time.
- Test RLS policies with the appropriate JWTs and role claims; document expected access for anon vs authenticated users.
