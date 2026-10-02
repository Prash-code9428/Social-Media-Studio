import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validator.js';

const updateVariantSchema = z.object({
  content: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  tone: z.string().optional(),
});

const rejectVariantSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

const scheduleVariantSchema = z.object({
  scheduled_time: z.string().datetime({ message: 'scheduled_time must be an ISO 8601 datetime string' }),
});

export function createVariantsRouter(service) {
  const router = Router();

  // Get Single Variant
  router.get('/:id', (req, res, next) => {
    try {
      const variant = service.dbCtx.variants.findById(req.params.id);
      if (!variant) {
        return res.status(404).json({ success: false, error: { message: 'Variant not found', code: 'NOT_FOUND' } });
      }
      res.json({ success: true, data: variant });
    } catch (err) {
      next(err);
    }
  });

  // Edit Variant (resets review status to draft, re-runs constraint validation)
  router.patch('/:id', validateBody(updateVariantSchema), async (req, res, next) => {
    try {
      const updated = await service.updateVariant(req.params.id, req.validatedBody);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  // Review Workflow: Approve Variant (Precondition: validation_status must be 'valid')
  router.post('/:id/approve', async (req, res, next) => {
    try {
      const approved = await service.approveVariant(req.params.id);
      res.json({ success: true, data: approved });
    } catch (err) {
      next(err);
    }
  });

  // Review Workflow: Reject Variant
  router.post('/:id/reject', validateBody(rejectVariantSchema), async (req, res, next) => {
    try {
      const rejected = await service.rejectVariant(req.params.id, req.validatedBody.reason);
      res.json({ success: true, data: rejected });
    } catch (err) {
      next(err);
    }
  });

  // Schedule Variant (Precondition: status must be 'approved')
  router.post('/:id/schedule', validateBody(scheduleVariantSchema), async (req, res, next) => {
    try {
      const schedule = await service.scheduleVariant(req.params.id, req.validatedBody.scheduled_time);
      res.status(201).json({ success: true, data: schedule });
    } catch (err) {
      next(err);
    }
  });

  // Immediate Publish (Precondition: status must be 'approved')
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
