import { IngestionService } from '../ingestion/ingestionService.js';
import { VariantGenerator } from '../variants/variantGenerator.js';
import { ConstraintValidator } from '../variants/constraintValidator.js';
import { generateIdempotencyKey } from '../queue/idempotency.js';
import { VARIANT_STATUS, VALIDATION_STATUS, SCHEDULE_STATUS, PUBLISH_STATUS } from '../config/constants.js';

export class SocialStudioService {
  /**
   * @param {object} params
   * @param {object} params.dbCtx
   * @param {object} params.publishQueue
   * @param {object} params.publisherRegistry
   */
  constructor({ dbCtx, publishQueue, publisherRegistry }) {
    this.dbCtx = dbCtx;
    this.publishQueue = publishQueue;
    this.publisherRegistry = publisherRegistry;
    this.ingestionService = new IngestionService({ postsRepository: dbCtx.posts });
  }

  // --- 1. INGESTION ---

  async ingestMarkdown({ title, markdown, metadata }) {
    return this.ingestionService.ingestMarkdown({ title, markdown, metadata });
  }

  async ingestUrl({ url, options }) {
    return this.ingestionService.ingestUrl({ url, options });
  }

  getPost(id) {
    const post = this.dbCtx.posts.findById(id);
    if (!post) return null;
    const variants = this.dbCtx.variants.findByPostId(id);
    return { ...post, variants };
  }

  listPosts(query) {
    return this.dbCtx.posts.findAll(query);
  }

  // --- 2. VARIANT GENERATION & EDITING ---

  async generateVariantsForPost(postId, { platforms = ['telegram', 'x', 'linkedin'], tone } = {}) {
    const post = this.dbCtx.posts.findById(postId);
    if (!post) {
      throw new Error(`Post not found with ID: ${postId}`);
    }

    const allProfiles = this.dbCtx.profiles.findAll();
    const profilesMap = {};
    for (const p of allProfiles) {
      profilesMap[p.platform] = p;
    }

    const generated = VariantGenerator.generateForPlatforms(post, platforms, profilesMap, tone);
    const createdVariants = [];

    for (const item of generated) {
      const variant = this.dbCtx.variants.create({
        postId,
        platform: item.platform,
        content: item.content,
        hashtags: item.hashtags,
        tone: item.tone,
        status: VARIANT_STATUS.DRAFT,
        validationStatus: item.validation.validationStatus,
        validationErrors: item.validation.errors,
      });
      createdVariants.push(variant);
    }

    return createdVariants;
  }

  async createCustomVariant(postId, { platform, content, hashtags = [], tone }) {
    const post = this.dbCtx.posts.findById(postId);
    if (!post) {
      throw new Error(`Post not found with ID: ${postId}`);
    }

    const profile = this.dbCtx.profiles.findByPlatform(platform);
    if (!profile) {
      throw new Error(`Constraint profile not found for platform: ${platform}`);
    }

    const validation = ConstraintValidator.validate({
      content,
      hashtags,
      tone,
      profile,
    });

    return this.dbCtx.variants.create({
      postId,
      platform,
      content,
      hashtags,
      tone,
      status: VARIANT_STATUS.DRAFT,
      validationStatus: validation.validationStatus,
      validationErrors: validation.errors,
    });
  }

  async updateVariant(variantId, { content, hashtags, tone }) {
    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      throw new Error(`Variant not found with ID: ${variantId}`);
    }

    const newContent = content !== undefined ? content : variant.content;
    const newHashtags = hashtags !== undefined ? hashtags : variant.hashtags;
    const newTone = tone !== undefined ? tone : variant.tone;

    const profile = this.dbCtx.profiles.findByPlatform(variant.platform);
    const validation = ConstraintValidator.validate({
      content: newContent,
      hashtags: newHashtags,
      tone: newTone,
      profile,
    });

    return this.dbCtx.variants.updateContent(variantId, {
      content: newContent,
      hashtags: newHashtags,
      tone: newTone,
      validationStatus: validation.validationStatus,
      validationErrors: validation.errors,
    });
  }

  // --- 3. REVIEW WORKFLOW ---

  async approveVariant(variantId) {
    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      throw new Error(`Variant not found with ID: ${variantId}`);
    }

    if (variant.validation_status !== VALIDATION_STATUS.VALID) {
      throw new Error(
        `Cannot approve variant: validation status is '${variant.validation_status}'. Errors: ${JSON.stringify(
          variant.validation_errors
        )}`
      );
    }

    return this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.APPROVED, null);
  }

  async rejectVariant(variantId, reason) {
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('Rejection reason is required');
    }

    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      throw new Error(`Variant not found with ID: ${variantId}`);
    }

    return this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.REJECTED, reason.trim());
  }

  // --- 4. SCHEDULING & IDEMPOTENCY ---

  async scheduleVariant(variantId, scheduledTime) {
    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      throw new Error(`Variant not found with ID: ${variantId}`);
    }

    if (variant.status !== VARIANT_STATUS.APPROVED) {
      throw new Error(`Only approved variants can be scheduled (current status: '${variant.status}')`);
    }

    const idempotencyKey = generateIdempotencyKey(variantId, scheduledTime);

    // Check if slot already exists for same variant + slot
    const existingSchedule = this.dbCtx.schedules.findByIdempotencyKey(idempotencyKey);
    if (existingSchedule) {
      const err = new Error(`A schedule slot already exists for this variant at the specified time slot (idempotency key: ${idempotencyKey})`);
      err.code = 'DUPLICATE_SCHEDULE_SLOT';
      err.statusCode = 409;
      err.schedule = existingSchedule;
      throw err;
    }

    // Create schedule entry in SQLite
    const schedule = this.dbCtx.schedules.create({
      variantId,
      scheduledTime: new Date(scheduledTime).toISOString(),
      idempotencyKey,
    });

    // Enqueue BullMQ delayed job
    const job = await this.publishQueue.addPublishJob(
      {
        scheduleId: schedule.id,
        variantId,
        platform: variant.platform,
        idempotencyKey,
      },
      scheduledTime
    );

    this.dbCtx.schedules.updateStatus(schedule.id, SCHEDULE_STATUS.QUEUED, job.id);
    return this.dbCtx.schedules.findById(schedule.id);
  }

  async cancelSchedule(scheduleId) {
    const schedule = this.dbCtx.schedules.findById(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found with ID: ${scheduleId}`);
    }

    await this.publishQueue.removeJob(scheduleId);
    const cancelled = this.dbCtx.schedules.cancel(scheduleId);
    return this.dbCtx.schedules.findById(scheduleId);
  }

  // --- 5. IMMEDIATE PUBLISH (SYNCHRONOUS OR DIRECT) ---

  async publishNow(variantId) {
    const variant = this.dbCtx.variants.findById(variantId);
    if (!variant) {
      throw new Error(`Variant not found with ID: ${variantId}`);
    }

    if (variant.status !== VARIANT_STATUS.APPROVED && variant.status !== VARIANT_STATUS.PUBLISHED) {
      throw new Error(`Only approved variants can be published (current status: '${variant.status}')`);
    }

    const scheduledTime = new Date().toISOString();
    const idempotencyKey = generateIdempotencyKey(variantId, scheduledTime);

    const startTime = Date.now();
    const publisher = this.publisherRegistry.get(variant.platform);

    const publishPayload = {
      content: variant.content,
      hashtags: variant.hashtags,
      idempotencyKey,
      metadata: {
        variantId,
        platform: variant.platform,
        immediate: true,
      },
    };

    let result;
    try {
      result = await publisher.publish(publishPayload);
    } catch (err) {
      result = {
        success: false,
        externalPostId: null,
        error: err.message,
        durationMs: Date.now() - startTime,
      };
    }

    const logStatus = result.success ? PUBLISH_STATUS.SUCCESS : PUBLISH_STATUS.FAILURE;
    const logEntry = this.dbCtx.publishLogs.create({
      scheduleId: null,
      variantId,
      platform: variant.platform,
      idempotencyKey,
      attemptNumber: 1,
      status: logStatus,
      externalPostId: result.externalPostId || null,
      requestPayload: publishPayload,
      responsePayload: result.rawResponse || null,
      errorMessage: result.error || null,
      durationMs: result.durationMs || (Date.now() - startTime),
    });

    if (result.success) {
      this.dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);
    }

    return {
      success: result.success,
      variantId,
      platform: variant.platform,
      externalPostId: result.externalPostId,
      logEntry,
      error: result.error,
    };
  }

  // --- 6. AUDITING & PROFILES ---

  getPublishLogs(filters) {
    return this.dbCtx.publishLogs.findAll(filters);
  }

  listProfiles() {
    return this.dbCtx.profiles.findAll();
  }

  updateProfile(platform, updates) {
    return this.dbCtx.profiles.update(platform, updates);
  }
}
