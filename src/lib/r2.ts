import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

// Access to the R2 bucket binding (`UPLOADS`) declared in wrangler.jsonc.
// Product images are stored here, not in the database — Workers has no
// persistent filesystem and D1 rows are capped at ~1 MB.
export function bucket(): R2Bucket {
  const { env } = getCloudflareContext();
  return env.UPLOADS;
}
