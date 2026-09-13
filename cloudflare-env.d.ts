// Typed bindings available via getCloudflareContext().env — kept in sync with
// wrangler.jsonc.
//
// Types are imported (not brought in via a global /// reference) so that the
// Cloudflare Workers global typings do NOT override the DOM lib in client
// components (e.g. redefining Response.json() to return `unknown`).
import type { D1Database, R2Bucket, Fetcher } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    // Bindings
    DB: D1Database;
    UPLOADS: R2Bucket;
    ASSETS: Fetcher;

    // Vars (wrangler.jsonc)
    APP_URL: string;
    MPESA_SIMULATE: string;
    ADMIN_NAME: string;
    ADMIN_PHONE: string;

    // Secrets (wrangler secret put …)
    SESSION_SECRET: string;
    ADMIN_PASSWORD: string;
    CRON_SECRET: string;
    SETUP_TOKEN: string;
  }
}

export {};
