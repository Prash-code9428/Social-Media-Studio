import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { PublishWorker } from '../../src/queue/publishWorker.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { VARIANT_STATUS, VALIDATION_STATUS, SCHEDULE_STATUS } from '../../src/config/constants.js';

describe('End-to-End Social Studio Workflow', () => {
  let dbCtx;
  let registry;
  let queue;
  let worker;
  let service;

  beforeEach(() => {
    // In-memory SQLite for test isolation
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry({
      x: { latencyMs: 5 },
      linkedin: { latencyMs: 5 },
    });
    queue = new PublishQueue();
    worker = new PublishWorker({ dbCtx, publisherRegistry: registry });
    service = new SocialStudioService({
      dbCtx,
      publishQueue: queue,
      publisherRegistry: registry,
    });
  });

  afterEach(async () => {
    await worker.close();
    await queue.close();
    dbCtx.db.close();
  });

  it('should complete entire lifecycle: Ingestion -> Variants -> Review -> Schedule -> Publish -> Audit', async () => {
    // 1. Ingest Markdown
    const post = await service.ingestMarkdown({
      title: 'Building Modern Real-Time Web Apps',
      markdown: '# Building Modern Real-Time Web Apps\n\nWebSockets and durable queues allow seamless real-time experiences.\n\nHere is how to scale them efficiently.',
    });
    expect(post.id).toBeDefined();
    expect(post.title).toBe('Building Modern Real-Time Web Apps');

    // 2. Generate Variants
    const variants = await service.generateVariantsForPost(post.id, {
      platforms: ['x', 'linkedin'],
    });
    expect(variants).toHaveLength(2);

    const xVariant = variants.find((v) => v.platform === 'x');
    expect(xVariant.status).toBe(VARIANT_STATUS.DRAFT);
    expect(xVariant.validation_status).toBe(VALIDATION_STATUS.VALID);

    // 3. Verify Review Gating: Cannot schedule draft variant
    const scheduleTime = new Date(Date.now() + 60000).toISOString();
    await expect(service.scheduleVariant(xVariant.id, scheduleTime)).rejects.toThrow(
      /Only approved variants can be scheduled/
    );

    // 4. Approve Variant
    const approved = await service.approveVariant(xVariant.id);
    expect(approved.status).toBe(VARIANT_STATUS.APPROVED);

    // 5. Schedule Approved Variant
    const schedule = await service.scheduleVariant(xVariant.id, scheduleTime);
    expect(schedule.id).toBeDefined();
    expect(schedule.status).toBe(SCHEDULE_STATUS.QUEUED);

    // 6. Test Idempotency: Attempt duplicate scheduling at the same slot
    await expect(service.scheduleVariant(xVariant.id, scheduleTime)).rejects.toThrow(
      /A schedule slot already exists/
    );

    // 7. Execute Worker Job directly to simulate queue execution
    const mockJob = {
      id: `job_${schedule.id}`,
      data: {
        scheduleId: schedule.id,
        variantId: xVariant.id,
        platform: 'x',
        idempotencyKey: schedule.idempotency_key,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const workerResult = await worker.processJob(mockJob);
    expect(workerResult.success).toBe(true);

    // 8. Verify SQLite State & Audit Trail
    const updatedVariant = dbCtx.variants.findById(xVariant.id);
    expect(updatedVariant.status).toBe(VARIANT_STATUS.PUBLISHED);

    const updatedSchedule = dbCtx.schedules.findById(schedule.id);
    expect(updatedSchedule.status).toBe(SCHEDULE_STATUS.COMPLETED);

    const logs = dbCtx.publishLogs.findAll({ variantId: xVariant.id });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('success');
    expect(logs[0].external_post_id).toMatch(/^tw_/);

    // 9. Verify Worker Idempotency: Re-running worker on same job detects duplicate and skips
    const duplicateRun = await worker.processJob(mockJob);
    expect(duplicateRun.skipped || duplicateRun.duplicate).toBeTruthy();
    expect(dbCtx.publishLogs.findAll({ variantId: xVariant.id })).toHaveLength(1);
  });
});
