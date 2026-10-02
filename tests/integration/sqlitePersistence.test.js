import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createDatabaseContext } from '../../src/db/index.js';
import { IngestionService } from '../../src/ingestion/ingestionService.js';

describe('SQLite Ingestion Persistence & SSOT Verification', () => {
  const testDbPath = path.resolve('./data/test_persistence.sqlite');

  afterAll(() => {
    // Cleanup temporary test DB files
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {}
  });

  it('should persist ingested markdown post directly into disk-backed SQLite database', async () => {
    const dbCtx = createDatabaseContext(testDbPath);
    const service = new IngestionService({ postsRepository: dbCtx.posts });

    const post = await service.ingestMarkdown({
      title: 'Persistent Storage Test',
      markdown: '# Persistent Storage Test\n\nVerifying that SQLite writes to disk with WAL mode enabled.',
      metadata: { author: 'Prashant', category: 'Engineering' },
    });

    expect(post.id).toBeDefined();

    // Close and reopen database connection from disk to prove persistence
    dbCtx.db.close();

    const reopenedCtx = createDatabaseContext(testDbPath);
    const persistedPost = reopenedCtx.posts.findById(post.id);

    expect(persistedPost).not.toBeNull();
    expect(persistedPost.id).toBe(post.id);
    expect(persistedPost.title).toBe('Persistent Storage Test');
    expect(persistedPost.source_type).toBe('markdown');
    expect(persistedPost.source_url).toBeNull();
    expect(persistedPost.content).toContain('Verifying that SQLite writes to disk');
    expect(persistedPost.metadata.author).toBe('Prashant');
    expect(persistedPost.created_at).toBeDefined();
    expect(persistedPost.updated_at).toBeDefined();

    reopenedCtx.db.close();
  });
});
