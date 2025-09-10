-- DropForeignKey
ALTER TABLE "ZikrVariant" DROP CONSTRAINT "ZikrVariant_zikrId_fkey";

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "repeats" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ZikrVariant" ALTER COLUMN "anchors" SET DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "ZikrVariant" ADD CONSTRAINT "ZikrVariant_zikrId_fkey" FOREIGN KEY ("zikrId") REFERENCES "Zikr"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
