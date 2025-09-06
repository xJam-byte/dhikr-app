-- CreateEnum
CREATE TYPE "VariantScript" AS ENUM ('LATIN', 'RU');

-- CreateTable
CREATE TABLE "ZikrVariant" (
    "id" TEXT NOT NULL,
    "zikrId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "script" "VariantScript" NOT NULL,
    "textRaw" TEXT NOT NULL,
    "textNorm" TEXT NOT NULL,
    "anchors" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZikrVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZikrVariant_zikrId_idx" ON "ZikrVariant"("zikrId");

-- AddForeignKey
ALTER TABLE "ZikrVariant" ADD CONSTRAINT "ZikrVariant_zikrId_fkey" FOREIGN KEY ("zikrId") REFERENCES "Zikr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
