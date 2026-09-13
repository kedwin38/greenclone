import { NextRequest, NextResponse } from "next/server";
import { runSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

// One-time (idempotent) database seeding for Cloudflare, where the Node
// startup script cannot run. Call once after migrations:
//
//   curl -X POST https://<your-app>/api/setup -H "Authorization: Bearer $SETUP_TOKEN"
//
// Guarded by SETUP_TOKEN (set with `wrangler secret put SETUP_TOKEN`). Safe to
// call again — it only creates what is missing.
export async function POST(req: NextRequest) {
  const secret = process.env.SETUP_TOKEN;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "SETUP_TOKEN not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("token");
  if (token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const log = await runSeed();
    return NextResponse.json({ ok: true, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
