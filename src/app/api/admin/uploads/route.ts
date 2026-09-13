import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { bucket } from "@/lib/r2";
import { ok, fail, assertCsrf } from "@/lib/api";
import { apiUser } from "@/lib/session";
import { audit } from "@/lib/audit";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_IMAGES = 120; // total stored image budget

// Magic-byte sniffing — trust content, not extensions.
function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const user = await apiUser();
  if (!user || (user.role !== "STAFF" && user.role !== "ADMIN")) {
    return fail("Staff access required.", 403);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Invalid upload.", 400);
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail("No file provided.", 422);
  if (files.length > 6) return fail("Upload up to 6 images at a time.", 422);

  const count = await db.imageAsset.count();
  if (count + files.length > MAX_IMAGES) {
    return fail("Image storage is full. Remove old product images first.", 507);
  }

  const ids: number[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return fail(`"${file.name}" is larger than 4 MB. Compress it and try again.`, 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectMime(bytes);
    if (!mime) {
      return fail(
        `"${file.name}" is not a supported image (JPEG, PNG or WebP only).`,
        415
      );
    }
    const key = `img/${nanoid()}.${EXT[mime]}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: mime } });
    const image = await db.imageAsset.create({
      data: { mime, size: bytes.byteLength, key },
    });
    ids.push(image.id);
  }

  await audit({ id: user.id, name: user.name }, "image.upload", "image", ids.join(","));
  return ok({ ids });
}
