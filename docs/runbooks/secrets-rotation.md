# Secrets Rotation

Rotate before go-live and on any suspected compromise.

| Secret | Location | Rotation steps |
|---|---|---|
| Postgres passwords | `.env` / secret store | ALTER ROLE; update compose secrets; rolling restart |
| Redis password | `.env` | Update Redis ACL; restart API/workers |
| MinIO keys | `.env` | Create new key; update apps; disable old |
| JWT keypair | `keys/` | Generate new RS256 pair; short dual-accept window; revoke old |
| SMTP / SMS | `.env` | Provider console rotate |
| `FIELD_ENCRYPTION_MASTER_KEY` | `.env` | Re-wrap data keys via `POST /admin/encryption/rotate/:purpose` **before** discarding old master |
| `BLIND_INDEX_KEY` | `.env` | Recompute `disability_category_hash` for all students |

Confirm `gitleaks` finds zero secrets in git history after rotation.
