import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { PublishWorker } from '../../src/queue/publishWorker.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { generateIdempotencyKey } from '../../src/queue/idempotency.js';
import { VARIANT_STATUS, SCHEDULE_STATUS } from '../../src/config/constants.js';

describe('Phase 6: Database-Level Idempotent Publishing', () => {
  let dbCtx;
  let registry;
  let queue;
  let worker;
  let service;
  let app;
  let mockXPublisher;
  let telegramPublisher;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry({
      x: { latencyMs: 5 },
      linkedin: { latencyMs: 5 },
    });
    mockXPublisher = registry.get('mock_x');
    telegramPublisher = registry.get('telegram');

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

  it('1. Database UNIQUE constraint must reject duplicate schedules for the same slot', async () => {
    const post = await service.ingestMarkdown({
      title: 'DB Idempotency Enforcement',
      markdown: '# DB Idempotency Enforcement\n\nEnsuring strict uniqueness at the SQLite level.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const slot = '2026-10-02T15:00:00.000Z';
    const key = generateIdempotencyKey(variantId, slot);

    // First insert succeeds
    const s1 = dbCtx.schedules.create({
      variantId,
      scheduledTime: slot,
      idempotencyKey: key,
    });
    expect(s1.id).toBeDefined();

    // Direct SQLite insert with duplicate idempotency_key must fail at database level
    expect(() => {
      dbCtx.schedules.create({
        variantId,
        scheduledTime: slot,
        idempotencyKey: key,
      });
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('2. Database UNIQUE partial index must reject duplicate successful publish_logs', async () => {
    const post = await service.ingestMarkdown({
      title: 'Publish Log Uniqueness',
      markdown: '# Publish Log Uniqueness\n\nNo duplicate success logs allowed.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const slot = '2026-10-02T16:00:00.000Z';
    const key = generateIdempotencyKey(variantId, slot);

    // First success log insert succeeds
    const log1 = dbCtx.publishLogs.create({
      variantId,
      platform: 'mock_x',
      idempotencyKey: key,
      attemptNumber: 1,
      status: 'success',
      externalPostId: 'tw_12345',
      durationMs: 50,
    });
    expect(log1.id).toBeDefined();

    // Direct SQLite insert of a second success log for the exact same idempotency_key must be rejected by SQLite
    expect(() => {
      dbCtx.publishLogs.create({
        variantId,
        platform: 'mock_x',
        idempotencyKey: key,
        attemptNumber: 2,
        status: 'success',
        externalPostId: 'tw_99999',
        durationMs: 40,
      });
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('3. Publishing Flow: First run publishes, repeat request returns idempotent skip with zero duplicate adapter calls', async () => {
    const post = await service.ingestMarkdown({
      title: 'Idempotent Publish Flow',
      markdown: '# Idempotent Publish Flow\n\nPublished once and only once across retries.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const slot = '2026-10-02T18:00:00.000Z';
    const schedule = await service.scheduleVariant(variantId, slot);

    const publishSpy = vi.spyOn(mockXPublisher, 'publish');

    const job = {
      id: 'job_test_1',
      data: {
        scheduleId: schedule.id,
        variantId,
        platform: 'mock_x',
        idempotencyKey: schedule.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // --- STEP 1: First Publish Attempt ---
    const res1 = await worker.processJob(job);
    expect(res1.success).toBe(true);
    expect(publishSpy).toHaveBeenCalledTimes(1);

    const updatedVariant = dbCtx.variants.findById(variantId);
    expect(updatedVariant.status).toBe(VARIANT_STATUS.PUBLISHED);

    const updatedSchedule = dbCtx.schedules.findById(schedule.id);
    expect(updatedSchedule.status).toBe(SCHEDULE_STATUS.COMPLETED);

    // --- STEP 2: Repeat the exact same publish job (simulating duplicate trigger / retry) ---
    const res2 = await worker.processJob(job);
    expect(res2.duplicate || res2.skipped).toBe(true);

    // CRITICAL: Adapter must NOT be called a second time
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // Verify exactly ONE publish log exists in SQLite
    const history = dbCtx.publishLogs.getPublishHistory({ variantId });
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('success');
    expect(history[0].idempotency_key).toBe(schedule.idempotency_key);
  });

  it('4. Concurrent Publish Simulation: Two simultaneous worker executions yield exactly one publication', async () => {
    const post = await service.ingestMarkdown({
      title: 'Concurrency Safety',
      markdown: '# Concurrency Safety\n\nTesting concurrent worker race conditions.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const slot = '2026-10-02T20:00:00.000Z';
    const schedule = await service.scheduleVariant(variantId, slot);

    const publishSpy = vi.spyOn(mockXPublisher, 'publish');

    const jobA = {
      id: 'job_concurrent_A',
      data: {
        scheduleId: schedule.id,
        variantId,
        platform: 'mock_x',
        idempotencyKey: schedule.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const jobB = {
      id: 'job_concurrent_B',
      data: {
        scheduleId: schedule.id,
        variantId,
        platform: 'mock_x',
        idempotencyKey: schedule.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    // Execute concurrently
    const [resultA, resultB] = await Promise.all([
      worker.processJob(jobA),
      worker.processJob(jobB),
    ]);

    // One of them must have succeeded, the other must have skipped/deduped
    const succeededCount = [resultA, resultB].filter((r) => r.success === true && !r.duplicate).length;
    const skippedCount = [resultA, resultB].filter((r) => r.duplicate || r.skipped).length;

    expect(succeededCount).toBe(1);
    expect(skippedCount).toBe(1);

    // Adapter called only once
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // Database has exactly one publish log
    const allLogs = dbCtx.publishLogs.findAll({ variantId });
    expect(allLogs).toHaveLength(1);
  });

  it('5. API Surface: GET /publish-history and GET /publish-history/:variantId expose complete audit fields', async () => {
    const post = await service.ingestMarkdown({
      title: 'Audit History Verification',
      markdown: '# Audit History Verification\n\nFull visibility into publication lifecycle.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['mock_x'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    const slot = '2026-10-02T22:00:00.000Z';
    const schedule = await service.scheduleVariant(variantId, slot);

    await worker.processJob({
      id: 'job_audit_test',
      data: {
        scheduleId: schedule.id,
        variantId,
        platform: 'mock_x',
        idempotencyKey: schedule.idempotency_key,
      },
    });

    // Test GET /publish-history
    const resAll = await request(app).get('/publish-history');
    expect(resAll.status).toBe(200);
    expect(resAll.body.success).toBe(true);
    expect(Array.isArray(resAll.body.data)).toBe(true);
    expect(resAll.body.data.length).toBeGreaterThanOrEqual(1);

    const record = resAll.body.data.find((item) => item.variant_id === variantId);
    expect(record).toBeDefined();
    expect(record).toHaveProperty('variant');
    expect(record.variant.id).toBe(variantId);
    expect(record).toHaveProperty('platform', 'mock_x');
    expect(record).toHaveProperty('scheduled_slot');
    expect(record).toHaveProperty('idempotency_key', schedule.idempotency_key);
    expect(record).toHaveProperty('attempt_time');
    expect(record).toHaveProperty('status', 'success');
    expect(record).toHaveProperty('external_id');
    expect(record).toHaveProperty('result');

    // Test GET /publish-history/:variantId
    const resVariant = await request(app).get(`/publish-history/${variantId}`);
    expect(resVariant.status).toBe(200);
    expect(resVariant.body.success).toBe(true);
    expect(resVariant.body.data).toHaveLength(1);
    expect(resVariant.body.data[0].variant_id).toBe(variantId);
    expect(resVariant.body.data[0].idempotency_key).toBe(schedule.idempotency_key);
  });
});
