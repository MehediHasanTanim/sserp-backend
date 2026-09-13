-- Persist optional IEP plan end date (frontend already sends endDate).
ALTER TABLE "iep_plans" ADD COLUMN "end_date" DATE;
