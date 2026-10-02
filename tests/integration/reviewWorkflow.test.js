import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { VARIANT_STATUS } from '../../src/config/constants.js';

describe('Phase 4: Human Review Workflow & State Machine Gating', () => {
  let dbCtx;
  let queue;
  let registry;
  let service;
  let app;
  let postId;
  let variantId;

  beforeEach(async () => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry();
    queue = new PublishQueue();
    service = new SocialStudioService({
      dbCtx,
      publishQueue: queue,
      publisherRegistry: registry,
    });
    app = createApp({ service, dbCtx, publishQueue: queue, publisherRegistry: registry });

    // Seed initial post and variant
    const postRes = await request(app)
      .post('/posts')
      .send({
        markdown: '# Review Workflow Spec\n\nTesting state machine transitions and gating.',
      });
    postId = postRes.body.data.id;

    const genRes = await request(app)
      .post(`/posts/${postId}/generate`)
      .send({ platforms: ['mock_x'] });
    variantId = genRes.body.data[0].id;
  });

  afterEach(async () => {
    await queue.close();
    dbCtx.db.close();
  });

  it('A. draft -> schedule MUST BE REJECTED (400 Bad Request)', async () => {
    const scheduleTime = new Date(Date.now() + 3600000).toISOString();

    const res = await request(app)
      .post(`/variants/${variantId}/schedule`)
      .send({ scheduled_time: scheduleTime });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe(
      "Cannot schedule variant in 'draft' status. Only approved variants can be scheduled."
    );
  });

  it('B. rejected -> schedule MUST BE REJECTED (400 Bad Request)', async () => {
    // 1. Reject variant
    const rejRes = await request(app)
      .post(`/variants/${variantId}/reject`)
      .send({ reason: 'Needs punchier hook for social campaign' });
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.data.status).toBe(VARIANT_STATUS.REJECTED);
    expect(rejRes.body.data.rejection_reason).toBe('Needs punchier hook for social campaign');

    // 2. Attempt schedule
    const scheduleTime = new Date(Date.now() + 3600000).toISOString();
    const res = await request(app)
      .post(`/variants/${variantId}/schedule`)
      .send({ scheduled_time: scheduleTime });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe(
      "Cannot schedule variant in 'rejected' status. Only approved variants can be scheduled."
    );
  });

  it('C. approved -> schedule MUST BE ACCEPTED (201 Created)', async () => {
    // 1. Approve variant
    const appRes = await request(app)
      .post(`/variants/${variantId}/approve`)
      .send();
    expect(appRes.status).toBe(200);
    expect(appRes.body.data.status).toBe(VARIANT_STATUS.APPROVED);

    // 2. Schedule variant
    const scheduleTime = new Date(Date.now() + 3600000).toISOString();
    const res = await request(app)
      .post(`/variants/${variantId}/schedule`)
      .send({ scheduled_time: scheduleTime });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.variant_id).toBe(variantId);
    expect(res.body.data.status).toBe('queued');
  });

  it('D. approved -> edit works and resets status back to draft for re-review', async () => {
    // 1. Approve variant
    await request(app).post(`/variants/${variantId}/approve`).send();
    let variant = dbCtx.variants.findById(variantId);
    expect(variant.status).toBe(VARIANT_STATUS.APPROVED);

    // 2. Edit approved variant
    const editRes = await request(app)
      .patch(`/variants/${variantId}`)
      .send({
        body: 'Updated punchy hook for Twitter/X audience! 🚀',
        hashtags: ['#Tech', '#NodeJS'],
        tone: 'punchy',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);
    expect(editRes.body.data.status).toBe(VARIANT_STATUS.DRAFT);
    expect(editRes.body.data.body).toBe('Updated punchy hook for Twitter/X audience! 🚀');

    // 3. Confirm in database
    variant = dbCtx.variants.findById(variantId);
    expect(variant.status).toBe(VARIANT_STATUS.DRAFT);
  });

  it('E. published -> edit MUST BE REJECTED (400 Bad Request)', async () => {
    // 1. Mark variant as published
    dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);

    // 2. Attempt to edit published variant
    const res = await request(app)
      .patch(`/variants/${variantId}`)
      .send({ body: 'Trying to mutate published post' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe(`Cannot edit published variant with ID: ${variantId}`);
  });

  it('F. published -> approve MUST BE REJECTED (400 Bad Request)', async () => {
    // 1. Mark variant as published
    dbCtx.variants.updateStatus(variantId, VARIANT_STATUS.PUBLISHED);

    // 2. Attempt to re-approve
    const res = await request(app)
      .post(`/variants/${variantId}/approve`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe(`Cannot re-approve already published variant with ID: ${variantId}`);
  });

  it('G. GET /variants and GET /variants/:id should query variants properly', async () => {
    // Query all variants
    const listRes = await request(app).get('/variants');
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    // Query single variant
    const singleRes = await request(app).get(`/variants/${variantId}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.success).toBe(true);
    expect(singleRes.body.data.id).toBe(variantId);

    // Query non-existent variant returns 404
    const notFoundRes = await request(app).get('/variants/unknown-uuid-0000');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.success).toBe(false);
  });
});
