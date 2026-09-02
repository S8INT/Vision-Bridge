# VisionBridge — Base44 Dev Environment

## Architecture

pnpm monorepo with three artifacts and shared libraries:

- **`artifacts/visionbridge`** — Expo SDK 54 / React Native app (the user-facing app). Runs as a **web** app via `react-native-web` on port 3000.
- **`artifacts/api-server`** — Express 5 API server with JWT auth, clinical routes, imaging, WebRTC signaling. Runs on port 8080 (exposed on host port 8000).
- **`artifacts/mockup-sandbox`** — Vite component preview tool (not used in the main app flow).
- **`lib/db`** — Drizzle ORM + PostgreSQL schema. Migrations via `drizzle-kit push`.
- **`lib/api-client-react`** — Generated API client (used by the Expo app).
- **`lib/api-zod`** — Zod schemas for API validation.

## Running the app

```sh
docker compose -f docker-compose.base44.yml up -d
```

Services (in startup order):
1. `postgres` — PostgreSQL 16 database
2. `setup` — one-shot: installs all pnpm workspace dependencies
3. `db-migrate` — one-shot: runs `drizzle-kit push` to create tables
4. `api` — builds the API server with esbuild and runs it on port 8080
5. `web` — starts the Expo web dev server on port 3000

The preview shows the Expo web app at port 3000. The API is at host port 8000.

## Key details

- **pnpm 9** is required (lockfile version 9.0). Installed via `npm install -g pnpm@9` in each container.
- **Node 22** base image. The project targets Node 24 on Replit but works with 22.
- The API server's `dev` script does `build && start` (no watch mode). To pick up API changes, restart the `api` service.
- The Expo web dev server has live reload. File watching uses polling (`CHOKIDAR_USEPOLLING=true`) for bind-mount compatibility.
- `EXPO_PUBLIC_API_URL` is set to `https://8000-${BASE44_PUBLIC_HOST_SUFFIX}` so the web app can reach the API from the browser.
- CORS is enabled with default options (`Access-Control-Allow-Origin: *`). Auth uses Bearer JWT tokens, not cookies.
- No external secrets are needed. `JWT_SECRET` uses the project's default dev value. MinIO is optional — the API falls back to in-memory storage.

## First-run experience

On first launch, the database is empty. The app shows a **setup screen** where you create the first admin account. After that, you can log in and explore. Clinical demo data (patients, screenings, consultations, doctors, campaigns) is seeded automatically by the API server on startup (idempotent — only seeds if no data exists).

## Demo accounts (MOCK MODE only — when DB is unavailable)

When the database is not configured, the API falls back to MOCK MODE and seeds these accounts in memory:
- `admin@visionbridge.ug` / `Admin1234!` — Admin
- `dr.okello@visionbridge.ug` / `Doctor1234!` — Doctor
- `sarah.nakato@visionbridge.ug` / `Tech1234!` — Technician
- `chw.mbarara@visionbridge.ug` / `CHW1234!` — CHW
- `viewer@visionbridge.ug` / `Viewer1234!` — Viewer

In DB-backed mode (our Docker setup), you create accounts via the setup/signup screens.
