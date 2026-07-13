# N3O Webhook Deployment Checklist

**Timeline:** 2–3 hours  
**Team:** DevOps, Backend Lead  
**Risk Level:** Low (fully reversible)

---

## Pre-Deployment Verification

- [ ] All backend files created and tested locally
  - [ ] `/api/webhooks/n3o.ts` ✅ Created
  - [ ] `/api/cron/process-webhooks.ts` ✅ Created
  - [ ] `/services/webhookQueue.ts` ✅ Created
  - [ ] `/lib/webhookProcessor.ts` ✅ Created
  - [ ] `/lib/applyWebhookDelta.ts` ✅ Created

- [ ] Environment variables prepared
  - [ ] `.env.example` created ✅
  - [ ] Vercel KV endpoint configured
  - [ ] Vercel Blob token configured
  - [ ] CRON_SECRET generated (random 32+ char string)

- [ ] Vercel configuration updated
  - [ ] `vercel.json` has cron entry ✅
  - [ ] All required environment variables added to Vercel

- [ ] N3O webhook configured
  - [ ] Webhook ID: WH1017 ✅
  - [ ] 11 events selected ✅
  - [ ] Endpoint URL: `https://muslim-hands-dashboard.vercel.app/api/webhooks/n3o` ✅

---

## Deployment Phase

### 1. Vercel Environment Variables Setup

**⏱️ Estimated Time:** 10 minutes

Steps:
1. Go to Vercel project settings
2. Click "Environment Variables"
3. Add each variable:

```
Name: CRON_SECRET
Value: [generate random string: openssl rand -hex 32]
Environments: Production

Name: KV_URL
Value: [from Vercel KV dashboard]
Environments: Production

Name: KV_REST_API_URL
Value: [from Vercel KV dashboard]
Environments: Production

Name: KV_REST_API_TOKEN
Value: [from Vercel KV dashboard]
Environments: Production

Name: KV_REST_API_READ_ONLY_TOKEN
Value: [from Vercel KV dashboard]
Environments: Production

Name: BLOB_READ_WRITE_TOKEN
Value: [from Vercel Blob dashboard]
Environments: Production
```

- [ ] All environment variables added
- [ ] Saved and confirmed in Vercel

---

### 2. Code Deployment

**⏱️ Estimated Time:** 5 minutes

Steps:
```bash
# 1. Commit all backend files
git add api/webhooks/n3o.ts
git add api/cron/process-webhooks.ts
git add services/webhookQueue.ts
git add lib/webhookProcessor.ts
git add lib/applyWebhookDelta.ts
git add docs/WEBHOOK_INTEGRATION.md
git add docs/WEBHOOK_DEPLOYMENT_CHECKLIST.md
git add vercel.json
git add .env.example

# 2. Commit with descriptive message
git commit -m "feat: N3O webhook real-time integration backend

- Add webhook receiver endpoint (/api/webhooks/n3o)
- Implement event queue service (Vercel KV)
- Add event processor for transformation
- Add delta application to aggregate
- Configure Vercel Cron for event processing
- Add comprehensive documentation and deployment guide"

# 3. Push to main (triggers Vercel deployment)
git push origin main
```

- [ ] Code committed to git
- [ ] Code pushed to main branch
- [ ] Vercel deployment started (check Vercel dashboard)
- [ ] Deployment completed (should see ✅ for all functions)

---

### 3. Verify Deployment

**⏱️ Estimated Time:** 10 minutes

Check Vercel logs:
```bash
# Watch real-time logs
vercel logs --follow

# Test webhook endpoint
curl -X POST https://muslim-hands-dashboard.vercel.app/api/webhooks/n3o \
  -H "n3o-event-type: test.ping" \
  -H "n3o-event-id: evt_deployment_test" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Should return:
# {
#   "status": "accepted",
#   "event_id": "evt_deployment_test",
#   "message": "Event queued for processing"
# }
```

- [ ] Webhook endpoint responds with 202
- [ ] Cron processor logs show successful runs
- [ ] No errors in Vercel deployment logs

---

### 4. N3O Webhook Testing

**⏱️ Estimated Time:** 15 minutes

Steps:

1. **Create test donor in N3O:**
   - Go to N3O Admin
   - Create new account: "Test Donor Dashboard"
   - Email: test-webhook@example.com (internal test email)

2. **Create test donation:**
   - Record donation: £5.00
   - Theme: "Orphans"
   - Destination: "Middle East"

3. **Monitor webhook delivery:**
   - N3O Admin → Webhooks → WH1017
   - Check "Recent Deliveries" tab
   - Should see `donation.created` event delivered

4. **Check Vercel logs:**
   ```bash
   vercel logs | grep "donation.created"
   ```
   
   Should see:
   ```
   [Webhook] Received event: donation.created (ID: evt_xxx)
   [Webhook] Event queued successfully: evt_xxx
   ```

5. **Wait 10 seconds for cron processor:**
   ```bash
   vercel logs | grep "Processing event"
   ```
   
   Should see:
   ```
   [Cron] Processing event: donation.created (evt_xxx)
   [Cron] Event processed successfully: evt_xxx
   ```

- [ ] Test donation created in N3O
- [ ] Webhook delivery confirmed in N3O logs
- [ ] Event received in Vercel webhook endpoint
- [ ] Event processed by cron processor
- [ ] No errors in processing

---

### 5. Aggregate Verification

**⏱️ Estimated Time:** 10 minutes

**NOTE:** This step requires Phase 2 implementation (aggregate storage integration)

For now, verify event transformation:

1. Check processor output in Vercel logs:
   ```bash
   vercel logs | grep "Delta"
   ```

2. Verify transformed data structure:
   ```
   [Delta] Applying donation.created delta to aggregate
   [Delta] Delta applied successfully for donation.created
   ```

- [ ] Event transformation logs appear
- [ ] No transformation errors
- [ ] Aggregate update logic ready for next phase

---

### 6. Monitoring Setup

**⏱️ Estimated Time:** 15 minutes

Create monitoring dashboard:

1. **Vercel Cron Status:**
   - Go to Vercel project
   - Cron Jobs tab
   - Verify `/api/cron/process-webhooks` shows recent runs
   - Check success rate (should be 100%)

2. **Queue Monitoring:**
   - Watch Vercel KV dashboard
   - Queue depth should stay near 0 (< 50 events)

3. **Error Monitoring:**
   - Set up Vercel log alerts (if available)
   - Watch for patterns in error logs

- [ ] Cron processor shows recent successful runs
- [ ] Queue depth is healthy (< 50 events)
- [ ] No recurring error patterns
- [ ] Monitoring dashboard visible

---

## Post-Deployment Validation

### First Hour

**⏱️ 60 minutes of monitoring**

- [ ] Cron runs consistently every 10 seconds
- [ ] No queue backlog builds up
- [ ] Webhook events being received and processed
- [ ] Error rate remains at 0%

**Smoke test:**
Create 5 more test donations in N3O and verify:
- [ ] Each webhook received in Vercel logs
- [ ] Each event processed by cron
- [ ] No processing errors

### First 24 Hours

**⏱️ Continuous monitoring**

- [ ] System processes all incoming webhooks without lag
- [ ] Queue depth never exceeds 100 events
- [ ] Processing latency stays < 5 seconds
- [ ] No memory leaks or resource issues

**Manual verification:**
- [ ] Compare test donations received in N3O vs. dashboard aggregate
- [ ] Verify amounts, themes, destinations match
- [ ] Check KPI updates reflect new donations

---

## Rollback Plan

If issues arise, rollback is simple:

### Immediate Rollback (< 5 minutes)

1. Disable cron processor:
   ```bash
   # Edit vercel.json
   # Remove crons section or set schedule to "0 0 32 * * *" (never)
   git add vercel.json
   git commit -m "chore: temporarily disable webhook cron"
   git push origin main
   ```

2. Revert to manual upload:
   - Dashboard continues working with existing aggregate
   - Re-enable manual CSV upload UI
   - Use CLI for backup uploads

3. Investigate issues
   - Review Vercel logs for errors
   - Check N3O webhook delivery status
   - Verify environment variable configuration

### Full Rollback (if critical issues)

```bash
# Revert to previous commit
git log --oneline | head -5  # Find pre-webhook commit
git revert <commit-hash>
git push origin main

# Vercel automatically redeploys without webhook code
```

- [ ] Rollback procedure understood
- [ ] Team knows how to execute
- [ ] Historical aggregate backup available

---

## Success Criteria

✅ **Deployment is successful when:**

1. All 5 backend files deployed and active
2. Webhook endpoint responds with 202 to incoming events
3. Cron processor runs every 10 seconds
4. Test donations flow from N3O → webhook → queue → processor
5. Queue depth stays < 50 events
6. Processing latency < 2 seconds per event
7. Event failure rate < 1%
8. 24 hours of clean logs with no errors

---

## Communication

### Internal Team Notification

```
📢 N3O Webhook Integration Deployed

Status: ✅ LIVE
Timeline: [date] [time]

What changed:
- Real-time event sync from N3O
- Webhook receiver at /api/webhooks/n3o
- Cron processor runs every 10 seconds
- Events queued in Vercel KV

What to monitor:
- Vercel logs for errors
- Queue depth in Vercel KV
- Dashboard aggregate updates

Questions?
- See: docs/WEBHOOK_INTEGRATION.md
- Ask: [backend lead]
```

### N3O Notification

```
✅ Webhook Integration Ready

Webhook ID: WH1017
Status: Active and receiving events
Endpoint: https://muslim-hands-dashboard.vercel.app/api/webhooks/n3o
Events: 11 (account, donation, pledge, giving, fund)

Monitoring:
- Events queued immediately (202 response)
- Processed every 10 seconds
- Real-time aggregate updates

Support: [contact]
```

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Environment setup | 10 min | ⏭️ Next |
| Code deployment | 5 min | ⏭️ Next |
| Deployment verification | 10 min | ⏭️ Next |
| N3O webhook testing | 15 min | ⏭️ Next |
| Aggregate verification | 10 min | ⏭️ Next |
| Monitoring setup | 15 min | ⏭️ Next |
| **Total** | **~65 min** | |

**Estimated completion:** 2:00 PM (starting now)

---

## Post-Deployment TODO

Phase 2 tasks (implement in next sprint):

- [ ] Integrate `applyWebhookDelta()` with existing aggregate
- [ ] Implement aggregate storage in Vercel Blob
- [ ] Add Vercel KV initialization script
- [ ] Build aggregate fetch endpoint
- [ ] Add WebSocket support for live updates
- [ ] Implement event retry mechanism
- [ ] Set up automated alerts
- [ ] Add event audit trail logging
- [ ] Create admin dashboard for webhook monitoring
- [ ] Plan historical data backfill (Phase 3)

---

**Prepared by:** Backend Team  
**Date:** July 13, 2026  
**Review by:** [DevOps Lead]
