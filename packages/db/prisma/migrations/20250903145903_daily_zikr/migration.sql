-- CreateTable
CREATE TABLE "UserZikrDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zikrId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL DEFAULT 33,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserZikrDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserZikrDaily_userId_date_idx" ON "UserZikrDaily"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "UserZikrDaily_userId_zikrId_date_key" ON "UserZikrDaily"("userId", "zikrId", "date");
