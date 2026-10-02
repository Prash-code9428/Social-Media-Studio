import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { ConstraintValidator } from '../../src/variants/constraintValidator.js';
import { VARIANT_STATUS, VALIDATION_STATUS } from '../../src/config/constants.js';

describe('Phase 3: Variant Generation and Constraint Enforcement', () => {
  let dbCtx;
  let queue;
  let registry;
  let service;
  let app;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry();
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
  });

  it('1. should generate valid variants for all configured platforms (Telegram, MockX, MockLinkedIn)', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({
        markdown: '# High-Performance Node.js Services\n\nOptimizing event loops, garbage collection, and clustering in production.',
      });
    const postId = postRes.body.data.id;

    const genRes = await request(app)
      .post(`/posts/${postId}/generate`)
      .send();

    expect(genRes.status).toBe(201);
    expect(genRes.body.success).toBe(true);
    expect(genRes.body.data).toHaveLength(3);

    const platforms = genRes.body.data.map((v) => v.platform);
    expect(platforms).toContain('telegram');
    expect(platforms).toContain('mock_x');
    expect(platforms).toContain('mock_linkedin');

    // Verify properties on each generated variant
    for (const v of genRes.body.data) {
      expect(v.id).toBeDefined();
      expect(v.post_id).toBe(postId);
      expect(v.platform).toBeDefined();
      expect(v.body).toBeDefined();
      expect(v.status).toBe(VARIANT_STATUS.DRAFT);
      expect(v.validation_status).toBe(VALIDATION_STATUS.VALID);
      expect(v.created_at).toBeDefined();
      expect(v.updated_at).toBeDefined();
    }
  });

  it('2. should enforce maximum length rule and return exact 4xx error message on violation', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Length Test\nShort content.' });
    const postId = postRes.body.data.id;

    // Attempt to create a 300 char variant for mock_x (max limit: 280)
    const longContent = 'A'.repeat(290);
    const res = await request(app)
      .post(`/posts/${postId}/variants`)
      .send({
        platform: 'mock_x',
        content: longContent,
        hashtags: ['#Tech', '#Dev'], // adds ~12 chars -> 302 chars total
        tone: 'punchy',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Variant exceeds maximum length for mock_x: \d+ > 280/);
  });

  it('3. should enforce hashtag count limit and return exact 4xx error message on violation', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Hashtag Test\nShort content.' });
    const postId = postRes.body.data.id;

    // Attempt to create variant with 6 hashtags for mock_linkedin (max limit: 5)
    const res = await request(app)
      .post(`/posts/${postId}/variants`)
      .send({
        platform: 'mock_linkedin',
        content: 'Valid content for LinkedIn discussion.',
        hashtags: ['#One', '#Two', '#Three', '#Four', '#Five', '#Six'],
        tone: 'professional',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Variant exceeds hashtag limit for mock_linkedin: 6 > 5');
  });

  it('4. should enforce allowed tone rule and return exact 4xx error message on violation', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Tone Test\nShort content.' });
    const postId = postRes.body.data.id;

    const res = await request(app)
      .post(`/posts/${postId}/variants`)
      .send({
        platform: 'mock_x',
        content: 'Valid length tweet content.',
        hashtags: ['#Tech'],
        tone: 'invalid_unallowed_tone',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Variant has invalid tone 'invalid_unallowed_tone' for mock_x");
  });

  it('5. should support targeted subset of multiple platforms generation', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Multi-Platform Target\nTargeting only Telegram and LinkedIn.' });
    const postId = postRes.body.data.id;

    const genRes = await request(app)
      .post(`/posts/${postId}/generate`)
      .send({ platforms: ['telegram', 'mock_linkedin'] });

    expect(genRes.status).toBe(201);
    expect(genRes.body.data).toHaveLength(2);
    const platforms = genRes.body.data.map((v) => v.platform);
    expect(platforms).toEqual(['telegram', 'mock_linkedin']);
  });

  it('6. should support regeneration for existing post', async () => {
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Regeneration Test\nContent to be regenerated.' });
    const postId = postRes.body.data.id;

    // Initial generation
    const gen1 = await request(app).post(`/posts/${postId}/generate`).send();
    expect(gen1.body.data).toHaveLength(3);

    // Regenerate with different tone and regenerate=true
    const gen2 = await request(app)
      .post(`/posts/${postId}/generate`)
      .send({ tone: 'urgent', regenerate: true });

    expect(gen2.status).toBe(201);
    expect(gen2.body.data).toHaveLength(3);
    for (const v of gen2.body.data) {
      expect(v.tone).toBe('urgent');
    }

    // Check DB: old variants were replaced
    const postDetails = await request(app).get(`/posts/${postId}`);
    expect(postDetails.body.data.variants).toHaveLength(3);
  });

  it('7. EVIDENCE: A variant that fails validation MUST NOT enter the review workflow (blocked before approval)', async () => {
    // Directly seed an invalid variant into SQLite to test review gating
    const postRes = await request(app)
      .post('/posts')
      .send({ markdown: '# Gating Test\nContent for testing review gating.' });
    const postId = postRes.body.data.id;

    // Manually create invalid variant in DB (e.g. over length)
    const invalidVariant = dbCtx.variants.create({
      postId,
      platform: 'mock_x',
      content: 'B'.repeat(350), // exceeds 280
      hashtags: ['#Test'],
      tone: 'punchy',
      status: VARIANT_STATUS.DRAFT,
      validationStatus: VALIDATION_STATUS.INVALID,
      validationErrors: [
        {
          rule: 'MAX_LENGTH_EXCEEDED',
          message: 'Variant exceeds maximum length for mock_x: 358 > 280',
        },
      ],
    });

    expect(invalidVariant.validation_status).toBe(VALIDATION_STATUS.INVALID);

    // Attempt to approve the invalid variant -> MUST BE BLOCKED
    const approveRes = await request(app)
      .post(`/variants/${invalidVariant.id}/approve`)
      .send();

    expect(approveRes.status).toBe(400);
    expect(approveRes.body.success).toBe(false);
    expect(approveRes.body.error.message).toContain('Cannot approve variant: Variant exceeds maximum length for mock_x: 358 > 280');

    // Confirm in DB that status is STILL draft and NOT approved
    const variantInDb = dbCtx.variants.findById(invalidVariant.id);
    expect(variantInDb.status).toBe(VARIANT_STATUS.DRAFT);
  });
});
