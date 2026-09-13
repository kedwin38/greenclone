import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { db } from "./db";
import { getSettingGroup, saveSettingGroup, type BackupSettings } from "./settings";
import { audit } from "./audit";

export class BackupError extends Error {}

function client(cfg: BackupSettings): S3Client {
  return new S3Client({
    region: cfg.region || "auto",
    endpoint: cfg.endpoint || undefined,
    // Path-style addressing is what every non-AWS S3-compatible provider
    // (R2, B2, Spaces, MinIO) expects; real AWS S3 also accepts it.
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

function keyPrefix(cfg: BackupSettings): string {
  return cfg.prefix ? `${cfg.prefix.replace(/\/+$/, "")}/` : "";
}

async function enforceRetention(s3: S3Client, cfg: BackupSettings) {
  if (!cfg.retentionCount) return;
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: keyPrefix(cfg) })
  );
  const objects = (list.Contents || [])
    .filter((o) => o.Key?.includes("gcn-backup-"))
    .sort((a, b) => (a.LastModified?.getTime() ?? 0) - (b.LastModified?.getTime() ?? 0));
  const excess = objects.length - cfg.retentionCount;
  for (const obj of excess > 0 ? objects.slice(0, excess) : []) {
    if (obj.Key) await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: obj.Key }));
  }
}

/**
 * Exports every table as a single JSON snapshot and uploads it to the
 * admin-configured S3-compatible bucket (AWS S3, Cloudflare R2, B2, …).
 *
 * On the Workers runtime there is no filesystem and no SQLite file to
 * `VACUUM INTO`, so the snapshot is built in memory from the database via
 * Prisma. Restore by reading the JSON back into the tables. Image binaries
 * live in R2 and are not included here — back the R2 bucket up separately if
 * required (R2 supports its own object lifecycle and replication).
 */
export async function runBackup(): Promise<{ key: string; size: number }> {
  const cfg = await getSettingGroup("backup");
  if (!cfg.bucket || !cfg.region || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new BackupError(
      "Fill in region, bucket and access credentials first, then save."
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `${keyPrefix(cfg)}gcn-backup-${stamp}.json`;

  try {
    const [
      users,
      categories,
      products,
      imageAssets,
      orders,
      orderItems,
      payments,
      supportTickets,
      ticketReplies,
      settings,
      auditLogs,
    ] = await Promise.all([
      db.user.findMany(),
      db.category.findMany(),
      db.product.findMany(),
      db.imageAsset.findMany(),
      db.order.findMany(),
      db.orderItem.findMany(),
      db.payment.findMany(),
      db.supportTicket.findMany(),
      db.ticketReply.findMany(),
      db.setting.findMany(),
      db.auditLog.findMany(),
    ]);

    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: {
        users,
        categories,
        products,
        imageAssets,
        orders,
        orderItems,
        payments,
        supportTickets,
        ticketReplies,
        settings,
        auditLogs,
      },
    };

    const body = new TextEncoder().encode(JSON.stringify(snapshot));

    const s3 = client(cfg);
    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
      })
    );
    await enforceRetention(s3, cfg);

    await saveSettingGroup("backup", {
      lastRunAt: new Date().toISOString(),
      lastRunOk: true,
      lastRunMessage: `Backed up ${(body.length / 1024).toFixed(0)} KB to ${key}`,
    });
    await audit(null, "backup.success", "backup", key, { size: body.length });

    return { key, size: body.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown backup error.";
    await saveSettingGroup("backup", {
      lastRunAt: new Date().toISOString(),
      lastRunOk: false,
      lastRunMessage: message,
    });
    await audit(null, "backup.failed", "backup", undefined, { message });
    throw err instanceof BackupError ? err : new BackupError(message);
  }
}

/** Whether a scheduled backup is due, based on the last recorded run. */
export function isBackupDue(cfg: BackupSettings): boolean {
  if (!cfg.enabled || !cfg.intervalHours) return false;
  const last = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0;
  return Date.now() >= last + cfg.intervalHours * 3600_000;
}
