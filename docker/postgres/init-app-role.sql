-- Application role used by the NestJS API (least privilege for audit_logs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sserp_app') THEN
    CREATE ROLE sserp_app LOGIN PASSWORD 'sserp_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE sserp TO sserp_app;
GRANT USAGE ON SCHEMA public TO sserp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sserp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sserp_app;
