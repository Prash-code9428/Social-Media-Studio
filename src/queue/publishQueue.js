import { Queue } from 'bullmq';
import { QUEUE_NAME } from '../config/constants.js';
import { getRedisConnection } from './redisClient.js';
import RedisMock from 'ioredis-mock';

/**
 * In-memory fallback queue for development/testing without real Redis.
 */
class InMemoryQueue {
  constructor() {
    this.jobs = new Map();
    this.timers = new Map();
    this.handlers = [];
  }

  async add(name, data, opts = {}) {
    const jobId = opts.jobId || `job_${Date.now()}_${Math.random()}`;
    const delay = opts.delay || 0;

    const job = {
      id: jobId,
      name,
      data,
      opts,
      attemptsMade: 0,
      timestamp: Date.now(),
    };

    this.jobs.set(jobId, job);

    if (delay > 0) {
      const timer = setTimeout(async () => {
        this.timers.delete(jobId);
        await this._dispatch(job);
      }, delay);
      this.timers.set(jobId, timer);
    } else {
      // Immediate dispatch on next tick
      setImmediate(async () => {
        await this._dispatch(job);
      });
    }

    return job;
  }

  async _dispatch(job) {
    for (const handler of this.handlers) {
      try {
        await handler(job);
      } catch (err) {
        console.error(`[InMemoryQueue] Handler error for job ${job.id}:`, err.message);
      }
    }
  }

  onProcess(handler) {
    this.handlers.push(handler);
  }

  async getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  async removeJob(jobId) {
    if (this.timers.has(jobId)) {
      clearTimeout(this.timers.get(jobId));
      this.timers.delete(jobId);
    }
    return this.jobs.delete(jobId);
  }

  async close() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.jobs.clear();
    this.handlers = [];
  }
}

// Global in-memory queue instance for mock mode
let sharedInMemoryQueue = null;

export function getSharedInMemoryQueue() {
  if (!sharedInMemoryQueue) {
    sharedInMemoryQueue = new InMemoryQueue();
  }
  return sharedInMemoryQueue;
}

export class PublishQueue {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    const connection = options.connection || getRedisConnection();
    this.isMock = options.isMock !== undefined ? options.isMock : (connection instanceof RedisMock);

    if (this.isMock) {
      this.mockQueue = getSharedInMemoryQueue();
    } else {
      this.bullQueue = new Queue(QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        },
      });
    }
  }

  /**
   * Add a scheduled publication job.
   * @param {object} jobData
   * @param {string} jobData.scheduleId
   * @param {string} jobData.variantId
   * @param {string} jobData.platform
   * @param {string} jobData.idempotencyKey
   * @param {string|Date} scheduledTime
   */
  async addPublishJob(jobData, scheduledTime) {
    const targetTimeMs = new Date(scheduledTime).getTime();
    const now = Date.now();
    const delay = Math.max(0, targetTimeMs - now);
    const jobId = `job_${jobData.scheduleId}`;

    if (this.isMock) {
      return this.mockQueue.add('publish-social-variant', jobData, {
        jobId,
        delay,
        attempts: 3,
      });
    }

    return this.bullQueue.add('publish-social-variant', jobData, {
      jobId,
      delay,
    });
  }

  /**
   * Remove a job from the queue if not yet processed.
   * @param {string} scheduleId
   */
  async removeJob(scheduleId) {
    const jobId = `job_${scheduleId}`;
    if (this.isMock) {
      return this.mockQueue.removeJob(jobId);
    }
    const job = await this.bullQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  }

  async close() {
    if (this.isMock) {
      await this.mockQueue.close();
    } else if (this.bullQueue) {
      await this.bullQueue.close();
    }
  }
}
