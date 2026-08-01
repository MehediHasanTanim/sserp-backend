# Restore Drill Report

| Field | Value |
|---|---|
| Date | _TBD_ |
| Operator | |
| Source backup | |
| Target host | clean VM |
| RTO target | 4 hours |
| Actual restore duration | _fill after drill_ |
| Data validation | row counts / sample checksums |
| Result | PASS / FAIL |

## Steps

1. Provision clean host with Docker Compose prod stack.
2. Restore latest GPG-encrypted `pg_dump`.
3. Restore MinIO bucket snapshot.
4. Point `DATABASE_URL` / MinIO env at restored volumes.
5. Run smoke test script.
6. Record timings above.
