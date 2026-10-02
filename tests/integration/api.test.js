import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';

describe('Social Media Studio REST API Endpoints', () => {
  let dbCtx;
  let registry;
  let queue;
  let service;
  let app;

  beforeEach(() => {
    dbCtx = createDatabaseContext(':memory:');
    registry = new PublisherRegistry({
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
  });

  it('GET /api/health should return healthy status and platform list', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.database).toBe('ok');
    expect(res.body.supportedPlatforms).toContain('telegram');
  });

  it('POST /api/posts/ingest/markdown should store post as SSOT', async () => {
    const res = await request(app)
      .post('/api/posts/ingest/markdown')
      .send({
        title: 'REST Architecture Best Practices',
        markdown: '# REST Architecture Best Practices\n\nDesigning robust APIs with hypermedia and consistent schemas.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe('REST Architecture Best Practices');
  });

  it('Complete API flow: Generate -> Edit -> Approve -> PublishNow -> Check Logs', async () => {
    // 1. Ingest
    const postRes = await request(app)
      .post('/api/posts/ingest/markdown')
      .send({
        markdown: '# Microservices Event Sourcing\n\nEvent sourcing decouples data state from business transaction histories.',
      });
    const postId = postRes.body.data.id;

    // 2. Generate Variants
    const genRes = await request(app)
      .post(`/api/posts/${postId}/generate-variants`)
      .send({ platforms: ['x', 'linkedin'] });
    expect(genRes.status).toBe(201);
    expect(genRes.body.data).toHaveLength(2);

    const variantId = genRes.body.data[0].id;

    // 3. Edit Variant
    const editRes = await request(app)
      .patch(`/api/variants/${variantId}`)
      .send({
        content: 'Excited to discuss Event Sourcing in microservices architecture! 💡',
        hashtags: ['#Architecture', '#Dev'],
        tone: 'punchy',
      });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.status).toBe('draft');

    // 4. Approve Variant
    const approveRes = await request(app)
      .post(`/api/variants/${variantId}/approve`)
      .send();
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    // 5. Immediate Publish
    const pubRes = await request(app)
      .post(`/api/variants/${variantId}/publish-now`)
      .send();
    expect(pubRes.status).toBe(200);
    expect(pubRes.body.data.success).toBe(true);
    expect(pubRes.body.data.externalPostId).toBeDefined();

    // 6. Query Publish Logs
    const logsRes = await request(app)
      .get(`/api/publish-logs?variantId=${variantId}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data).toHaveLength(1);
    expect(logsRes.body.data[0].status).toBe('success');
  });

  it('GET /api/profiles and PUT /api/profiles/:platform should manage constraints', async () => {
    const listRes = await request(app).get('/api/profiles');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(3);

    const putRes = await request(app)
      .put('/api/profiles/x')
      .send({ maxLength: 290 });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.max_length).toBe(290);
  });
});
