import { db } from "./db";
import { encrypt, decrypt } from "./crypto";

// ─── Typed settings groups ───────────────────────────────────────────────────

export type BusinessSettings = {
  name: string;
  legalName: string;
  tagline: string;
  description: string;
  phone: string;
  whatsapp: string; // full number e.g. 2547XXXXXXXX
  email: string;
  location: string;
  tillNumber: string;
  openHours: string;
  announcement: string; // optional top-bar announcement
};

export type MpesaSettings = {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  // Business Shortcode: the Store/HO number used at Daraja Go Live. Used for
  // BusinessShortCode and the STK password (Shortcode+Passkey+Timestamp) in
  // every transaction type — including Buy Goods, where it is NOT the same
  // as the till number (see tillNumber below).
  shortcode: string;
  transactionType: "CustomerBuyGoodsOnline" | "CustomerPayBillOnline";
  // Buy Goods (Till) only: the actual till number, sent as PartyB. Per
  // Safaricom's own Daraja docs, Buy Goods STK Push requires BusinessShortCode
  // (the Store/HO number above) and PartyB (this till number) to be two
  // different values — sending the till number for both is the single most
  // common cause of Daraja error 2002 ("Agent number and Store number do not
  // match"). Ignored for Paybill, where BusinessShortCode and PartyB match.
  tillNumber: string;
  callbackBaseUrl: string; // empty = auto-detect from request
};

export type SeoSettings = {
  siteTitle: string;
  siteDescription: string;
  keywords: string;
};

export type BackupSettings = {
  enabled: boolean;
  // S3-compatible object storage — works with AWS S3, Cloudflare R2,
  // Backblaze B2, DigitalOcean Spaces, MinIO, etc. Leave endpoint empty
  // for real AWS S3; set it for any other provider.
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  intervalHours: number; // 0 = manual backups only, no schedule
  retentionCount: number; // 0 = keep every backup forever
  lastRunAt: string; // ISO timestamp, "" = never run
  lastRunOk: boolean;
  lastRunMessage: string;
};

export type AllSettings = {
  business: BusinessSettings;
  mpesa: MpesaSettings;
  seo: SeoSettings;
  backup: BackupSettings;
};

// ─── Defaults (editable in Admin → Settings) ─────────────────────────────────

export const DEFAULT_SETTINGS: AllSettings = {
  business: {
    name: "Green Color Networks",
    legalName: "Green Color Networks",
    tagline: "Your trusted Safaricom products partner",
    description:
      "Green Color Networks is a trusted reseller of genuine Safaricom products — data bundles, airtime, minutes, SMS and the latest phones — serving customers across Kenya with fast, secure M-Pesa payments.",
    phone: "254700000000",
    whatsapp: "254700000000",
    email: "support@greencolornetworks.co.ke",
    location: "Nairobi, Kenya",
    tillNumber: "000000",
    openHours: "Mon – Sat, 8:00 AM – 7:00 PM",
    announcement: "",
  },
  mpesa: {
    environment: "sandbox",
    // Daraja public sandbox test app credentials (safe defaults to start with)
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    shortcode: "174379",
    transactionType: "CustomerBuyGoodsOnline",
    tillNumber: "",
    callbackBaseUrl: "",
  },
  seo: {
    siteTitle: "Green Color Networks — Data Bundles, Airtime, Minutes & Phones",
    siteDescription:
      "Buy Safaricom data bundles, airtime, minutes and the latest phones at great prices. Pay securely with M-Pesa and get instant top-ups. Green Color Networks — trusted in Kenya.",
    keywords:
      "Safaricom bundles, data bundles Kenya, cheap airtime, buy phones Kenya, M-Pesa shopping, Green Color Networks",
  },
  backup: {
    enabled: false,
    endpoint: "",
    region: "",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    prefix: "gcn-backups",
    intervalHours: 24,
    retentionCount: 14,
    lastRunAt: "",
    lastRunOk: false,
    lastRunMessage: "",
  },
};

// Fields masked when displayed back in the admin UI (write-only inputs).
export const SENSITIVE_FIELDS: Record<keyof AllSettings, string[]> = {
  business: [],
  mpesa: ["consumerSecret", "passkey"],
  seo: [],
  backup: ["secretAccessKey"],
};

// ─── Access helpers ──────────────────────────────────────────────────────────

export async function getSettingGroup<K extends keyof AllSettings>(
  group: K
): Promise<AllSettings[K]> {
  const row = await db.setting.findUnique({ where: { key: group } });
  const defaults = DEFAULT_SETTINGS[group];
  if (!row) return { ...defaults };
  try {
    const plain = await decrypt(row.value);
    if (!plain) return { ...defaults };
    const parsed = JSON.parse(plain) as Partial<AllSettings[K]>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export async function getAllSettings(): Promise<AllSettings> {
  const [business, mpesa, seo, backup] = await Promise.all([
    getSettingGroup("business"),
    getSettingGroup("mpesa"),
    getSettingGroup("seo"),
    getSettingGroup("backup"),
  ]);
  return { business, mpesa, seo, backup };
}

export async function saveSettingGroup<K extends keyof AllSettings>(
  group: K,
  patch: Partial<AllSettings[K]>
): Promise<AllSettings[K]> {
  const current = await getSettingGroup(group);
  const next = { ...current, ...patch };
  const value = await encrypt(JSON.stringify(next));
  await db.setting.upsert({
    where: { key: group },
    update: { value },
    create: { key: group, value },
  });
  return next;
}

// Mask a secret for display: show only the last 4 characters.
export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "•".repeat(Math.min(20, value.length - 4)) + value.slice(-4);
}
