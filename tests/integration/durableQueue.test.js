import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { PublishWorker } from '../../src/queue/publishWorker.js';
import { ReconciliationService } from '../../src/queue/reconciliationService.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { VARIANT_STATUS, SCHEDULE_STATUS } from '../../src/config/constants.js';

describe('Durable Scheduling & Crash Recovery', () => {
  let dbCtx;
  let registry;
  let queue;
  let worker;
  let service;

  beforeEach(() => {
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

  it('should recover orphaned pending schedules on worker reboot', async () => {
    // 1. Create Post & Approved Variant
    const post = await service.ingestMarkdown({
      title: 'Durable Queue Resiliency',
      markdown: '# Durable Queue Resiliency\n\nHandling server reboots without dropping delayed tasks.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['linkedin'] });
    const variantId = variants[0].id;
    await service.approveVariant(variantId);

    // 2. Schedule in the future
    const futureTime = new Date(Date.now() + 3600000).toISOString();
    const schedule = await service.scheduleVariant(variantId, futureTime);

    // Simulate system crash: close current worker and queue
    await worker.close();
    await queue.close();

    // 3. Boot new queue, worker, and run reconciliation
    const newQueue = new PublishQueue();
    const newWorker = new PublishWorker({ dbCtx, publisherRegistry: registry });
    newWorker.start();

    const reconciler = new ReconciliationService({ dbCtx, publishQueue: newQueue });
    const reconResult = await reconciler.reconcile();

    expect(reconResult.totalChecked).toBe(1);
    expect(reconResult.recoveredCount).toBe(1);

    const recoveredSchedule = dbCtx.schedules.findById(schedule.id);
    expect(recoveredSchedule.status).toBe(SCHEDULE_STATUS.QUEUED);
    expect(recoveredSchedule.job_id).toBeDefined();

    await newWorker.close();
    await newQueue.close();
  });

  it('should prevent publishing if variant is rejected', async () => {
    const post = await service.ingestMarkdown({
      title: 'Moderation Test',
      markdown: '# Moderation Test\n\nContent to be rejected.',
    });
    const variants = await service.generateVariantsForPost(post.id, { platforms: ['x'] });
    const variantId = variants[0].id;

    // Reject the variant
    await service.rejectVariant(variantId, 'Does not match editorial guidelines');
    const rejectedVariant = dbCtx.variants.findById(variantId);
    expect(rejectedVariant.status).toBe(VARIANT_STATUS.REJECTED);
    expect(rejectedVariant.rejection_reason).toBe('Does not match editorial guidelines');

    // Attempting schedule or publish must fail
    await expect(service.scheduleVariant(variantId, new Date().toISOString())).rejects.toThrow(
      /Only approved variants can be scheduled/
    );
    await expect(service.publishNow(variantId)).rejects.toThrow(
      /Only approved variants can be published/
    );
  });
});
