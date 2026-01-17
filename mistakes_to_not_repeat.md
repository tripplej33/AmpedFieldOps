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
- **Frontend in Docker cannot access `localhost:54321` - Supabase runs on host**: Use `host.docker.internal:54321` in docker-compose.yml environment variables AND add `extra_hosts` mapping for proper host access from containers.
- **Supabase env vars must be set for both frontend and backend**: Frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, backend needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Missing these causes "supabaseKey is required" errors.
- **Mixed Content Errors (HTTPS page loading HTTP resources)**: When deploying to HTTPS domains, `VITE_API_URL` must NOT use `http://backend:3001` or any absolute HTTP URL. Use relative path `/api` instead, since Nginx proxies `/api/*` to the backend service. Browser cannot access Docker network hostnames and blocks mixed HTTP/HTTPS content.