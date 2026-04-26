# Native Streaming Schema Rollout

> Runbook for safely applying the `ShowSession` native broadcast fields in
> production and staging environments.

---

## Background

The `ShowSession` Prisma model has been extended with nullable fields that
support the native broadcast lifecycle (ingest mode, health, heartbeats,
first-frame timing, and rollout-safe recovery). All new fields are additive
and nullable so they can be deployed without breaking the existing
external-encoder workflow.

New Prisma enums added:

| Enum             | Values                                 |
|------------------|----------------------------------------|
| `IngestMode`     | `NATIVE_WEBRTC`, `RTMP_EXTERNAL`       |
| `BroadcastHealth`| `GOOD`, `DEGRADED`, `DOWN`             |

New nullable fields on `ShowSession`:

| Field                      | Type              | Notes                                        |
|----------------------------|-------------------|----------------------------------------------|
| `ingestMode`               | `IngestMode?`     | Absent = external-encoder path               |
| `providerName`             | `String?`         | e.g. `cloudflare_stream`, `mux`, `stub`      |
| `providerStreamId`         | `String?`         | Provider stream resource identifier          |
| `providerInputId`          | `String?`         | Provider ingest input identifier             |
| `providerPlaybackId`       | `String?`         | Provider playback resource identifier        |
| `publishUrl`               | `String?`         | WHIP/RTMP endpoint for the seller publisher  |
| `publishTokenExpiresAt`    | `DateTime?`       | When the publish credential expires          |
| `broadcastStartedAt`       | `DateTime?`       | First successful frame confirmed by provider |
| `firstFrameAt`             | `DateTime?`       | Timestamp of first frame receipt             |
| `broadcastLastHeartbeatAt` | `DateTime?`       | Last heartbeat from native publisher         |
| `broadcastHealth`          | `BroadcastHealth?`| Current stream health                        |
| `reconnectCount`           | `Int @default(0)` | Number of reconnection attempts              |
| `broadcastErrorCode`       | `String?`         | Provider or client error code on failure     |
| `broadcastEndedReason`     | `String?`         | Why the broadcast ended                      |

---

## Rollout Safety

This repo applies schema changes via `db:push` (not `migrate`), so partial
deploy windows must be tolerated. The design satisfies all three rollout
requirements:

1. **Additive** - no existing columns are altered or removed.
2. **Nullable by default** - all new fields default to `NULL`, so existing
   rows are valid without backfill.
3. **Backward compatible** - API routes that do not yet write native broadcast
   fields continue to work; consumers that do not read the new fields are
   unaffected.

### Apply the schema

```bash
# Generate the updated Prisma client
pnpm --filter @arremate/database db:generate

# Push to database (dev / staging)
pnpm --filter @arremate/database db:push

# For production - create and apply a migration
pnpm --filter @arremate/database db:migrate
```

No backfill is needed. Existing `ShowSession` rows will have `NULL` for every
new field, which correctly represents the external-encoder workflow.

---

## Verifying the Deploy

After `db:push` or migration, confirm the new columns are present:

```sql
-- The Prisma model ShowSession maps to the 'show_sessions' table (@@map("show_sessions")).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'show_sessions'
  AND column_name IN (
    'ingest_mode', 'provider_name', 'provider_stream_id', 'provider_input_id',
    'provider_playback_id', 'publish_url', 'publish_token_expires_at',
    'broadcast_started_at', 'first_frame_at', 'broadcast_last_heartbeat_at',
    'broadcast_health', 'reconnect_count', 'broadcast_error_code',
    'broadcast_ended_reason'
  )
ORDER BY column_name;
```

All rows should show `is_nullable = YES` except `reconnect_count`, which has a
`DEFAULT 0` constraint.

---

## Rollback

Because all changes are additive, rollback is a no-op at the data layer.
Simply redeploy the previous API version; it will ignore the new columns.

If you need to remove the columns in a future cleanup, do so only after
confirming that no API code writes to or reads from them.

---

## Future Work

The fields defined here are placeholders for the native broadcast lifecycle
routes described in
`docs/plans/native-streaming-tools-implementation-plan.md`. They will be
populated once the following routes are implemented:

- `POST /v1/seller/sessions/:sessionId/broadcast-started`
- `POST /v1/seller/sessions/:sessionId/broadcast-heartbeat`
- `POST /v1/seller/sessions/:sessionId/broadcast-ended`
- `GET /v1/seller/sessions/:sessionId/broadcast-status`
- `POST /v1/webhooks/live-video`
