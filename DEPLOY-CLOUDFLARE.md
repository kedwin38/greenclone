# Deploying Green Color Networks to Cloudflare

This app runs on Cloudflare Workers via the [OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare),
with **D1** (SQLite) as the database and **R2** for product images.

> The old `Dockerfile` and `scripts/start.mjs` (Railway/Docker path) still work
> for a container host, but are not used on Cloudflare — Workers has no
> persistent filesystem or long-running process.

## Prerequisites

```bash
npm install
npx wrangler login
```

## 1. Create the D1 database and R2 bucket

```bash
npx wrangler d1 create greenclone-db
npx wrangler r2 bucket create greenclone-uploads
```

Copy the `database_id` printed by the first command into **`wrangler.jsonc`**
(replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

## 2. Apply the database schema (migrations)

The D1 schema lives in `migrations/` (plain SQL, applied by Wrangler).

```bash
# Local dev database (Miniflare):
npm run cf:migrate:local

# Remote (production) database:
npm run cf:migrate
```

## 3. Set secrets

Non-secret values live under `vars` in `wrangler.jsonc` (edit `APP_URL` to your
real URL). Secrets are set with Wrangler and never committed:

```bash
npx wrangler secret put SESSION_SECRET   # 32+ random chars (signs cookies + encrypts settings)
npx wrangler secret put ADMIN_PASSWORD   # first admin password
npx wrangler secret put SETUP_TOKEN      # random token, used once to seed the DB
npx wrangler secret put CRON_SECRET      # random token, for scheduled backups
```

## 4. Deploy

```bash
npm run deploy
```

(`npm run preview` runs the exact Workers build locally first, if you want to
smoke-test.)

## 5. Seed the database (once)

The Node bootstrap script can't run on Workers, so seeding is a one-time
protected HTTP call (idempotent — safe to repeat):

```bash
curl -X POST https://<your-app-url>/api/setup \
  -H "Authorization: Bearer $SETUP_TOKEN"
```

This creates the admin account, default categories and sample products.
Then log in at `/admin/login` and change the admin password.

## Scheduled off-site backups (optional)

The in-process backup timer is disabled on Cloudflare. Instead, add a
[Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
that calls `/api/cron/backup` with the `CRON_SECRET`. The endpoint runs a
backup only when the configured interval is due (`?force=1` to force one).
Configure the target S3-compatible bucket under **Admin → Settings → Backup**
(R2 works — it is S3-compatible). Backups are a JSON export of all tables;
R2-stored images are not included (back the R2 bucket up separately if needed).

## What changed from the container version

| Area | Before (Docker/Railway) | After (Cloudflare) |
|------|-------------------------|--------------------|
| Database | Local SQLite file on a volume | D1 via Prisma driver adapter |
| Prisma engine | Native binary | D1 driver adapter (`@prisma/adapter-d1`) |
| Migrations | `prisma migrate deploy` at boot | `wrangler d1 migrations apply` (`migrations/`) |
| Seeding | `scripts/bootstrap.mjs` at boot | `POST /api/setup` (once) |
| Product images | Bytes stored in DB | R2 bucket (`UPLOADS` binding) |
| Settings encryption | `node:crypto` scrypt + AES-GCM | WebCrypto PBKDF2 + AES-GCM |
| Backups | `VACUUM INTO` file → S3 | JSON export → S3/R2 |
| Scheduled backup | `setInterval` in the server process | Cron Trigger → `/api/cron/backup` |
