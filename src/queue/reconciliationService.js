import { SCHEDULE_STATUS } from '../config/constants.js';

export class ReconciliationService {
  /**
   * @param {object} params
   * @param {object} params.dbCtx
   * @param {object} params.publishQueue
   */
  constructor({ dbCtx, publishQueue }) {
    this.dbCtx = dbCtx;
    this.publishQueue = publishQueue;
  }

  /**
   * Reconcile pending database schedules with BullMQ on system startup.
   */
  async reconcile() {
    const pendingSchedules = this.dbCtx.schedules.findPendingForReconciliation();
    let recoveredCount = 0;

    for (const schedule of pendingSchedules) {
      // Check if already published in logs
      const successLog = this.dbCtx.publishLogs.findSuccessByIdempotencyKey(schedule.idempotency_key);
      if (successLog) {
        this.dbCtx.schedules.updateStatus(schedule.id, SCHEDULE_STATUS.COMPLETED);
        this.dbCtx.variants.updateStatus(schedule.variant_id, 'published');
        continue;
      }

      // If it was stuck in 'processing' during crash, reset to 'queued'
      if (schedule.status === SCHEDULE_STATUS.PROCESSING) {
        this.dbCtx.schedules.updateStatus(schedule.id, SCHEDULE_STATUS.QUEUED);
      }

      const variant = this.dbCtx.variants.findById(schedule.variant_id);
      if (!variant) continue;

      const jobData = {
        scheduleId: schedule.id,
        variantId: schedule.variant_id,
        platform: variant.platform,
        idempotencyKey: schedule.idempotency_key,
      };

      // Add back to BullMQ queue
      const job = await this.publishQueue.addPublishJob(jobData, schedule.scheduled_time);
      this.dbCtx.schedules.updateStatus(schedule.id, SCHEDULE_STATUS.QUEUED, job.id);
      recoveredCount++;
    }

    return { totalChecked: pendingSchedules.length, recoveredCount };
  }
}
