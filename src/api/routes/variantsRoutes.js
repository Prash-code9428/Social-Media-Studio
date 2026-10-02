import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validator.js';

const updateVariantSchema = z.object({
  content: z.string().optional(),
  body: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  tone: z.string().optional(),
});

const rejectVariantSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

const scheduleVariantSchema = z
  .object({
    scheduled_for: z.string().datetime({ message: 'scheduled_for must be an ISO 8601 datetime string' }).optional(),
    scheduled_time: z.string().datetime({ message: 'scheduled_time must be an ISO 8601 datetime string' }).optional(),
    scheduledTime: z.string().datetime({ message: 'scheduledTime must be an ISO 8601 datetime string' }).optional(),
  })
  .refine(
    (data) => Boolean(data.scheduled_for || data.scheduled_time || data.scheduledTime),
    { message: 'scheduled_for or scheduled_time is required' }
  );

const listVariantsQuerySchema = z.object({
  postId: z.string().optional(),
  platform: z.string().optional(),
  status: z.enum(['draft', 'approved', 'rejected', 'published']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export function createVariantsRouter(service) {
  const router = Router();

  // List all variants: GET /variants
  router.get('/', validateQuery(listVariantsQuerySchema), (req, res, next) => {
    try {
      const variants = service.listVariants(req.validatedQuery);
      res.json({ success: true, data: variants });
    } catch (err) {
      next(err);
    }
  });

  // Get single variant: GET /variants/:id
  router.get('/:id', (req, res, next) => {
    try {
      const variant = service.getVariant(req.params.id);
      if (!variant) {
        return res.status(404).json({
          success: false,
          error: {
            message: `Variant not found with ID: ${req.params.id}`,
            code: 'NOT_FOUND',
          },
        });
      }
      res.json({ success: true, data: variant });
    } catch (err) {
      next(err);
    }
  });

  // Edit Variant: PATCH /variants/:id
  router.patch('/:id', validateBody(updateVariantSchema), async (req, res, next) => {
    try {
      const updated = await service.updateVariant(req.params.id, req.validatedBody);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  // Review Workflow: Approve Variant: POST /variants/:id/approve
  router.post('/:id/approve', async (req, res, next) => {
    try {
      const approved = await service.approveVariant(req.params.id);
      res.json({ success: true, data: approved });
    } catch (err) {
      next(err);
    }
  });

  // Review Workflow: Reject Variant: POST /variants/:id/reject
  router.post('/:id/reject', validateBody(rejectVariantSchema), async (req, res, next) => {
    try {
      const rejected = await service.rejectVariant(req.params.id, req.validatedBody.reason);
      res.json({ success: true, data: rejected });
    } catch (err) {
      next(err);
    }
  });

  // Schedule Variant: POST /variants/:id/schedule
  router.post('/:id/schedule', validateBody(scheduleVariantSchema), async (req, res, next) => {
    try {
      const scheduledTime = req.validatedBody.scheduled_for || req.validatedBody.scheduled_time || req.validatedBody.scheduledTime;
      const schedule = await service.scheduleVariant(req.params.id, scheduledTime);
      res.status(201).json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  });

  // Immediate Publish: POST /variants/:id/publish-now
  router.post('/:id/publish-now', async (req, res, next) => {
    try {
      const result = await service.publishNow(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
