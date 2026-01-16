# Mistakes & Issues to Not Repeat

## Documentation
- Keep this file updated when encountering bugs or logic errors
- Reference this before suggesting architectural changes

## Known Issues
- Missing imports causing build failures:
	- `encrypt` not imported in `backend/src/routes/settings.ts`
	- `log` not imported in `backend/src/routes/troubleshooter.ts`
	- Incorrect `log.warn()` usage with three arguments in `backend/src/routes/xero.ts` (should pass meta as second arg)

## Preventative Practices
- When introducing shared utilities (encryption, logger), add imports in all touched files and run `tsc` locally.
- Follow function signatures strictly; wrap error details inside `meta` for `log.warn()` and use `log.error()` when passing an error object.

---
