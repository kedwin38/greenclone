import { env } from "./env";

// AES-256-GCM encryption for secrets stored in the database (Daraja keys etc).
//
// Implemented with the WebCrypto API (crypto.subtle) so it runs on the
// Cloudflare Workers runtime, where node:crypto's scryptSync is unavailable.
// The key is derived from SESSION_SECRET via PBKDF2-SHA256 — rotating
// SESSION_SECRET re-keys secrets (existing rows then fail to decrypt and fall
// back to defaults, which is the intended behaviour for a rotated secret).

const enc = new TextEncoder();
const dec = new TextDecoder();
const KDF_SALT = enc.encode("gcn-settings-salt-v1");
const PBKDF2_ITERATIONS = 100_000;

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(env.sessionSecret),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: KDF_SALT, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
  }
  return keyPromise;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export async function encrypt(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      enc.encode(plain) as BufferSource
    )
  );
  // WebCrypto AES-GCM appends the auth tag to the ciphertext; store as one blob.
  return `v2:${toHex(iv)}:${toHex(ct)}`;
}

export async function decrypt(payload: string): Promise<string> {
  try {
    const [v, ivHex, ctHex] = payload.split(":");
    if (v !== "v2") return ""; // unknown/legacy format — treat as absent
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(ivHex) as BufferSource },
      key,
      fromHex(ctHex) as BufferSource
    );
    return dec.decode(plain);
  } catch {
    return "";
  }
}
