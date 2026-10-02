import { describe, it, expect } from 'vitest';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { MockXPublisher } from '../../src/publishers/mockXPublisher.js';
import { MockLinkedInPublisher } from '../../src/publishers/mockLinkedInPublisher.js';
import { TelegramPublisher } from '../../src/publishers/telegramPublisher.js';

describe('Publishers Suite', () => {
  it('PublisherRegistry should manage adapters', () => {
    const registry = new PublisherRegistry();
    expect(registry.has('telegram')).toBe(true);
    expect(registry.has('x')).toBe(true);
    expect(registry.has('linkedin')).toBe(true);
    expect(registry.get('telegram')).toBeInstanceOf(TelegramPublisher);
  });

  it('MockXPublisher should publish and return mock tweet ID', async () => {
    const pub = new MockXPublisher({ latencyMs: 10 });
    const res = await pub.publish({
      content: 'Hello World from test!',
      hashtags: ['#Test'],
      idempotencyKey: 'key_1',
    });

    expect(res.success).toBe(true);
    expect(res.externalPostId).toMatch(/^tw_/);
    expect(res.rawResponse.data.id).toBe(res.externalPostId);
  });

  it('MockLinkedInPublisher should publish and return mock URN', async () => {
    const pub = new MockLinkedInPublisher({ latencyMs: 10 });
    const res = await pub.publish({
      content: 'Professional update from test!',
      hashtags: ['#Leadership'],
      idempotencyKey: 'key_2',
    });

    expect(res.success).toBe(true);
    expect(res.externalPostId).toMatch(/^urn:li:share:/);
  });

  it('TelegramPublisher should report missing credentials cleanly', async () => {
    const pub = new TelegramPublisher({ botToken: '', chatId: '' });
    const res = await pub.publish({
      content: 'Test msg',
      hashtags: [],
      idempotencyKey: 'key_3',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Telegram credentials missing');
  });
});
