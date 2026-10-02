import { describe, it, expect } from 'vitest';
import { VariantGenerator } from '../../src/variants/variantGenerator.js';
import { PLATFORMS, DEFAULT_PROFILES } from '../../src/config/constants.js';

describe('VariantGenerator', () => {
  const profilesMap = {};
  for (const p of DEFAULT_PROFILES) {
    profilesMap[p.platform] = {
      ...p,
      allowed_tones: JSON.parse(p.allowed_tones_json),
    };
  }

  const post = {
    id: 'post_123',
    title: 'Mastering Background Workers in Node.js',
    summary: 'A deep dive into asynchronous queues, worker scaling, and idempotency guarantees.',
    raw_content: 'Full article text detailing architecture, BullMQ, Redis, and error handling.',
    source_url: 'https://example.com/workers',
  };

  it('should generate valid variants for Telegram, X, and LinkedIn', () => {
    const variants = VariantGenerator.generateForPlatforms(
      post,
      [PLATFORMS.TELEGRAM, PLATFORMS.X, PLATFORMS.LINKEDIN],
      profilesMap
    );

    expect(variants).toHaveLength(3);

    const tg = variants.find((v) => v.platform === PLATFORMS.TELEGRAM);
    const x = variants.find((v) => v.platform === PLATFORMS.X);
    const li = variants.find((v) => v.platform === PLATFORMS.LINKEDIN);

    expect(tg.content).toContain('Mastering Background Workers');
    expect(tg.validation.isValid).toBe(true);

    expect(x.content.length).toBeLessThanOrEqual(280);
    expect(x.validation.isValid).toBe(true);

    expect(li.content).toContain('Key Takeaways');
    expect(li.validation.isValid).toBe(true);
  });
});
