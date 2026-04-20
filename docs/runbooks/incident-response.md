# Incident Response Runbook

> For the Arremate operations team. Covers detection, triage, and resolution of
> common production incidents during the pilot launch phase.

---

## Severity levels

| Level | Definition | Response time |
|-------|-----------|--------------|
| **P1 – Critical** | Platform is down or checkout is completely broken | ≤ 15 min |
| **P2 – High** | Core feature degraded (payments slow, live sessions dropping) | ≤ 1 h |
| **P3 – Medium** | Non-blocking degradation (admin panel slow, emails delayed) | ≤ 4 h |
| **P4 – Low** | Minor cosmetic or edge-case issues | Next business day |

---

## On-call contacts

Keep this list updated in your internal wiki (do not store PII in the repo):

- **Primary on-call**: see internal rotation schedule
- **Escalation**: engineering lead
- **AWS support**: (link to support console)
- **Neon support**: https://neon.tech/support

---

## Step 1 – Detection and alerting

Incidents are typically detected via:

1. **Automated health check** – `GET /health` returns non-200 or `GET /v1/admin/health` reports `degraded`.
2. **Sentry error spike** – Error rate exceeds threshold in Sentry (when configured).
3. **Structured log alert** – CloudWatch / Datadog rule on `"level":"error"` volume.
4. **User report** – Support ticket or seller contact.

---

## Step 2 – Triage checklist

Run through these checks in order before escalating:

- [ ] Is the API health endpoint returning 200?  
  `curl https://api.arremate.com.br/health`
- [ ] Is the database reachable?  
  Check `GET /v1/admin/health` → `checks.database.status`
- [ ] Are there recent error spikes in the logs / Sentry?
- [ ] Were any deployments in the last 30 minutes?  
  Check GitHub Actions workflow runs.
- [ ] Is the payment provider (PIX) operational?  
  Check provider status page and `checks.paymentProvider`.

---

## Step 3 – Common incidents and resolution

### API server is down / 502

1. Check the deployment platform (e.g., AWS ECS, Railway, Render) for task health.
2. Review the latest deployment logs for startup errors.
3. If a bad deploy: roll back to the previous image/tag.
4. If a crash loop: check structured logs for the error message and stack trace.

### Database connection failures

1. Confirm `DATABASE_URL` and `DIRECT_URL` env vars are correct.
2. Check Neon project status: https://neon.tech/  
   (Neon can be paused if the project hasn't been accessed recently.)
3. If paused: resume the Neon project via the Neon console.
4. If connection limits exceeded: check Neon connection pooler settings.
5. Escalate to Neon support if the issue persists beyond 10 minutes.

### Payment webhook not processing

1. Check `POST /v1/webhooks/pix` logs for errors (look for `"error"` level logs with `url:"/v1/webhooks/pix"`).
2. Verify webhook signature validation is passing (check `PIX_PROVIDER` env var).
3. Re-deliver failed webhook events from the payment provider dashboard.
4. Manually reconcile any stuck orders in the admin panel.

### Live session unable to start / video feed not playing

1. Check the video provider (Mux / Cloudflare Stream) status page.
2. Verify `VIDEO_PROVIDER_KEY` environment variables are set and valid.
3. Check seller-facing error by reviewing `GET /v1/seller/shows/:id/go-live` logs.
4. If provider is down: notify sellers via the admin panel and estimate recovery time.

### Fraudulent seller / content moderation emergency

1. Immediately suspend the seller via `POST /v1/admin/users/:id/suspend`.
2. Record the moderation action in the audit log (happens automatically on suspension).
3. End any active live sessions by calling `POST /v1/seller/sessions/:id/end` (admin action).
4. Open a moderation case to document the full incident.
5. Notify affected buyers if they placed orders (see dispute handling runbook).

---

## Step 4 – Post-incident

1. Write a brief post-mortem (5 Whys or similar).
2. Identify and implement preventive measures.
3. Update this runbook if new failure modes were discovered.
4. Add any new monitoring rules (alerts, health checks) needed.

---

## Useful commands

```bash
# Check API health
curl https://api.arremate.com.br/health
curl -H "Authorization: Bearer $TOKEN" https://api.arremate.com.br/v1/admin/health

# Tail production logs (adjust for your log platform)
# CloudWatch: aws logs tail /arremate/api --follow
# Railway:    railway logs --tail

# Force a Prisma DB connection test
psql "$DATABASE_URL" -c "SELECT 1"
```
