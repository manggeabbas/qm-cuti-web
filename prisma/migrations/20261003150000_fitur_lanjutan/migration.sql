-- AlterEnum: tambah role WSPV
ALTER TYPE "RoleName" ADD VALUE 'WSPV';
ALTER TYPE "WorkflowStepRole" ADD VALUE 'WSPV';

-- CreateEnum
CREATE TYPE "ShiftScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED');

-- CreateEnum
CREATE TYPE "OffChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OffChangeAction" AS ENUM ('ADD', 'REMOVE');

-- AlterTable: Employee.offLocked
ALTER TABLE "Employee" ADD COLUMN "offLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: ShiftRoster.periodId
ALTER TABLE "ShiftRoster" ADD COLUMN "periodId" INTEGER;

-- CreateTable
CREATE TABLE "ShiftRotationTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftRotationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRotationTemplateItem" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "periodOrder" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "shiftTypeId" INTEGER NOT NULL,

    CONSTRAINT "ShiftRotationTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSchedulePeriod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "templateId" INTEGER,
    "templateVersion" INTEGER,
    "status" "ShiftScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSchedulePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffChangeRequest" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "action" "OffChangeAction" NOT NULL DEFAULT 'ADD',
    "date" DATE NOT NULL,
    "note" TEXT,
    "status" "OffChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" INTEGER NOT NULL,
    "reviewedBy" INTEGER,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeHistory" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "oldLabel" TEXT,
    "newValue" TEXT,
    "newLabel" TEXT,
    "effectiveDate" DATE,
    "changedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftRotationTemplateItem_templateId_periodOrder_teamId_key" ON "ShiftRotationTemplateItem"("templateId", "periodOrder", "teamId");
CREATE INDEX "ShiftRotationTemplateItem_templateId_idx" ON "ShiftRotationTemplateItem"("templateId");
CREATE INDEX "ShiftSchedulePeriod_from_to_idx" ON "ShiftSchedulePeriod"("from", "to");
CREATE INDEX "ShiftSchedulePeriod_status_idx" ON "ShiftSchedulePeriod"("status");
CREATE INDEX "ShiftRoster_periodId_idx" ON "ShiftRoster"("periodId");
CREATE INDEX "OffChangeRequest_employeeId_status_idx" ON "OffChangeRequest"("employeeId", "status");
CREATE INDEX "OffChangeRequest_status_idx" ON "OffChangeRequest"("status");
CREATE INDEX "EmployeeHistory_employeeId_createdAt_idx" ON "EmployeeHistory"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShiftRotationTemplateItem" ADD CONSTRAINT "ShiftRotationTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShiftRotationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftRotationTemplateItem" ADD CONSTRAINT "ShiftRotationTemplateItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftRotationTemplateItem" ADD CONSTRAINT "ShiftRotationTemplateItem_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShiftSchedulePeriod" ADD CONSTRAINT "ShiftSchedulePeriod_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ShiftRotationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftRoster" ADD CONSTRAINT "ShiftRoster_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ShiftSchedulePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OffChangeRequest" ADD CONSTRAINT "OffChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeHistory" ADD CONSTRAINT "EmployeeHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
