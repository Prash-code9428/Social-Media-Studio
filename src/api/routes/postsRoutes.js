import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validator.js';

// Unified Ingest Post Schema enforcing exactly one input source
const ingestPostSchema = z
  .object({
    title: z.string().optional(),
    markdown: z.string().optional(),
    url: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })
  .superRefine((data, ctx) => {
    const hasMarkdown = typeof data.markdown === 'string' && data.markdown.trim().length > 0;
    const hasUrl = typeof data.url === 'string' && data.url.trim().length > 0;

    if (!hasMarkdown && !hasUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exactly one input source is required: provide either "markdown" or "url"',
        path: ['markdown'],
      });
      return;
    }

    if (hasMarkdown && hasUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cannot provide both "markdown" and "url". Exactly one input source is required',
        path: ['url'],
      });
      return;
    }

    if (hasUrl) {
      try {
        const parsed = new URL(data.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'URL must have http:// or https:// protocol',
            path: ['url'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid URL format',
          path: ['url'],
        });
      }
    }
  });

const listPostsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const generateVariantsSchema = z.object({
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  regenerate: z.boolean().optional(),
});

const createCustomVariantSchema = z.object({
  platform: z.string().min(1, 'Platform is required'),
  content: z.string().optional(),
  body: z.string().optional(),
  hashtags: z.array(z.string()).optional().default([]),
  tone: z.string().optional().default('informative'),
}).superRefine((data, ctx) => {
  if (!data.content && !data.body) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Variant body/content is required',
      path: ['body'],
    });
  }
});

export function createPostsRouter(service) {
  const router = Router();

  // Unified Ingestion: POST /posts
  router.post('/', validateBody(ingestPostSchema), async (req, res, next) => {
    try {
      const { markdown, url, title, metadata } = req.validatedBody;
      let post;

      if (markdown) {
        post = await service.ingestMarkdown({ markdown, title, metadata });
      } else if (url) {
        post = await service.ingestUrl({ url });
      }

      res.status(201).json({
        success: true,
        data: {
          id: post.id,
          title: post.title,
          source_type: post.source_type,
          source_url: post.source_url,
          content: post.content,
          summary: post.summary,
          metadata: post.metadata,
          created_at: post.created_at,
          updated_at: post.updated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Dedicated Ingestion Sub-routes (backwards compatibility)
  router.post('/ingest/markdown', validateBody(ingestPostSchema), async (req, res, next) => {
    try {
      const post = await service.ingestMarkdown(req.validatedBody);
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  router.post('/ingest/url', validateBody(ingestPostSchema), async (req, res, next) => {
    try {
      const post = await service.ingestUrl(req.validatedBody);
      res.status(201).json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  // List Posts: GET /posts
  router.get('/', validateQuery(listPostsQuerySchema), (req, res, next) => {
    try {
      const posts = service.listPosts(req.validatedQuery);
      res.json({ success: true, data: posts });
    } catch (err) {
      next(err);
    }
  });

  // Get Single Post: GET /posts/:id
  router.get('/:id', (req, res, next) => {
    try {
      const post = service.getPost(req.params.id);
      if (!post) {
        return res.status(404).json({
          success: false,
          error: {
            message: `Post not found with ID: ${req.params.id}`,
            code: 'NOT_FOUND',
          },
        });
      }
      res.json({ success: true, data: post });
    } catch (err) {
      next(err);
    }
  });

  // Generate Variants for Post: POST /posts/:id/generate
  router.post('/:id/generate', validateBody(generateVariantsSchema), async (req, res, next) => {
    try {
      const variants = await service.generateVariantsForPost(req.params.id, req.validatedBody);
      res.status(201).json({ success: true, data: variants });
    } catch (err) {
      next(err);
    }
  });

  // Compatibility alias: POST /posts/:id/generate-variants
  router.post('/:id/generate-variants', validateBody(generateVariantsSchema), async (req, res, next) => {
    try {
      const variants = await service.generateVariantsForPost(req.params.id, req.validatedBody);
      res.status(201).json({ success: true, data: variants });
    } catch (err) {
      next(err);
    }
  });

  // Create Custom Variant for Post: POST /posts/:id/variants
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
