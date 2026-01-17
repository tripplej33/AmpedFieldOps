# Mistakes & Issues to Not Repeat

## Documentation
- Keep this file updated when encountering bugs or logic errors.
- Reference this before suggesting architectural changes.

## Known Issues
- Pending: Populate as issues are discovered in this commit baseline.

## Preventative Practices
- Do not commit secrets or private keys (`.env`, `ssl/`).
- Prefer Docker network service names over `localhost` for inter-container calls.
- Rebuild frontend when changing `VITE_*` env vars; they’re baked at build time.
