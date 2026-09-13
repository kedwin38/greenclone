import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default OpenNext Cloudflare configuration. Incremental cache / tag cache /
// queue can be added here later (R2 or KV backed) if ISR is introduced; this
// app renders everything dynamically, so the defaults are sufficient.
export default defineCloudflareConfig();
