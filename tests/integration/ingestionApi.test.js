import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createDatabaseContext } from '../../src/db/index.js';
import { PublisherRegistry } from '../../src/publishers/publisherRegistry.js';
import { PublishQueue } from '../../src/queue/publishQueue.js';
import { SocialStudioService } from '../../src/services/socialStudioService.js';
import { createApp } from '../../src/api/app.js';
import { UrlIngester } from '../../src/ingestion/urlIngester.js';

describe('Phase 2: Post Ingestion API', () => {
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
    vi.restoreAllMocks();
  });

  it('1. should ingest blog post from Markdown directly', async () => {
    const markdownInput = `# Architecture Patterns in Modern Cloud

Modern architectures rely on event-driven decoupling and resilient asynchronous workers.

We use SQLite for fast local state and message queues for distribution.`;

    const res = await request(app)
      .post('/posts')
      .send({ markdown: markdownInput });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const post = res.body.data;
    expect(post.id).toBeDefined();
    expect(post.title).toBe('Architecture Patterns in Modern Cloud');
    expect(post.source_type).toBe('markdown');
    expect(post.source_url).toBeNull();
    expect(post.content).toContain('Modern architectures rely on event-driven decoupling');
    expect(post.created_at).toBeDefined();
    expect(post.updated_at).toBeDefined();

    // Verify stored directly in SQLite as SSOT
    const dbPost = dbCtx.posts.findById(post.id);
    expect(dbPost).not.toBeNull();
    expect(dbPost.title).toBe('Architecture Patterns in Modern Cloud');
    expect(dbPost.source_type).toBe('markdown');
  });

  it('2. should ingest blog post from URL using HTML extraction', async () => {
    // Mock UrlIngester.fetchAndParse so test does not rely on external network
    vi.spyOn(UrlIngester, 'fetchAndParse').mockResolvedValueOnce({
      title: 'Scraped Article on Distributed Systems',
      content: 'This is the main article content extracted via Cheerio parsing logic from the target website.',
      summary: 'This is the main article content extracted via Cheerio...',
      sourceUrl: 'https://example.com/blog/distributed-systems',
      metadata: {
        author: 'Alice Engineer',
        wordCount: 15,
        readingTimeMinutes: 1,
        sourceType: 'url',
      },
    });

    const res = await request(app)
      .post('/posts')
      .send({ url: 'https://example.com/blog/distributed-systems' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const post = res.body.data;
    expect(post.id).toBeDefined();
    expect(post.title).toBe('Scraped Article on Distributed Systems');
    expect(post.source_type).toBe('url');
    expect(post.source_url).toBe('https://example.com/blog/distributed-systems');
    expect(post.content).toContain('main article content extracted via Cheerio');
    expect(post.created_at).toBeDefined();
    expect(post.updated_at).toBeDefined();

    // Verify stored in SQLite as SSOT
    const dbPost = dbCtx.posts.findById(post.id);
    expect(dbPost).not.toBeNull();
    expect(dbPost.source_type).toBe('url');
    expect(dbPost.source_url).toBe('https://example.com/blog/distributed-systems');
  });

  it('3. should reject missing input (neither markdown nor url)', async () => {
    const res = await request(app)
      .post('/posts')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Validation failed');
    expect(
      res.body.error.details.some((d) =>
        d.message.includes('Exactly one input source is required')
      )
    ).toBe(true);
  });

  it('4. should reject when BOTH markdown and url are supplied', async () => {
    const res = await request(app)
      .post('/posts')
      .send({
        markdown: '# Some Title\nSome content.',
        url: 'https://example.com/post',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(
      res.body.error.details.some((d) =>
        d.message.includes('Cannot provide both')
      )
    ).toBe(true);
  });

  it('5. should reject malformed URL', async () => {
    const res = await request(app)
      .post('/posts')
      .send({ url: 'not-a-valid-url' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(
      res.body.error.details.some(
        (d) => d.message.includes('Invalid URL') || d.message.includes('URL')
      )
    ).toBe(true);
  });

  it('6. should retrieve list of posts and single post by ID (SSOT verification)', async () => {
    // Ingest 2 posts
    const p1 = await service.ingestMarkdown({
      title: 'First Post',
      markdown: '# First Post\nContent of first post.',
    });
    const p2 = await service.ingestMarkdown({
      title: 'Second Post',
      markdown: '# Second Post\nContent of second post.',
    });

    // Test GET /posts
    const listRes = await request(app).get('/posts');
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBe(2);

    // Test GET /posts/:id
    const singleRes = await request(app).get(`/posts/${p1.id}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.success).toBe(true);
    expect(singleRes.body.data.id).toBe(p1.id);
    expect(singleRes.body.data.title).toBe('First Post');
    expect(singleRes.body.data.content).toBe('Content of first post.');
    expect(singleRes.body.data.source_type).toBe('markdown');
    expect(singleRes.body.data.created_at).toBeDefined();
    expect(singleRes.body.data.updated_at).toBeDefined();

    // Test GET /posts/non-existent-id returns 404
    const notFoundRes = await request(app).get('/posts/non-existent-uuid');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.success).toBe(false);
    expect(notFoundRes.body.error.code).toBe('NOT_FOUND');
  });
});
