# PACE. API — MySQL + TypeORM edition

NestJS 12 + MySQL 8.4 + **TypeORM**. This project is based on your uploaded NestJS starter. **No Prisma runtime, schema, or code generation is used.** The accompanying Next.js frontend communicates with the same `/api` endpoints as the previous PACE MVP.

## Prerequisites

Node.js 22+, npm, Docker Desktop (or an existing MySQL 8.x instance). Backend: **http://localhost:4000/api**. Frontend: **http://localhost:3000**.

## First-time setup

```bash
cd m-backend
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
```

Set `DATABASE_URL`, `PACE_ADMIN_EMAIL`, `PACE_ADMIN_PASSWORD` (12+ characters), and `PACE_SESSION_SECRET` (32+ characters). You can generate the secret with `openssl rand -hex 32`. Docker MySQL also requires `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` in `.env`. The `DATABASE_URL` credentials must match the Docker configuration. When using an existing local MySQL server, create an empty `pace` schema with `utf8mb4_unicode_ci` collation and point `DATABASE_URL` at it.

```bash
npm install
docker compose up -d      # Skip if using your existing MySQL server
npm run db:migrate       # TypeORM migration, only on a fresh PACE database
npm run db:seed          # Initial personal account, exercises, templates, 3 runs, marathon goal
npm run start:dev
```

**No `prisma generate` command is needed.** `db:migrate` runs the TypeORM `MigrationInterface` in `src/db/migrations/20261028000000-InitialSchema.ts`. `db:seed` runs `scripts/seed.ts` with TypeORM. The migrations are explicit, and `synchronize: false` is set to protect existing data.

## Existing database warning

If you **already applied the previous Prisma-based MySQL migration**, the tables already exist and the initial TypeORM migration cannot simply run again. **Back up your existing data before converting**. The new entities intentionally retain the same table and field names. Baseline the TypeORM migration against the existing schema, or start with a new empty PACE database and seed it. Do not delete an existing data directory just to switch ORMs. Never run `synchronize: true` as a workaround.

## Project structure

- `src/db/entities.ts`: TypeORM entities, enums, indexes, relationships and cascades.
- `src/db/data-source.ts`: MySQL DataSource, used by Nest and by the migration/seed scripts.
- `src/db/migrations/20261028000000-InitialSchema.ts`: initial schema migration.
- `scripts/migrate.ts`, `scripts/revert.ts`, `scripts/seed.ts`: database commands.
- `src/auth`: session cookie authentication with scrypt password hashes.
- `src/training`: plans, exercises, templates, gym sets, runs; transactions for completed activities.
- `src/habits`, `src/goals`, `src/analytics`, `src/sharing`: same API response contracts as the Prisma edition.

## API endpoints

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Dashboard | `GET /api/dashboard` |
| Calendar | `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| Plans | `GET/POST /api/plans`, `PATCH/DELETE /api/plans/:id`, `POST /api/plans/:id/complete` |
| Exercises/templates | `GET/POST /api/exercises`, `GET/POST /api/templates`, `DELETE /api/templates/:id` |
| Activity | `GET/POST /api/activities`, `PATCH/DELETE /api/activities/:id` |
| Habits | `GET /api/habits`, `POST /api/habits/:kind`, `POST /api/habits/:kind/checkins` |
| Analytics | `GET /api/statistics`, `GET /api/contributions?year=YYYY` |
| Goals | `GET/POST /api/goals`, `PATCH/DELETE /api/goals/:id` |
| Sharing | `GET/POST /api/shares`, `PATCH/DELETE /api/shares/:id`, `GET /api/public/:token` |

Private endpoints require the signed HTTP-only session cookie. Public links are read-only, limited to opted-in fields, hashed in storage, and revocable. For more than one backend instance, replace the in-memory login/public rate limiting with a shared store.

## Data rules

- `PlannedWorkout` and `Activity` are separate to calculate genuine consistency.
- Run logs require distance in meters and duration in seconds.
- Gym sets store weights using MySQL `DECIMAL(8,2)`; monetary estimates use MySQL `DECIMAL`.
- Date-only values stay as `YYYY-MM-DD` local strings (configured timezone defaults to `Africa/Casablanca`).
- Recovery days require explicit check-ins: unreported days never count as a success.
- 5K/10K PRs require precisely recorded matching distances, not guessed splits.

## Validation

```bash
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run lint
```

The e2e suite requires a running MySQL server, applied migration, seeded account, and environment settings. This export has been syntax-checked but not fully built or integration-tested here because npm registry access and a MySQL server were unavailable in the generation environment.
