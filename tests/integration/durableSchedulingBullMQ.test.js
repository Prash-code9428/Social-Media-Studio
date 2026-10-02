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

describe('Phase 7: Durable Scheduling with BullMQ & Worker Restart Safety', () => {
  let dbCtx;
  let registry;
  let queue;
  let worker;
  let service;
  let app;
  let mockXPublisher;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry({
      x: { latencyMs: 5 },
      linkedin: { latencyMs: 5 },
    });
    mockXPublisher = registry.get('mock_x');

    queue = new PublishQueue();
    worker = new PublishWorker({ dbCtx, publisherRegistry: registry });
    service = new SocialStudioService({
      dbCtx,
      publishQueue: queue,
      publisherRegistry: registry,
    });
    app = createApp({ service, dbCtx, publishQueue: queue, publisherRegistry: registry });
  });

  afterEach(async () => {
    await worker.close();
    await queue.close();
    dbCtx.db.close();
  });

  it('1. POST /variants/:id/schedule rejects unapproved variants with 4xx error', async () => {
    const post = await service.ingestMarkdown({
      title: 'Unapproved Schedule Gate',
      markdown: '# Unapproved Schedule Gate\n\nOnly approved items may be scheduled.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id; // Status is 'draft'

    const scheduledFor = new Date(Date.now() + 120000).toISOString();

    const res = await request(app)
      .post(`/variants/${variantId}/schedule`)
      .send({ scheduled_for: scheduledFor });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Only approved variants can be scheduled/);
  });

  it('2. POST /variants/:id/schedule with scheduled_for creates durable schedule record', async () => {
    const post = await service.ingestMarkdown({
      title: 'Durable Scheduling Test',
      markdown: '# Durable Scheduling Test\n\nScheduling 2 minutes in the future.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const scheduledFor = new Date(Date.now() + 120000).toISOString();

    const res = await request(app)
      .post(`/variants/${variantId}/schedule`)
      .send({ scheduled_for: scheduledFor });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.variant_id).toBe(variantId);
    expect(res.body.data.idempotency_key).toBeDefined();
    expect(res.body.data.status).toBe(SCHEDULE_STATUS.QUEUED);

    // Verify GET /schedules
    const resSchedules = await request(app).get('/schedules');
    expect(resSchedules.status).toBe(200);
    expect(resSchedules.body.data.length).toBeGreaterThanOrEqual(1);
    const found = resSchedules.body.data.find((s) => s.id === res.body.data.id);
    expect(found).toBeDefined();
    expect(found.idempotency_key).toBe(res.body.data.idempotency_key);
  });

  it('3. Crash & Restart Scenario: Worker reboot recovers pending batch and publishes exactly once', async () => {
    // A. Ingest and approve variant
    const post = await service.ingestMarkdown({
      title: 'Worker Crash Survival',
      markdown: '# Worker Crash Survival\n\nJobs survive worker crashes and server restarts.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    // B. Schedule 2 minutes in the future (A)
    const scheduledTime = new Date(Date.now() + 120000).toISOString();
    const schedule = await service.scheduleVariant(variantId, scheduledTime);

    // C. Simulate Worker Crash: stop current worker and queue
    await worker.close();
    await queue.close();

    // D. Restart Worker: initialize fresh queue & worker, and trigger startup reconciliation
    const newQueue = new PublishQueue();
    const newWorker = new PublishWorker({ dbCtx, publisherRegistry: registry });
    newWorker.start();

    const publishSpy = vi.spyOn(mockXPublisher, 'publish');

    const reconciler = new ReconciliationService({ dbCtx, publishQueue: newQueue });
    const reconResult = await reconciler.reconcile();

    expect(reconResult.totalChecked).toBeGreaterThanOrEqual(1);
    expect(reconResult.recoveredCount).toBeGreaterThanOrEqual(1);

    // E. Worker processes the recovered job
    const jobData = {
      scheduleId: schedule.id,
      variantId,
      platform: 'mock_x',
      idempotencyKey: schedule.idempotency_key,
    };

    const pubResult = await newWorker.processJob({
      id: `job_${schedule.id}`,
      data: jobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    });

    expect(pubResult.success).toBe(true);

    // F. Verify variant becomes published (H)
    const updatedVariant = dbCtx.variants.findById(variantId);
    expect(updatedVariant.status).toBe(VARIANT_STATUS.PUBLISHED);

    // G. Verify schedule is completed
    const updatedSchedule = dbCtx.schedules.findById(schedule.id);
    expect(updatedSchedule.status).toBe(SCHEDULE_STATUS.COMPLETED);

    // H. Repeat execution (simulating replay after restart)
    const replayResult = await newWorker.processJob({
      id: `job_${schedule.id}`,
      data: jobData,
      attemptsMade: 1,
      opts: { attempts: 3 },
    });
    expect(replayResult.duplicate || replayResult.skipped).toBe(true);

    // I. Verify adapter was called EXACTLY ONCE (F)
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // J. Verify publish history via GET /publish-history (G)
    const resHistory = await request(app).get(`/publish-history/${variantId}`);
    expect(resHistory.status).toBe(200);
    expect(resHistory.body.data).toHaveLength(1);
    expect(resHistory.body.data[0].status).toBe('success');
    expect(resHistory.body.data[0].idempotency_key).toBe(schedule.idempotency_key);

    await newWorker.close();
    await newQueue.close();
  });
});
