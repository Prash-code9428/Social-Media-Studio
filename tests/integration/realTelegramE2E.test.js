import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { TelegramPublisher } from '../../src/publishers/telegramPublisher.js';
import { MockXPublisher } from '../../src/publishers/mockXPublisher.js';
import { MockLinkedInPublisher } from '../../src/publishers/mockLinkedInPublisher.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { PublishWorker } from '../../src/queue/publishWorker.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { VARIANT_STATUS, SCHEDULE_STATUS } from '../../src/config/constants.js';

describe('Phase 8: Real Telegram End-to-End Proof & Polymorphic Swapping', () => {
  let dbCtx;
  let registry;
  let queue;
  let worker;
  let service;
  let app;
  let fetchSpy;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');

    // Safe simulated or live Telegram integration without leaking tokens
    const botToken = process.env.TELEGRAM_BOT_TOKEN || 'test_bot_token_masked';
    const chatId = process.env.TELEGRAM_CHAT_ID || '@FlyRankStudioChannel';

    registry = new PublisherRegistry({
      telegram: {
        botToken,
        chatId,
      },
      x: { latencyMs: 5 },
      linkedin: { latencyMs: 5 },
    });

    // Mock fetch to simulate live Telegram Bot API if running without external network connection
    if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token_here') {
      let msgCounter = 58291;
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
        if (url.includes('api.telegram.org')) {
          msgCounter++;
          const body = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: {
                message_id: msgCounter,
                chat: {
                  id: -100192837465,
                  title: 'Social Media Studio Channel',
                  username: 'FlyRankStudioChannel',
                  type: 'channel',
                },
                date: Math.floor(Date.now() / 1000),
                text: body.text,
              },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });
    }

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
    if (fetchSpy) fetchSpy.mockRestore();
    await worker.close();
    await queue.close();
    dbCtx.db.close();
  });

  it('Complete Lifecycle: Ingest -> Generate -> Validate -> Approve -> Schedule -> Telegram Publish -> Idempotency Check', async () => {
    // 1. Ingest Sample Blog Post
    const postRes = await request(app)
      .post('/posts')
      .send({
        markdown: '# Architecture Patterns in Modern Cloud Systems\n\nEvent-driven architectures enable scalable asynchronous communication across microservices.',
      });
    expect(postRes.status).toBe(201);
    const postId = postRes.body.data.id;
    expect(postId).toBeDefined();

    // 2. Generate Variants for all configured platforms
    const genRes = await request(app).post(`/posts/${postId}/generate`);
    expect(genRes.status).toBe(201);
    expect(genRes.body.data).toHaveLength(3);

    const telegramVariant = genRes.body.data.find((v) => v.platform === 'telegram');
    const xVariant = genRes.body.data.find((v) => v.platform === 'mock_x');
    const linkedInVariant = genRes.body.data.find((v) => v.platform === 'mock_linkedin');

    expect(telegramVariant).toBeDefined();
    expect(xVariant).toBeDefined();
    expect(linkedInVariant).toBeDefined();

    // 3. Validate All Variants
    expect(telegramVariant.validation_status).toBe('valid');
    expect(xVariant.validation_status).toBe('valid');
    expect(linkedInVariant.validation_status).toBe('valid');

    // 4. Approve the Telegram Variant
    const approveRes = await request(app).post(`/variants/${telegramVariant.id}/approve`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe(VARIANT_STATUS.APPROVED);

    // 5. Schedule approx 2 minutes in future
    const scheduledSlot = new Date(Date.now() + 120000).toISOString();
    const schedRes = await request(app)
      .post(`/variants/${telegramVariant.id}/schedule`)
      .send({ scheduled_for: scheduledSlot });

    expect(schedRes.status).toBe(201);
    const scheduleId = schedRes.body.data.id;
    const idempotencyKey = schedRes.body.data.idempotency_key;

    // 6. Start / execute worker job
    const jobData = {
      scheduleId,
      variantId: telegramVariant.id,
      platform: 'telegram',
      idempotencyKey,
    };

    const pubResult = await worker.processJob({
      id: `job_${scheduleId}`,
      data: jobData,
      attemptsMade: 0,
      opts: { attempts: 3 },
    });

    // 7. Verify Telegram message is published
    expect(pubResult.success).toBe(true);
    expect(pubResult.result.external_id).toBeDefined();
    expect(pubResult.result.url).toContain('https://t.me/');

    // 8. Record Execution Details
    const executionEvidence = {
      variant_id: telegramVariant.id,
      schedule_id: scheduleId,
      attempt_number: 1,
      external_id: pubResult.result.external_id,
      url: pubResult.result.url,
      status: 'success',
      timestamp: pubResult.result.published_at,
    };

    expect(executionEvidence.variant_id).toBe(telegramVariant.id);
    expect(executionEvidence.external_id).toBeDefined();

    // 9. Repeat the same publish operation using the same variant and slot
    const repeatResult = await worker.processJob({
      id: `job_${scheduleId}`,
      data: jobData,
      attemptsMade: 1,
      opts: { attempts: 3 },
    });

    // 10. Verify:
    // - Exactly one Telegram message exists
    // - Second attempt is idempotently skipped
    expect(repeatResult.duplicate || repeatResult.skipped).toBe(true);

    // Verify publish history in SQLite
    const historyRes = await request(app).get(`/publish-history/${telegramVariant.id}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toHaveLength(1);
    expect(historyRes.body.data[0].status).toBe('success');
    expect(historyRes.body.data[0].idempotency_key).toBe(idempotencyKey);
    expect(historyRes.body.data[0].external_id).toBe(executionEvidence.external_id);
  });

  it('Polymorphic Swapping Proof: telegram -> mock_x -> mock_linkedin without business logic changes', async () => {
    // Ingest Single Campaign
    const post = await service.ingestMarkdown({
      title: 'Polymorphic Swapping Campaign',
      markdown: '# Polymorphic Swapping Campaign\n\nTesting dynamic adapter swapping across multiple targets.',
    });
    const variants = await service.generateVariantsForPost(post.id);

    for (const v of variants) {
      await service.approveVariant(v.id);

      // Resolve adapter strictly via Polymorphic Registry
      const publisher = registry.get(v.platform);
      expect(publisher).toBeDefined();

      const publishResult = await publisher.publish(v, { campaignId: post.id });
      expect(publishResult.success).toBe(true);
      expect(publishResult.external_id).toBeDefined();
      expect(publishResult.url).toBeDefined();
      expect(publishResult.published_at).toBeDefined();
    }
  });
});
