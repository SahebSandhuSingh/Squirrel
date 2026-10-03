# Social backend patches

The Social service (`social-backend/`) isn't in this repository, so its changes are kept here as
patches against the `squirrel-social-profile-social-fixed/social-backend` snapshot of 2026-10-03
(migrations up to `0007_ambassador`).

Apply from inside `social-backend/`:

```bash
git am /path/to/0001-Campus-notifications-with-actor-Expo-push-receipts-l.patch
# or, if social-backend isn't a git checkout:
patch -p1 < /path/to/0001-Campus-notifications-with-actor-Expo-push-receipts-l.patch
.venv/bin/alembic upgrade head        # adds push_tickets (0008)
.venv/bin/python -m pytest -q
```

| Patch | What |
|---|---|
| 0001 | Campus kinds + `{actor}` + `notification_id` on `POST /internal/v1/notifications`; Expo receipt checking; tests stop when only `TEST_DATABASE_URL` is set; README `admin` typo |

Tested: 212 passed / 1 skipped on SQLite, 213 passed on PostgreSQL 16.
