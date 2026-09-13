import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// On the Cloudflare Workers runtime there is no native Prisma query engine and
// no persistent filesystem, so the SQLite connection comes from the D1 binding
// (`env.DB`) via the driver adapter — resolved per isolate, on first use.
//
// The app imports `db` as a module-level singleton and calls it inside request
// handlers (the whole app is `force-dynamic`, so nothing runs at build time).
// The D1 binding is only reachable through getCloudflareContext(), which is
// available during a request, so we resolve the real client lazily behind a
// Proxy and keep every existing `db.model.method()` call site unchanged.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const log: ("warn" | "error")[] =
    process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  try {
    // Cloudflare Workers: connect through the D1 binding via the driver adapter.
    const { env } = getCloudflareContext();
    return new PrismaClient({ adapter: new PrismaD1(env.DB), log });
  } catch {
    // Node context (vitest, prisma scripts, non-Cloudflare hosts): fall back to
    // the native query engine driven by DATABASE_URL. getCloudflareContext()
    // throws when there is no Workers request context.
    return new PrismaClient({ log });
  }
}

function client(): PrismaClient {
  // The D1 binding is stable for the life of an isolate, so one client per
  // isolate is safe and avoids re-instantiating on every query.
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const c = client();
    const value = Reflect.get(c, prop, receiver);
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as PrismaClient;
