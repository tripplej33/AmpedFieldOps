# AmpedFieldOps - System Architecture & Documentation

## Project Overview
AmpedFieldOps is a service management platform (React/Vite frontend, Node/Express backend, PostgreSQL).

## Architecture Summary
- Frontend: React 18 + Vite, served by nginx.
- Backend: Node.js + Express, connects to PostgreSQL.
- OCR: Python Flask service for document processing.
- Deployment: Docker Compose orchestrates frontend, backend, DB, Redis, OCR.

## API Routes (Backend)
- Core endpoints under `/api` for projects, clients, timesheets, Xero integration, and auth middleware.

## Database
- PostgreSQL with tables for users, projects, clients, timesheets, permissions.

## Environments
- `.env` for runtime configuration.

## Notes
This document will evolve with routes, models, and configuration details as changes are introduced.
