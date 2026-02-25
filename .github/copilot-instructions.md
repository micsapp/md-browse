# Copilot Instructions — MD Browse

## Architecture

MD Browse is a markdown document browsing platform with three independent components:

- **Backend** (`backend/`) — Express.js REST API (single-file `server.js`). All data is stored as JSON files in `backend/data/` (users, metadata, versions, folders, audit logs). No database. Routes are versioned under `/api/v1/*`. Auth uses JWT with Bearer tokens; agent tokens use `X-Agent-Token` header with scoped permissions.
- **Frontend** (`frontend/`) — Nuxt 3 (Vue 3) SPA with PWA support. Uses Nuxt composables (`composables/`) for shared logic (`useApi`, `useAuth`, `useTheme`). Global auth middleware in `middleware/auth.global.js`. Styles use CSS custom properties for dark/light theming (defined in `app.vue`).
- **TUI** (`tui/`) — Python terminal UI built with Textual. Connects to the same backend API via `tui/api.py`. Run with `python -m tui`.

In production, Nginx serves the frontend static build and proxies `/api` to the backend (port 3001). Config is in `nginx/md-browse.conf`.

## Build & Run Commands

### Backend
```bash
cd backend && npm install && npm run dev    # dev with nodemon
cd backend && npm start                      # production
```

### Frontend
```bash
cd frontend && npm install && npm run dev    # dev server (port 3000)
cd frontend && npm run build                 # production build
cd frontend && npm run generate              # static site generation
```

### TUI
```bash
pip install -r tui/requirements.txt
python -m tui                                # or: MD_BROWSE_URL=http://host:3001 python -m tui
```

### Deployment
```bash
./deploy.sh deploy                           # full deploy (install, build, PM2, nginx)
./deploy.sh --hostname docs.example.com deploy
./deploy.sh status | logs | restart | stop
```

## Key Conventions

- **API error envelope**: All errors use `{ error: { code, message, hint?, request_id } }`. Use `apiError()` and `sendError()` helpers in server.js.
- **Audit logging**: Every mutating endpoint must call `appendAuditLog()` with actor type (`user` or `agent`), action, and resource info.
- **Frontend API calls**: Always go through the `useApi()` composable — never call `$fetch` directly for API routes.
- **Auth state**: `useAuth()` uses module-level shared refs (not Pinia). Token, username, and role are persisted in localStorage.
- **Environment variables**: Backend reads `PORT`, `JWT_SECRET`. Frontend reads `NUXT_PUBLIC_API_BASE` (defaults to `/api` in production, set to `http://localhost:3001/api` for local dev).
- **Share system**: Documents can be shared via token-based URLs (`/share/:token`), optionally protected with an access code. Share data stored in `backend/data/shares.json`.
- **Batch operations**: Backend supports `POST /api/v1/documents/batch/{delete,move,download}` for multi-document operations. Batch download returns a zip archive.
- **TUI login persistence**: Both `tui_simple.sh` and the Python TUI save session credentials to `~/.md-browse/` and restore them on next launch.
- **No test suite or linter is configured** — there are no test files, test scripts, or lint configs in this repo.
