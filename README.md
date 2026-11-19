# Pulse Circle

Pulse Circle is a humanitarian web application that connects elderly people
living alone with trusted neighbors and family members through daily
check-ins and real-time communication.

## Architecture

```
pulse_circle/
├─ server/                     # Backend (Express, TypeScript, Prisma, PostgreSQL)
│  ├─ prisma/
│  │  ├─ schema.prisma         # Data model
│  │  └─ seed.ts               # Optional development seed (fictional data only)
│  ├─ src/
│  │  ├─ config/               # Environment validation
│  │  ├─ middleware/           # Error handling, 404
│  │  ├─ routes/               # API routes (health implemented)
│  │  ├─ app.ts                # Express application
│  │  └─ server.ts             # HTTP server entry with graceful shutdown
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ .env.example
│  └─ .gitignore
├─ src/                        # Frontend (React, TypeScript, Vite, Tailwind CSS v4)
├─ public/
├─ index.html
├─ package.json
└─ README.md
```

- **Frontend**: React 19, TypeScript, Vite, React Router, Tailwind CSS v4,
  Lucide icons. Runs independently of the backend.
- **Backend**: Node.js, Express, TypeScript, PostgreSQL, Prisma ORM. Lives in
  `server/` with its own `package.json`; keep it independently runnable.
- **Database design**: `server/prisma/schema.prisma` — Users, Circles,
  CircleMembers, CheckInSchedules, CheckIns, Escalations, EscalationEvents,
  Notifications. History is preserved: users/circles cannot be deleted while
  dependent check-in or escalation records exist (`onDelete: Restrict`).

## Frontend setup

```bash
# Install dependencies
npm install

# Start the Vite development server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview the production build
npm run preview

# Lint
npm run lint
```

### Frontend environment variables

Vite proxies `/api` requests to the local Express backend (default `http://localhost:4000`) during development, so no frontend environment variable is required locally.

If the backend runs on a different host or port, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`. Frontend environment variables are embedded in the browser bundle — never store backend secrets, database credentials, or JWT secrets in them.

For production, the preferred arrangement is same-origin serving or a reverse proxy so the frontend and API share an origin (which keeps cookies and CSRF working). Cross-site frontend/backend deployments require additional cookie (`SameSite=None; Secure`) and CSRF configuration.

## Backend setup

```bash
cd server

# Install backend dependencies
npm install

# Copy the example environment file
cp .env.example .env
# Edit .env with your PostgreSQL connection string and CORS origin.

# Generate the Prisma client
npm run prisma:generate

# Validate the schema (offline, no database required)
npm run prisma:validate

# Type-check the backend
npm run build

# Lint
npm run lint

# Start the API server (http://localhost:4000)
npm start

# Watch during development
npm run dev
```

### Required environment variables (`server/.env`)

| Variable | Example | Notes |
|---|---|---|
| `PORT` | `4000` | HTTP port for the API |
| `NODE_ENV` | `development` | `development` or `production` |
| `DATABASE_URL` | `postgresql://pulse_circle:pulse_circle@localhost:5432/pulse_circle?schema=public` | PostgreSQL connection string (required at startup) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s) |

Never commit `.env`. `.env.example` is tracked; `.env` is ignored by Git.

## PostgreSQL setup

The backend requires a PostgreSQL database. Example setup:

```sql
-- Connect as a superuser, then:
CREATE DATABASE pulse_circle;
CREATE USER pulse_circle WITH PASSWORD 'pulse_circle';
GRANT ALL PRIVILEGES ON DATABASE pulse_circle TO pulse_circle;
```

Then point `DATABASE_URL` at that database and run the initial migration:

```bash
cd server
npx prisma migrate dev --name init
```

`prisma migrate dev` both creates the migration and applies it. If PostgreSQL
is not available yet, the repository is structurally ready: `prisma validate`
and the TypeScript build pass offline; only `prisma migrate`, `prisma generate`
(downloads the query engine), and database-dependent endpoints need a live
PostgreSQL instance.

Do not invent real database credentials; use placeholder values in
`.env.example` only.

## Prisma commands

```bash
cd server

npx prisma validate        # offline schema validation
npx prisma generate        # generates @prisma/client (needs network for the query engine)
npx prisma migrate dev     # create + apply a migration (needs PostgreSQL)
npx prisma migrate deploy  # apply pending migrations (production)
npx prisma studio          # visual database browser (development)
npm run prisma:seed        # optional fictional demo data (Lakshmi, Ravi, Meena, Priya)
```

The seed script uses clearly fictional email addresses under
`example.invalid` and leaves `passwordHash` null — authentication is not
implemented in this phase.

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service health: `{ "status": "ok", "service": "pulse-circle-api" }` |
| GET | `/api/health/db` | Database connectivity: `{ "status": "connected" }` or `503 { "status": "unavailable", ... }` |

Example:

```bash
curl http://localhost:4000/api/health
# { "status": "ok", "service": "pulse-circle-api" }

curl http://localhost:4000/api/health/db
# { "status": "connected" }
```

Route modules ready for future implementation: authentication, users,
circles, check-ins, escalations, notifications (`server/src/routes/`).

## Development commands

Frontend (project root):
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

Backend (`server/`):
- `npm run dev` — tsx watch server
- `npm run build` — TypeScript compile
- `npm start` — run compiled server from `dist/`
- `npm run lint` — ESLint
- `npm run prisma:validate` — validate Prisma schema

## Preservation notes

Phase 3 frontend code (`src/pages`, `src/components`, `src/routes`) is
untouched by this phase. The frontend keeps using local mock data and does
not call the backend yet. No backend authentication, Nexconn SDK
integration, or automated escalation scheduler is implemented in this phase.
