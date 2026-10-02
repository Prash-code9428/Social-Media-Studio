import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validator.js';

const ingestMarkdownSchema = z.object({
  title: z.string().optional(),
  markdown: z.string().min(1, 'Markdown content is required'),
  metadata: z.record(z.any()).optional(),
});

const ingestUrlSchema = z.object({
  url: z.string().url('A valid HTTP/HTTPS URL is required'),
});

const listPostsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const generateVariantsSchema = z.object({
  platforms: z.array(z.enum(['telegram', 'x', 'linkedin'])).optional(),
  tone: z.string().optional(),
});

const createCustomVariantSchema = z.object({
  platform: z.enum(['telegram', 'x', 'linkedin']),
  content: z.string().min(1, 'Content is required'),
  hashtags: z.array(z.string()).optional().default([]),
  tone: z.string().min(1, 'Tone is required'),
});

export function createPostsRouter(service) {
  const router = Router();

  // Ingest Markdown
  router.post('/ingest/markdown', validateBody(ingestMarkdownSchema), async (req, res, next) => {
    try {
      const post = await service.ingestMarkdown(req.validatedBody);
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  // Ingest URL
  router.post('/ingest/url', validateBody(ingestUrlSchema), async (req, res, next) => {
    try {
      const post = await service.ingestUrl(req.validatedBody);
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  // List Posts
  router.get('/', validateQuery(listPostsQuerySchema), (req, res, next) => {
    try {
      const posts = service.listPosts(req.validatedQuery);
      res.json({ success: true, data: posts });
    } catch (err) {
      next(err);
    }
  });

  // Get Single Post with Variants
  router.get('/:id', (req, res, next) => {
    try {
      const post = service.getPost(req.params.id);
      if (!post) {
        return res.status(404).json({ success: false, error: { message: 'Post not found', code: 'NOT_FOUND' } });
      }
      res.json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  // Generate Variants for Post
  router.post('/:id/generate-variants', validateBody(generateVariantsSchema), async (req, res, next) => {
    try {
      const variants = await service.generateVariantsForPost(req.params.id, req.validatedBody);
      res.status(201).json({ success: true, data: variants });
    } catch (err) {
      next(err);
    }
  });

  // Create Custom Variant for Post
  router.post('/:id/variants', validateBody(createCustomVariantSchema), async (req, res, next) => {
    try {
      const variant = await service.createCustomVariant(req.params.id, req.validatedBody);
      res.status(201).json({ success: true, data: variant });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
