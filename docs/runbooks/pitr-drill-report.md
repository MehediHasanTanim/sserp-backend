# PITR Drill Report

| Field | Value |
|---|---|
| Date | _TBD_ |
| Target timestamp | 30 minutes before deliberate bad write |
| RPO target | < 6 hours |
| Measured data-loss window | _fill after drill_ |
| Result | PASS / FAIL |

## Steps

1. Ensure WAL archiving is enabled.
2. Insert a marker row, wait, insert a "bad" row.
3. Restore base backup + WAL replay to timestamp before bad row.
4. Confirm marker present and bad row absent.
