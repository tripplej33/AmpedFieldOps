## 2026-01-16
- Do not use `command -v` on relative script paths; use `[ -x path ]` or invoke via `bash path`.
- Avoid complex `printf` concatenations for multi-line env output; emit with simple `echo key=value` lines.
- Ensure frontend uses `VITE_SUPABASE_URL`; include it when auto-populating `.env` alongside `SUPABASE_URL`.
- Network calls without timeouts can cause infinite UI spinners; add defensive `Promise.race` timeouts around boot-time checks like `getSetupStatus()`.
- **Docker Networking:** `host.docker.internal` does not work on Linux; use Docker network bridges or container names for inter-container communication.
- **Supabase Local Setup:** Backend must connect to `supabase_db_AmpedFieldOps:5432` (internal Docker network) NOT `localhost:54322`. The 54322 port is for host-to-container access only.
- **Hard-coded Database Hosts:** Never hardcode `postgres` as database hostname in entrypoint scripts; always parse from DATABASE_URL or use configurable env vars.
- **Required vs Optional Env Vars:** Backend env validation should treat SUPABASE_SERVICE_ROLE_KEY as optional for local dev (can use anon key for some operations) or auto-fetch from Supabase CLI during setup.
- **SSL Mode:** Supabase local PostgreSQL does not support SSL. Always add `?sslmode=disable` to DATABASE_URL for local development to avoid "server does not support SSL connections" errors.
# Mistakes & Issues to Not Repeat

## Documentation
- Keep this file updated when encountering bugs or logic errors
- Reference this before suggesting architectural changes

## Known Issues
- Missing imports causing build failures:
	- `encrypt` not imported in `backend/src/routes/settings.ts`
	- `log` not imported in `backend/src/routes/troubleshooter.ts`
	- Incorrect `log.warn()` usage with three arguments in `backend/src/routes/xero.ts` (should pass meta as second arg)

- Infinite loading risk when Supabase is unreachable:
	- `supabase.auth.getSession()` can hang; add a timeout/race to fail fast and render login.

## Preventative Practices
- When introducing shared utilities (encryption, logger), add imports in all touched files and run `tsc` locally.
- Follow function signatures strictly; wrap error details inside `meta` for `log.warn()` and use `log.error()` when passing an error object.
- For external auth/SDK calls, wrap in timeout guards and surface errors to logs to avoid blocking UX.
- **Empty Environment Variables:** Docker Compose reads `.env` file defaults. If a required variable like `SUPABASE_SERVICE_ROLE_KEY` is set but empty (e.g., `SUPABASE_SERVICE_ROLE_KEY=`), the container will read it as an empty string and cause runtime failures. Always verify critical env vars have actual values before starting containers.
- **Container Caching:** After updating `.env` files, use `docker compose up -d --force-recreate <service>` to ensure new environment variables are loaded. Simple restart may not pick up env changes due to container caching.
- **Production Supabase URLs:** For production deployments, `VITE_SUPABASE_URL` must be accessible from remote browsers. Localhost URLs (`127.0.0.1:54321`) only work when browser and server are on same machine. Use server IP (`http://192.168.1.124:54321`) for LAN access or Supabase Cloud for internet access.
- **Vite Environment Variables:** Vite bakes `VITE_*` env vars into the build at build time. Changing `.env` requires rebuilding the frontend container to take effect. Runtime changes won't work for client-side code.
- **Installer Production Mode:** When creating "just works" installers for production, always prompt for server IP/domain and automatically configure all relevant URLs (`VITE_API_URL`, `VITE_SUPABASE_URL`, `FRONTEND_URL`). Don't assume localhost will work for remote access. **Detect HTTPS and guide toward Supabase Cloud or reverse proxy to avoid mixed content issues.**
- **HTTPS Mixed Content:** HTTPS pages cannot request HTTP endpoints - browsers block this for security. For HTTPS frontends, either:
  1. Use Supabase Cloud (HTTPS by default, no config)
  2. Use a reverse proxy (nginx/caddy) with SSL termination
  3. Keep frontend as HTTP (localhost or LAN only)
  This is a fundamental security model, not a bug. Plan for it in architecture.

---
