import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { TelegramPublisher } from '../../src/publishers/telegramPublisher.js';
import { MockXPublisher } from '../../src/publishers/mockXPublisher.js';
import { MockLinkedInPublisher } from '../../src/publishers/mockLinkedInPublisher.js';

describe('Phase 5: SocialPublisher Adapter Architecture & Polymorphic Swapping', () => {
  let dbCtx;
  let queue;
  let registry;
  let service;
  let app;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry({
      telegram: { botToken: 'mock_token', chatId: '-100998877' },
      x: { latencyMs: 5 },
      linkedin: { latencyMs: 5 },
    });
    queue = new PublishQueue();
    service = new SocialStudioService({
      dbCtx,
      publishQueue: queue,
      publisherRegistry: registry,
    });
    app = createApp({ service, dbCtx, publishQueue: queue, publisherRegistry: registry });
  });

  afterEach(async () => {
    await queue.close();
    dbCtx.db.close();
    vi.restoreAllMocks();
  });

  it('1. should publish polymorphically across Telegram, MockX, and MockLinkedIn with standardized return structure', async () => {
    // Mock global fetch for TelegramBot API calls
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          message_id: 99482,
          chat: { id: -100998877, title: 'Test Channel' },
          date: 1772520000,
          text: '📢 Broadcast content',
        },
      }),
    });
    global.fetch = mockFetch;

    // Ingest source post
    const post = await service.ingestMarkdown({
      title: 'Polymorphic Adapter Campaign',
      markdown: '# Polymorphic Adapter Campaign\n\nOne campaign published uniformly across multiple social platforms.',
    });

    // Generate variants
    const variants = await service.generateVariantsForPost(post.id, {
      platforms: ['telegram', 'mock_x', 'mock_linkedin'],
    });
    expect(variants).toHaveLength(3);

    // Approve all variants
    for (const v of variants) {
      await service.approveVariant(v.id);
    }

    // Publish each variant polymorphically through service.publishNow
    for (const v of variants) {
      const pubRes = await service.publishNow(v.id);

      expect(pubRes.success).toBe(true);
      expect(pubRes.external_id).toBeDefined();
      expect(pubRes.published_at).toBeDefined();
      expect(pubRes.message).toBeDefined();

      // Check specific platform traits returned by adapters
      if (v.platform === 'telegram') {
        expect(pubRes.external_id).toBe('99482');
      } else if (v.platform === 'mock_x') {
        expect(pubRes.external_id).toMatch(/^tw_/);
        expect(pubRes.url).toContain('https://x.com/SocialStudioBot/status/');
        expect(pubRes.preview).toContain('[Twitter/X Preview]');
      } else if (v.platform === 'mock_linkedin') {
        expect(pubRes.external_id).toMatch(/^urn:li:share:/);
        expect(pubRes.url).toContain('https://www.linkedin.com/feed/update/');
        expect(pubRes.preview).toContain('[LinkedIn Professional Preview]');
      }
    }
  });

  it('2. should prove adapter swapping via registry without altering business logic', async () => {
    // Define a custom mock adapter dynamically
    class CustomEnterprisePublisher {
      constructor() {
        this.platform = 'custom_target';
      }
      async publish(variant, context) {
        return {
          success: true,
          external_id: 'custom_ent_12345',
          url: 'https://enterprise.network/post/custom_ent_12345',
          published_at: new Date().toISOString(),
          message: variant.content || variant.body,
          preview: `[Enterprise Network Preview]: ${variant.content || variant.body}`,
        };
      }
    }

    // Register custom adapter dynamically
    registry.register('custom_target', new CustomEnterprisePublisher());
    expect(registry.has('custom_target')).toBe(true);

    const customPub = registry.get('custom_target');
    const res = await customPub.publish({ content: 'Enterprise announcement' }, { variantId: 'v1' });

    expect(res.success).toBe(true);
    expect(res.external_id).toBe('custom_ent_12345');
    expect(res.preview).toContain('[Enterprise Network Preview]');
  });

  it('3. TelegramPublisher should require environment credentials and not have hardcoded values', async () => {
    // Instantiate with empty credentials
    const tgPublisher = new TelegramPublisher({ botToken: '', chatId: '' });
    const res = await tgPublisher.publish({ content: 'Test text' });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Telegram credentials missing: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  });
});
