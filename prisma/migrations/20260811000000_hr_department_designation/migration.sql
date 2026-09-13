-- CreateTable
CREATE TABLE "hr_departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_designations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "hr_designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hr_departments_code_key" ON "hr_departments"("code");

-- CreateIndex
CREATE INDEX "hr_designations_department_id_idx" ON "hr_designations"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_designations_department_id_name_key" ON "hr_designations"("department_id", "name");

-- AddForeignKey
ALTER TABLE "hr_designations" ADD CONSTRAINT "hr_designations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed canonical departments (codes match former HrDepartment enum)
INSERT INTO "hr_departments" ("id", "code", "name", "sort_order", "updated_at") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'school', 'School', 1, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002', 'therapy', 'Therapy', 2, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000003', 'administration', 'Administration', 3, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000004', 'support', 'Support', 4, CURRENT_TIMESTAMP);

-- Add nullable FK columns
ALTER TABLE "employees" ADD COLUMN "department_id" UUID;
ALTER TABLE "employees" ADD COLUMN "designation_id" UUID;

-- Create designations from existing (department, designation) pairs
INSERT INTO "hr_designations" ("id", "name", "department_id", "updated_at")
SELECT gen_random_uuid(), e.designation, d.id, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT department::text AS dept_code, designation
  FROM "employees"
  WHERE designation IS NOT NULL AND btrim(designation) <> ''
) e
JOIN "hr_departments" d ON d.code = e.dept_code
ON CONFLICT ("department_id", "name") DO NOTHING;

-- Fallback designation per department for empty/missing names
INSERT INTO "hr_designations" ("id", "name", "department_id", "updated_at")
SELECT gen_random_uuid(), 'Staff', d.id, CURRENT_TIMESTAMP
FROM "hr_departments" d
ON CONFLICT ("department_id", "name") DO NOTHING;

-- Backfill department_id
UPDATE "employees" e
SET "department_id" = d.id
FROM "hr_departments" d
WHERE d.code = e.department::text;

-- Backfill designation_id (match by name + department; else Staff)
UPDATE "employees" e
SET "designation_id" = desig.id
FROM "hr_designations" desig
WHERE desig.department_id = e.department_id
  AND desig.name = NULLIF(btrim(e.designation), '');

UPDATE "employees" e
SET "designation_id" = desig.id
FROM "hr_designations" desig
WHERE e.designation_id IS NULL
  AND desig.department_id = e.department_id
  AND desig.name = 'Staff';

-- Enforce NOT NULL
ALTER TABLE "employees" ALTER COLUMN "department_id" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "designation_id" SET NOT NULL;

-- Drop legacy columns + index
DROP INDEX IF EXISTS "employees_department_status_idx";
ALTER TABLE "employees" DROP COLUMN "department";
ALTER TABLE "employees" DROP COLUMN "designation";

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "hr_designations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "employees_department_id_status_idx" ON "employees"("department_id", "status");
CREATE INDEX "employees_designation_id_idx" ON "employees"("designation_id");
