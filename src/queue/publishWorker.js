import { Worker } from 'bullmq';
import { QUEUE_NAME, SCHEDULE_STATUS, PUBLISH_STATUS, VARIANT_STATUS } from '../config/constants.js';
import { getRedisConnection } from './redisClient.js';
import { getSharedInMemoryQueue } from './publishQueue.js';
import RedisMock from 'ioredis-mock';

export class PublishWorker {
  /**
   * @param {object} params
   * @param {object} params.dbCtx - Database context containing repositories
   * @param {object} params.publisherRegistry - PublisherRegistry instance
   * @param {object} [params.options]
   */
  constructor({ dbCtx, publisherRegistry, options = {} }) {
    this.dbCtx = dbCtx;
    this.publisherRegistry = publisherRegistry;
    this.connection = options.connection || getRedisConnection();
    this.isMock = options.isMock !== undefined ? options.isMock : (this.connection instanceof RedisMock);
    this.worker = null;
    this.mockQueue = null;
  }

  start() {
    if (this.isMock) {
      this.mockQueue = getSharedInMemoryQueue();
      this.mockQueue.onProcess(async (job) => {
        try {
          await this.processJob(job);
        } catch (err) {
          console.error(`[MockWorker] Error processing job ${job.id}:`, err.message);
        }
      });
      return this;
    }

    if (this.worker) return this.worker;

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        return this.processJob(job);
      },
      {
        connection: this.connection,
        concurrency: 5,
      }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
    });

    return this.worker;
  }

  /**
   * Process a single publishing job with idempotency and audit logging.
   * @param {object} job - Job instance
   */
  async processJob(job) {
    const { scheduleId, variantId, platform, idempotencyKey } = job.data;
    const startTime = Date.now();

    // 1. Verify schedule existence
    const schedule = this.dbCtx.schedules.findById(scheduleId);
    if (!schedule) {
      console.warn(`[Worker] Schedule ${scheduleId} not found, skipping.`);
      return { skipped: true, reason: 'schedule_not_found' };
    }

    if (schedule.status === SCHEDULE_STATUS.COMPLETED || schedule.status === SCHEDULE_STATUS.CANCELLED) {
      console.warn(`[Worker] Schedule ${scheduleId} is already ${schedule.status}, skipping.`);
      return { skipped: true, reason: `already_${schedule.status}` };
    }

    // 2. Pre-execution Idempotency Check
    const existingLog = this.dbCtx.publishLogs.findSuccessByIdempotencyKey(idempotencyKey);
    if (existingLog) {
      console.info(`[Worker] Idempotency match found for key ${idempotencyKey}. Skipping duplicate publish.`);
      this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.COMPLETED);
      this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);
      return { duplicate: true, existingLog };
    }

    // 3. Atomic claim for processing
    const claimed = this.dbCtx.schedules.claimForProcessing(scheduleId);
    if (!claimed) {
      console.warn(`[Worker] Could not claim schedule ${scheduleId} for processing (already claimed or processed), skipping.`);
      return { skipped: true, duplicate: true, reason: 'lock_failed' };
    }

    // 4. Retrieve variant details
    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.FAILED);
      throw new Error(`Variant ${variantId} not found`);
    }

    if (variant.status !== VARIANT_STATUS.APPROVED && variant.status !== VARIANT_STATUS.PUBLISHED) {
      this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.FAILED);
      throw new Error(`Variant ${variantId} status is '${variant.status}' (must be 'approved' to publish)`);
    }

    // 5. Invoke Platform Publisher Adapter Polymorphically
    const publisher = this.publisherRegistry.get(platform || variant.platform);
    const context = {
      scheduleId,
      variantId,
      platform: variant.platform,
      idempotencyKey,
    };

    let result;
    try {
      result = await publisher.publish(variant, context);
    } catch (err) {
      result = {
        success: false,
        external_id: null,
        url: null,
        published_at: new Date().toISOString(),
        message: variant.content || variant.body || '',
        error: err.message,
        duration_ms: Date.now() - startTime,
      };
    }

    const externalId = result.external_id || result.externalPostId || null;

    // 6. Record Audit Log in SQLite (SSOT)
    const logStatus = result.success ? PUBLISH_STATUS.SUCCESS : PUBLISH_STATUS.FAILURE;
    let logEntry;
    try {
      logEntry = this.dbCtx.publishLogs.create({
        scheduleId,
        variantId,
        platform: variant.platform,
        idempotencyKey,
        attemptNumber: (job.attemptsMade || 0) + 1,
        status: logStatus,
        externalPostId: externalId,
        requestPayload: { variant, context },
        responsePayload: result.raw_response || result.rawResponse || result,
        errorMessage: result.error || null,
        durationMs: result.duration_ms || result.durationMs || (Date.now() - startTime),
      });
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
        console.info(`[Worker] Database UNIQUE constraint prevented duplicate success for idempotency key ${idempotencyKey}.`);
        const existing = this.dbCtx.publishLogs.findSuccessByIdempotencyKey(idempotencyKey);
        this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.COMPLETED);
        this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);
        return { duplicate: true, skipped: true, reason: 'db_unique_constraint_enforced', existingLog: existing };
      }
      throw dbErr;
    }

    // 7. Update Schedule & Variant States
    if (result.success) {
      this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.COMPLETED);
      this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);
      return { success: true, logEntry, result };
    } else {
      if ((job.attemptsMade || 0) + 1 >= (job.opts?.attempts || 3)) {
        this.dbCtx.schedules.updateStatus(scheduleId, SCHEDULE_STATUS.FAILED);
      }
      throw new Error(result.error || 'Publication failed');
    }
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}
