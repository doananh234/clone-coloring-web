-- CreateTable
CREATE TABLE "Font" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "weight" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Font_pkey" PRIMARY KEY ("id")
);
