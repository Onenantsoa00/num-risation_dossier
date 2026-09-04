# Run Doc — Numerisation Dossiers

## How to reproduce uncommitted artifacts

1. Copy `.env` from main checkout if missing:
   ```bash
   cp /media/aluka/Prop_privé/trav_dev/numerisation_dossier/backend/.env backend/.env
   ```

2. Install dependencies (if node_modules missing):
   ```bash
   cd backend && npm install
   cd frontend && npm install
   ```

## How to run the server

**Backend** (port 3000):
```bash
cd backend
PORT=3000 node src/index.js
```
Note: The system environment has `PORT=0` which overrides the .env file. Always pass `PORT=3000` explicitly.

**Frontend** (port 9000):
```bash
cd frontend
npx quasar dev
```

**To run detached (Linux):**
```bash
cd backend && PORT=3000 setsid node src/index.js > /path/to/preview.log 2>&1 < /dev/null &
cd frontend && setsid npx quasar dev > /path/to/preview-frontend.log 2>&1 < /dev/null &
```

## Ports
- Backend API + WebSocket: 3000
- Frontend Dev Server: 9000
- Database: PostgreSQL on port 5432 (database: gestion_dossiers)
