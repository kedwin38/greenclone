-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImageAsset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ImageAsset" ("createdAt", "id", "mime", "size") SELECT "createdAt", "id", "mime", "size" FROM "ImageAsset";
DROP TABLE "ImageAsset";
ALTER TABLE "new_ImageAsset" RENAME TO "ImageAsset";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

