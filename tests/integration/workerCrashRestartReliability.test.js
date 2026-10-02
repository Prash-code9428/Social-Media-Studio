import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { PublishWorker } from '../../src/queue/publishWorker.js';
import { ReconciliationService } from '../../src/queue/reconciliationService.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { VARIANT_STATUS, SCHEDULE_STATUS } from '../../src/config/constants.js';

describe('Phase 9: Comprehensive Worker Crash & Restart Reliability Verification', () => {
  let dbCtx;
  let registry;
  let queue1;
  let worker1;
  let service;
  let app;
  let telegramSpy;
  let mockXSpy;
  let mockLinkedInSpy;
  let fetchSpy;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');

    registry = new PublisherRegistry({
      telegram: {
        botToken: 'test_bot_token_masked',
        chatId: '@FlyRankReliabilityChannel',
      },
      x: { latencyMs: 2 },
      linkedin: { latencyMs: 2 },
    });

    let msgIdCounter = 70100;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (url.includes('api.telegram.org')) {
        msgIdCounter++;
        const body = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: {
              message_id: msgIdCounter,
              chat: { username: 'FlyRankReliabilityChannel' },
              date: Math.floor(Date.now() / 1000),
              text: body.text,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    telegramSpy = vi.spyOn(registry.get('telegram'), 'publish');
    mockXSpy = vi.spyOn(registry.get('mock_x'), 'publish');
    mockLinkedInSpy = vi.spyOn(registry.get('mock_linkedin'), 'publish');

    queue1 = new PublishQueue();
    worker1 = new PublishWorker({ dbCtx, publisherRegistry: registry });
    service = new SocialStudioService({
      dbCtx,
      publishQueue: queue1,
      publisherRegistry: registry,
    });
    app = createApp({ service, dbCtx, publishQueue: queue1, publisherRegistry: registry });
  });

  afterEach(async () => {
    if (fetchSpy) fetchSpy.mockRestore();
    await worker1.close();
    await queue1.close();
    dbCtx.db.close();
  });

  it('Reproducible Crash & Restart Scenario with In-Flight Jobs, Deduplication & Audit Proof', async () => {
    // ==========================================
    // STEP 1: Ingest Campaign & Approve Variants
    // ==========================================
    const postRes = await request(app)
      .post('/posts')
      .send({
        markdown: '# High-Throughput Distributed Schedulers\n\nDesigning fault-tolerant background queues with state machine guarantees.',
      });
    expect(postRes.status).toBe(201);
    const postId = postRes.body.data.id;

    const genRes = await request(app).post(`/posts/${postId}/generate`);
    expect(genRes.status).toBe(201);
    const variants = genRes.body.data;

    const vTelegram = variants.find((v) => v.platform === 'telegram');
    const vX = variants.find((v) => v.platform === 'mock_x');
    const vLinkedIn = variants.find((v) => v.platform === 'mock_linkedin');

    await request(app).post(`/variants/${vTelegram.id}/approve`).expect(200);
    await request(app).post(`/variants/${vX.id}/approve`).expect(200);
    await request(app).post(`/variants/${vLinkedIn.id}/approve`).expect(200);

    // ==========================================
    // STEP 2: Schedule Multiple Jobs Close Together
    // ==========================================
    const baseTime = Date.now() + 60000;
    const s1Res = await request(app)
      .post(`/variants/${vTelegram.id}/schedule`)
      .send({ scheduled_for: new Date(baseTime).toISOString() });
    const s2Res = await request(app)
      .post(`/variants/${vX.id}/schedule`)
      .send({ scheduled_for: new Date(baseTime + 1000).toISOString() });
    const s3Res = await request(app)
      .post(`/variants/${vLinkedIn.id}/schedule`)
      .send({ scheduled_for: new Date(baseTime + 2000).toISOString() });

    expect(s1Res.status).toBe(201);
    expect(s2Res.status).toBe(201);
    expect(s3Res.status).toBe(201);

    const s1 = s1Res.body.data;
    const s2 = s2Res.body.data;
    const s3 = s3Res.body.data;

    // --- SNAPSHOT: BEFORE STOP ---
    const beforeSchedules = dbCtx.schedules.findAll();
    const beforeLogs = dbCtx.publishLogs.findAll();
    expect(beforeSchedules).toHaveLength(3);
    expect(beforeSchedules.every((s) => s.status === SCHEDULE_STATUS.QUEUED)).toBe(true);
    expect(beforeLogs).toHaveLength(0);

    // ==========================================
    // STEP 3: Process Job 1 (Telegram)
    // ==========================================
    const job1Data = {
      scheduleId: s1.id,
      variantId: vTelegram.id,
      platform: 'telegram',
      idempotencyKey: s1.idempotency_key,
    };
    const res1 = await worker1.processJob({
      id: `job_${s1.id}`,
      data: job1Data,
      attemptsMade: 0,
      opts: { attempts: 3 },
    });
    expect(res1.success).toBe(true);
    expect(telegramSpy).toHaveBeenCalledTimes(1);

    // ==========================================
    // STEP 4: WORKER CRASH / HARD STOP
    // Worker 1 terminates while Job 2 & 3 are still pending/in-flight
    // ==========================================
    await worker1.close();
    await queue1.close();

    // Check intermediate state:
    const s1Intermediate = dbCtx.schedules.findById(s1.id);
    const s2Intermediate = dbCtx.schedules.findById(s2.id);
    const s3Intermediate = dbCtx.schedules.findById(s3.id);

    expect(s1Intermediate.status).toBe(SCHEDULE_STATUS.COMPLETED);
    expect(s2Intermediate.status).toBe(SCHEDULE_STATUS.QUEUED);
    expect(s3Intermediate.status).toBe(SCHEDULE_STATUS.QUEUED);

    // ==========================================
    // STEP 5: WORKER RESTART & RECONCILIATION
    // ==========================================
    const queue2 = new PublishQueue();
    const worker2 = new PublishWorker({ dbCtx, publisherRegistry: registry });
    worker2.start();

    // Boot reconciliation recovers unexecuted schedules
    const reconciler = new ReconciliationService({ dbCtx, publishQueue: queue2 });
    const reconReport = await reconciler.reconcile();

    // Total checked: 2 pending schedules (s2, s3); s1 already marked completed so skipped
    expect(reconReport.totalChecked).toBe(2);
    expect(reconReport.recoveredCount).toBe(2);

    // Process remaining recovered jobs
    const res2 = await worker2.processJob({
      id: `job_${s2.id}`,
      data: {
        scheduleId: s2.id,
        variantId: vX.id,
        platform: 'mock_x',
        idempotencyKey: s2.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    });
    expect(res2.success).toBe(true);
    expect(mockXSpy).toHaveBeenCalledTimes(1);

    const res3 = await worker2.processJob({
      id: `job_${s3.id}`,
      data: {
        scheduleId: s3.id,
        variantId: vLinkedIn.id,
        platform: 'mock_linkedin',
        idempotencyKey: s3.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    });
    expect(res3.success).toBe(true);
    expect(mockLinkedInSpy).toHaveBeenCalledTimes(1);

    // ==========================================
    // STEP 6: REPLAY / DUPLICATE ATTEMPT ON JOB 1
    // ==========================================
    const duplicateJob1Res = await worker2.processJob({
      id: `job_${s1.id}`,
      data: job1Data,
      attemptsMade: 1,
      opts: { attempts: 3 },
    });
    expect(duplicateJob1Res.duplicate || duplicateJob1Res.skipped).toBe(true);

    // Telegram adapter was NOT invoked a second time
    expect(telegramSpy).toHaveBeenCalledTimes(1);

    // ==========================================
    // STEP 7: VERIFICATIONS AFTER RESTART
    // ==========================================
    // 1. All schedules are completed
    const finalSchedules = dbCtx.schedules.findAll();
    expect(finalSchedules).toHaveLength(3);
    expect(finalSchedules.every((s) => s.status === SCHEDULE_STATUS.COMPLETED)).toBe(true);

    // 2. All variants have status 'published'
    const finalVTelegram = dbCtx.variants.findById(vTelegram.id);
    const finalVX = dbCtx.variants.findById(vX.id);
    const finalVLinkedIn = dbCtx.variants.findById(vLinkedIn.id);

    expect(finalVTelegram.status).toBe(VARIANT_STATUS.PUBLISHED);
    expect(finalVX.status).toBe(VARIANT_STATUS.PUBLISHED);
    expect(finalVLinkedIn.status).toBe(VARIANT_STATUS.PUBLISHED);

    // 3. Publish History has exactly 3 successful logs (zero duplicates)
    const historyRes = await request(app).get('/publish-history');
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toHaveLength(3);

    const telegramLog = historyRes.body.data.find((l) => l.platform === 'telegram');
    const xLog = historyRes.body.data.find((l) => l.platform === 'mock_x');
    const linkedInLog = historyRes.body.data.find((l) => l.platform === 'mock_linkedin');

    expect(telegramLog.status).toBe('success');
    expect(telegramLog.external_id).toBeDefined();
    expect(xLog.status).toBe('success');
    expect(xLog.external_id).toBeDefined();
    expect(linkedInLog.status).toBe('success');
    expect(linkedInLog.external_id).toBeDefined();

    // Adapter call counts across entire lifecycle: exactly 1 each
    expect(telegramSpy).toHaveBeenCalledTimes(1);
    expect(mockXSpy).toHaveBeenCalledTimes(1);
    expect(mockLinkedInSpy).toHaveBeenCalledTimes(1);

    await worker2.close();
    await queue2.close();
  });
});
