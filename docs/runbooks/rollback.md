# Rollback Procedure

1. Announce maintenance.
2. Stop API/worker traffic at Nginx.
3. Restore previous Docker image digests (pinned in compose).
4. If schema migrated forward incompatibly: restore DB from pre-cutover backup.
5. Smoke test `/health/ready` and login.
6. Re-enable traffic.
7. File incident report within 24 hours.
