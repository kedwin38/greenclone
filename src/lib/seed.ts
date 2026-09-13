import bcrypt from "bcryptjs";
import { db } from "./db";

// First-boot seeding (admin account, default categories, sample products),
// callable from within a Worker request — the Node startup script
// (scripts/bootstrap.mjs) cannot run on Cloudflare. Idempotent: only creates
// what is missing, so it is safe to invoke more than once.

type SeedProduct = {
  name: string;
  price: number;
  compareAtPrice?: number;
  stock?: number;
  featured?: boolean;
  hotSale?: boolean;
  sortOrder: number;
  attrs?: Record<string, unknown>;
};

type SeedCategory = {
  name: string;
  slug: string;
  icon: string;
  description: string;
  requiresImage: boolean;
  tracksStock: boolean;
  instantTopup: boolean;
  requiresRouterNumber?: boolean;
  showOnHome?: boolean;
  sortOrder: number;
  fields: unknown[];
  products: SeedProduct[];
};

const CATEGORIES: SeedCategory[] = [
  {
    name: "Data Bundles",
    slug: "data-bundles",
    icon: "wifi",
    description: "Stay connected for less — instant top-up to any Safaricom line.",
    requiresImage: false,
    tracksStock: false,
    instantTopup: true,
    showOnHome: true,
    sortOrder: 1,
    fields: [
      { key: "size_gb", label: "Size", type: "number", unit: "GB", badge: true },
      { key: "validity", label: "Validity", type: "select", options: ["24 hours", "7 days", "30 days", "90 days"] },
    ],
    products: [
      { name: "1 GB Data Bundle", price: 55, sortOrder: 1, attrs: { size_gb: 1, validity: "24 hours" } },
      { name: "5 GB Data Bundle", price: 250, compareAtPrice: 300, sortOrder: 2, attrs: { size_gb: 5, validity: "7 days" } },
      { name: "10 GB Data Bundle", price: 450, compareAtPrice: 500, sortOrder: 3, attrs: { size_gb: 10, validity: "7 days" } },
      { name: "25 GB Data Bundle", price: 900, compareAtPrice: 1000, sortOrder: 4, attrs: { size_gb: 25, validity: "30 days" } },
      { name: "50 GB Data Bundle", price: 1700, sortOrder: 5, attrs: { size_gb: 50, validity: "30 days" } },
      { name: "Unlimited Weekly Data", price: 1000, sortOrder: 6, attrs: { size_gb: "Unlimited", validity: "7 days" } },
    ],
  },
  {
    name: "Airtime",
    slug: "airtime",
    icon: "zap",
    description: "Top up in a tap — for any Safaricom number.",
    requiresImage: false,
    tracksStock: false,
    instantTopup: true,
    showOnHome: true,
    sortOrder: 2,
    fields: [{ key: "amount", label: "Airtime value", type: "number", unit: "KSh", badge: true }],
    products: [
      { name: "KSh 50 Airtime", price: 48, sortOrder: 1, attrs: { amount: 50 } },
      { name: "KSh 100 Airtime", price: 97, sortOrder: 2, attrs: { amount: 100 } },
      { name: "KSh 200 Airtime", price: 196, sortOrder: 3, attrs: { amount: 200 } },
      { name: "KSh 500 Airtime", price: 492, compareAtPrice: 500, sortOrder: 4, attrs: { amount: 500 } },
      { name: "KSh 1000 Airtime", price: 985, compareAtPrice: 1000, sortOrder: 5, attrs: { amount: 1000 } },
    ],
  },
  {
    name: "Minutes & SMS",
    slug: "minutes-sms",
    icon: "phone",
    description: "Talk more, text more — bundles for callers.",
    requiresImage: false,
    tracksStock: false,
    instantTopup: true,
    showOnHome: true,
    sortOrder: 3,
    fields: [
      { key: "minutes", label: "Minutes", type: "number", unit: "min", badge: true },
      { key: "sms", label: "SMS", type: "number", unit: "SMS" },
      { key: "validity", label: "Validity", type: "select", options: ["24 hours", "7 days", "30 days"] },
    ],
    products: [
      { name: "20 Minutes Talk Bundle", price: 35, sortOrder: 1, attrs: { minutes: 20, validity: "24 hours" } },
      { name: "100 Minutes + 200 SMS", price: 100, sortOrder: 2, attrs: { minutes: 100, sms: 200, validity: "7 days" } },
      { name: "500 Minutes Talk Bundle", price: 300, sortOrder: 3, attrs: { minutes: 500, validity: "30 days" } },
    ],
  },
  {
    name: "Phones",
    slug: "phones",
    icon: "smartphone",
    description: "Genuine devices with warranty. Delivery or pickup.",
    requiresImage: true,
    tracksStock: true,
    instantTopup: false,
    sortOrder: 4,
    fields: [
      { key: "storage", label: "Storage", type: "select", options: ["32GB", "64GB", "128GB", "256GB", "512GB"], badge: true },
      { key: "ram", label: "RAM", type: "text", unit: "GB" },
      { key: "color", label: "Colour", type: "text" },
    ],
    products: [
      { name: "Sample Phone — replace with your stock (128GB)", price: 15999, stock: 5, featured: true, sortOrder: 1, attrs: { storage: "128GB", ram: "4", color: "Black" } },
      { name: "Sample Phone — replace with your stock (256GB)", price: 24999, stock: 3, featured: true, sortOrder: 2, attrs: { storage: "256GB", ram: "8", color: "Green" } },
    ],
  },
  {
    name: "Accessories",
    slug: "accessories",
    icon: "headphones",
    description: "Chargers, earphones, covers and more.",
    requiresImage: true,
    tracksStock: true,
    instantTopup: false,
    sortOrder: 5,
    fields: [{ key: "type", label: "Type", type: "text" }],
    products: [],
  },
];

const WIFI_CATEGORY: SeedCategory = {
  name: "WiFi Packages",
  slug: "wifi-packages",
  icon: "wifi",
  description: "5G router data packages — loaded directly onto your router.",
  requiresImage: false,
  tracksStock: false,
  instantTopup: false,
  requiresRouterNumber: true,
  sortOrder: 6,
  fields: [
    { key: "size_gb", label: "Size", type: "number", unit: "GB", badge: true },
    { key: "validity", label: "Validity", type: "select", options: ["7 days", "30 days"] },
  ],
  products: [
    { name: "20 GB Router Package", price: 1000, sortOrder: 1, attrs: { size_gb: 20, validity: "30 days" } },
    { name: "50 GB Router Package", price: 2000, sortOrder: 2, attrs: { size_gb: 50, validity: "30 days" } },
    { name: "Unlimited Router Package", price: 3500, sortOrder: 3, attrs: { size_gb: "Unlimited", validity: "30 days" } },
  ],
};

async function createCategoryWithProducts(cat: SeedCategory) {
  const { products, fields, ...rest } = cat;
  const created = await db.category.create({
    data: { ...rest, fields: JSON.stringify(fields) },
  });
  let i = 0;
  for (const p of products) {
    i += 1;
    await db.product.create({
      data: {
        categoryId: created.id,
        name: p.name,
        slug: `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${i}${created.id}`,
        price: p.price,
        compareAtPrice: p.compareAtPrice ?? null,
        attributes: JSON.stringify(p.attrs || {}),
        stock: cat.tracksStock ? (p.stock ?? 0) : null,
        featured: !!p.featured,
        hotSale: !!p.hotSale,
        sortOrder: p.sortOrder,
      },
    });
  }
}

export async function runSeed(): Promise<string[]> {
  const log: string[] = [];

  const existingAdmin = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    log.push(`admin exists: ${existingAdmin.name} (${existingAdmin.phone})`);
  } else {
    const name = process.env.ADMIN_NAME || "Green Admin";
    const phone = process.env.ADMIN_PHONE || "254700000000";
    const password = process.env.ADMIN_PASSWORD || "Admin#2026";
    await db.user.create({
      data: { name, phone, passwordHash: await bcrypt.hash(password, 10), role: "ADMIN" },
    });
    log.push(`admin created: ${name} (${phone}) — change this password after first login`);
  }

  const categoryCount = await db.category.count();
  if (categoryCount > 0) {
    log.push(`catalog exists (${categoryCount} categories)`);
  } else {
    for (const cat of CATEGORIES) {
      await createCategoryWithProducts(cat);
      log.push(`category seeded: ${cat.name} (${cat.products.length} products)`);
    }
  }

  const wifi = await db.category.findUnique({ where: { slug: WIFI_CATEGORY.slug } });
  if (wifi) {
    log.push(`category exists: ${WIFI_CATEGORY.name}`);
  } else {
    await createCategoryWithProducts(WIFI_CATEGORY);
    log.push(`category seeded: ${WIFI_CATEGORY.name} (sample prices — edit in Admin)`);
  }

  return log;
}
