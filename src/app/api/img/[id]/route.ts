import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bucket } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (!Number.isInteger(imageId)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const image = await db.imageAsset.findUnique({ where: { id: imageId } });
  if (!image) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const object = await bucket().get(image.key);
  if (!object) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = new Uint8Array(await object.arrayBuffer());
  return new NextResponse(body, {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"img-${image.id}-${image.size}"`,
    },
  });
}
