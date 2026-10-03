-- Restrukturisasi organisasi:
--   Sebelumnya: Division -> Department -> Section -> Team
--   Menjadi   : Company -> Department -> Division -> Section -> Team
--
-- Data lama dipetakan otomatis:
--   - Setiap Department lama menjadi child dari Company default.
--   - Setiap Division lama menjadi child dari Department yang dulu menaunginya
--     (kebalikan relasi Department.divisionId lama).
--   - Setiap Section lama dipindah dari parent Department ke Division
--     (mengambil divisionId dari Department lama-nya).

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- Perusahaan default (idempoten)
INSERT INTO "Company" ("code", "name", "updatedAt")
VALUES ('QM_YWI', 'QM YWI', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Department.companyId: tambah nullable -> backfill -> NOT NULL
ALTER TABLE "Department" ADD COLUMN "companyId" INTEGER;
UPDATE "Department"
SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
WHERE "companyId" IS NULL;
ALTER TABLE "Department" ALTER COLUMN "companyId" SET NOT NULL;

-- Division.departmentId: kebalikan dari Department.divisionId lama
ALTER TABLE "Division" ADD COLUMN "departmentId" INTEGER;
UPDATE "Division" d
SET "departmentId" = sub."id"
FROM (
    SELECT DISTINCT ON ("divisionId") "divisionId", "id"
    FROM "Department"
    WHERE "divisionId" IS NOT NULL
    ORDER BY "divisionId", "id"
) sub
WHERE sub."divisionId" = d."id";
UPDATE "Division"
SET "departmentId" = (SELECT "id" FROM "Department" ORDER BY "id" LIMIT 1)
WHERE "departmentId" IS NULL;
ALTER TABLE "Division" ALTER COLUMN "departmentId" SET NOT NULL;

-- Section.divisionId: ambil dari Department lama yang menaunginya
ALTER TABLE "Section" ADD COLUMN "divisionId" INTEGER;
UPDATE "Section" s
SET "divisionId" = dep."divisionId"
FROM "Department" dep
WHERE dep."id" = s."departmentId";
UPDATE "Section"
SET "divisionId" = (SELECT "id" FROM "Division" ORDER BY "id" LIMIT 1)
WHERE "divisionId" IS NULL;
ALTER TABLE "Section" ALTER COLUMN "divisionId" SET NOT NULL;

-- DropForeignKey lama
ALTER TABLE "Department" DROP CONSTRAINT "Department_divisionId_fkey";
ALTER TABLE "Section" DROP CONSTRAINT "Section_departmentId_fkey";

-- DropColumn lama
ALTER TABLE "Department" DROP COLUMN "divisionId";
ALTER TABLE "Section" DROP COLUMN "departmentId";

-- AddForeignKey baru
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Division" ADD CONSTRAINT "Division_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Section" ADD CONSTRAINT "Section_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
