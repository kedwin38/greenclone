import { NextRequest, NextResponse } from "next/server";
import { getSettingGroup } from "@/lib/settings";
import { isBackupDue, runBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

// Scheduled-backup endpoint for serverless hosts (Cloudflare Workers) where an
// in-process timer cannot run. Point a Cloudflare Cron Trigger (or any external
// scheduler) at this route with the shared secret:
//
//   Authorization: Bearer $CRON_SECRET
//
// Runs a backup only when the configured interval says one is due, unless
// ?force=1 is passed. Returns 401 unless the secret matches.
async function handle(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("token");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  const cfg = await getSettingGroup("backup");
  if (!force && !isBackupDue(cfg)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "not due" });
  }

  try {
    const { key, size } = await runBackup();
    return NextResponse.json({ ok: true, key, size });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
